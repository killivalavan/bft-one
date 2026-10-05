/**
 * SeyalPro Offline Synchronization Engine
 * Handles Queueing, Idempotent Processing, Dependency Ordering,
 * Inventory Event Reconciliation, and Master Data Warming.
 */

import { supabaseClient } from "@/lib/supabaseClient";
import {
  STORES,
  SyncQueueItem,
  getItem,
  putItem,
  getAllItems,
  deleteItem,
  bulkPutItems,
  getItemsByTenant,
  setMeta,
  getMeta,
  LocalProduct,
  LocalCategory,
  LocalProductStock,
  LocalInventoryItem,
  LocalSupplier,
  LocalCustomer,
  LocalDailyExpense,
  LocalInvoice,
  LocalTimesheet,
  LocalLeave,
} from "./db";

// Types
export type SyncState = "idle" | "syncing" | "error" | "synced";

export interface SyncStatusReport {
  isOnline: boolean;
  syncState: SyncState;
  pendingCount: number;
  failedCount: number;
  lastSyncTime: Date | null;
  lastError: string | null;
}

type SyncListener = (report: SyncStatusReport) => void;
const listeners = new Set<SyncListener>();

let isCurrentlySyncing = false;
let lastSyncTimestamp: Date | null = null;
let currentLastError: string | null = null;

// ==========================================
// Listener Registration & Broadcasting
// ==========================================

export function subscribeToSyncEngine(listener: SyncListener): () => void {
  listeners.add(listener);
  // Send initial report immediately
  emitSyncReport();
  return () => {
    listeners.delete(listener);
  };
}

// Global browser connectivity broadcast
if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    emitSyncReport();
    triggerBackgroundSync(undefined, 300);
  });
  window.addEventListener("offline", () => {
    emitSyncReport();
  });
}

export async function getSyncReport(businessId?: string): Promise<SyncStatusReport> {
  const isOnline = typeof navigator !== "undefined" ? navigator.onLine : true;
  let pendingCount = 0;
  let failedCount = 0;

  try {
    const allOps = await getAllItems<SyncQueueItem>(STORES.sync_queue);
    const filteredOps = businessId
      ? allOps.filter((o) => o.business_id === businessId || o.business_id === "default" || !o.business_id)
      : allOps;
    pendingCount = filteredOps.filter((o) => o.status === "pending" || o.status === "syncing").length;
    failedCount = filteredOps.filter((o) => o.status === "failed").length;
  } catch {}

  const lastSyncStr = await getMeta<string>("last_sync_timestamp");
  const lastSync = lastSyncStr ? new Date(lastSyncStr) : lastSyncTimestamp;

  let state: SyncState = "synced";
  if (isCurrentlySyncing) state = "syncing";
  else if (failedCount > 0) state = "error";
  else if (pendingCount > 0) state = "idle";

  return {
    isOnline,
    syncState: state,
    pendingCount,
    failedCount,
    lastSyncTime: lastSync,
    lastError: currentLastError,
  };
}

async function emitSyncReport(businessId?: string) {
  const report = await getSyncReport(businessId);
  listeners.forEach((l) => {
    try {
      l(report);
    } catch (e) {
      console.error("Sync listener error:", e);
    }
  });
}

// ==========================================
// Network Health Verification
// ==========================================

export async function checkServerReachability(): Promise<boolean> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return false;
  }
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(`/api/health?t=${Date.now()}`, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return res.ok;
  } catch (e) {
    // If browser reports online, assume reachable as fallback during development/transient delays
    if (typeof navigator !== "undefined" && navigator.onLine) {
      return true;
    }
    return false;
  }
}

// ==========================================
// Enqueue Offline Mutations
// ==========================================

export async function enqueueSyncOperation(params: {
  businessId: string;
  tableName: string;
  action: "INSERT" | "UPDATE" | "DELETE" | "RPC";
  payload: any;
  customId?: string;
}): Promise<SyncQueueItem> {
  const operationId = params.customId || crypto.randomUUID();
  const queueItem: SyncQueueItem = {
    id: operationId,
    client_operation_id: operationId,
    business_id: params.businessId,
    table_name: params.tableName,
    action: params.action,
    payload: params.payload,
    status: "pending",
    retry_count: 0,
    created_at: new Date().toISOString(),
  };

  await putItem<SyncQueueItem>(STORES.sync_queue, queueItem);
  emitSyncReport(params.businessId);

  // If online, trigger background sync opportunistically
  if (typeof navigator !== "undefined" && navigator.onLine) {
    triggerBackgroundSync(params.businessId);
  }

  return queueItem;
}

// ==========================================
// Sync Queue Processor with Safe Ordering
// ==========================================

// Dependency priority: lower index runs first
const TABLE_PRIORITY: Record<string, number> = {
  external_contacts: 10,
  customers: 10,
  suppliers: 15,
  categories: 20,
  products: 25,
  inventory_items: 30,
  item_recipes: 35,
  purchase_orders: 40,
  purchase_order_items: 45,
  orders: 50,
  order_items: 55,
  stock_ledger: 60,
  product_stocks: 65,
  daily_expenses: 70,
  monthly_expenses: 75,
  timesheets: 80,
  leaves: 85,
  invoices: 90,
};

export async function processSyncQueue(businessId?: string): Promise<{
  successCount: number;
  failedCount: number;
  errors: string[];
}> {
  if (isCurrentlySyncing) {
    return { successCount: 0, failedCount: 0, errors: ["Sync already in progress"] };
  }

  const isReachable = await checkServerReachability();
  if (!isReachable) {
    emitSyncReport(businessId);
    return { successCount: 0, failedCount: 0, errors: ["Server unreachable or offline"] };
  }

  isCurrentlySyncing = true;
  currentLastError = null;
  emitSyncReport(businessId);

  let successCount = 0;
  let failedCount = 0;
  const errors: string[] = [];

  try {
    const allOps = await getAllItems<SyncQueueItem>(STORES.sync_queue);
    const pendingOps = allOps.filter(
      (o) =>
        (!businessId || o.business_id === businessId || o.business_id === "default" || !o.business_id) &&
        (o.status === "pending" || o.status === "failed")
    );

    // Sort by dependency priority then creation timestamp
    pendingOps.sort((a, b) => {
      const prioA = TABLE_PRIORITY[a.table_name] || 100;
      const prioB = TABLE_PRIORITY[b.table_name] || 100;
      if (prioA !== prioB) return prioA - prioB;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });

    for (const op of pendingOps) {
      op.status = "syncing";
      await putItem<SyncQueueItem>(STORES.sync_queue, op);

      try {
        await executeCloudMutation(op);
        op.status = "synced";
        op.synced_at = new Date().toISOString();
        op.last_error = null;
        await putItem<SyncQueueItem>(STORES.sync_queue, op);
        successCount++;
      } catch (err: any) {
        console.warn(`[SyncEngine] Error syncing ${op.table_name} (${op.id}):`, err);
        op.status = "failed";
        op.retry_count = (op.retry_count || 0) + 1;
        const errMessage: string = err?.message || String(err) || "Unknown sync error";
        op.last_error = errMessage;
        currentLastError = errMessage;
        await putItem<SyncQueueItem>(STORES.sync_queue, op);
        failedCount++;
        errors.push(`${op.table_name}: ${errMessage}`);
      }
    }

    if (successCount > 0) {
      lastSyncTimestamp = new Date();
      await setMeta("last_sync_timestamp", lastSyncTimestamp.toISOString());
    }
  } catch (globalErr: any) {
    currentLastError = globalErr?.message || "Sync processing error";
    errors.push(currentLastError!);
  } finally {
    isCurrentlySyncing = false;
    emitSyncReport(businessId);
  }

  return { successCount, failedCount, errors };
}

// ==========================================
// Cloud Mutation Dispatcher
// ==========================================

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_BUSINESS_UUID = "a0000000-0000-0000-0000-000000000001";

async function getEffectiveBusinessId(requestedBizId?: string): Promise<string> {
  try {
    let { data: { session } } = await supabaseClient.auth.getSession().catch(() => ({ data: { session: null } }));
    if (!session?.user) {
      const refreshed = await supabaseClient.auth.refreshSession().catch(() => ({ data: { session: null } }));
      session = refreshed.data?.session || null;
    }

    if (session?.user?.id) {
      let prof: { business_id?: any; is_super_admin?: any } | null = null;
      try {
        const res = await supabaseClient
          .from("profiles")
          .select("business_id, is_super_admin")
          .eq("id", session.user.id)
          .maybeSingle();
        prof = res.data;
      } catch {}

      if (prof?.business_id) {
        if (prof.is_super_admin && requestedBizId && UUID_REGEX.test(requestedBizId) && requestedBizId !== "default") {
          return requestedBizId;
        }
        return prof.business_id;
      }
    }
  } catch (e) {
    console.warn("[SyncEngine] Failed to resolve user profile business_id:", e);
  }

  if (requestedBizId && UUID_REGEX.test(requestedBizId) && requestedBizId !== "default") {
    return requestedBizId;
  }
  return DEFAULT_BUSINESS_UUID;
}

async function executeCloudMutation(op: SyncQueueItem): Promise<void> {
  const { table_name, action, payload } = op;
  const effectiveBizId = await getEffectiveBusinessId(op.business_id);

  // Auto-sanitize top-level business_id on payload if applicable
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    if (!payload.business_id || !UUID_REGEX.test(payload.business_id) || payload.business_id === "default") {
      payload.business_id = effectiveBizId;
    }
  }

  switch (table_name) {
    case "orders": {
      if (action === "INSERT" || action === "UPDATE") {
        payload.business_id = effectiveBizId;

        const { data: { session } } = await supabaseClient.auth.getSession().catch(() => ({ data: { session: null } }));
        if (!payload.user_id && session?.user?.id) {
          payload.user_id = session.user.id;
        }

        let { error } = await supabaseClient
          .from("orders")
          .upsert(payload, { onConflict: "id" });

        if (error) {
          // If RLS violation, attempt one-time retry with profile's live business_id
          if (error.message?.includes("row-level security policy") && session?.user?.id) {
            let prof: { business_id?: any } | null = null;
            try {
              const res = await supabaseClient
                .from("profiles")
                .select("business_id")
                .eq("id", session.user.id)
                .maybeSingle();
              prof = res.data;
            } catch {}

            if (prof?.business_id && prof.business_id !== payload.business_id) {
              console.warn(`[SyncEngine] RLS violation recovery with profile business_id ${prof.business_id}`);
              payload.business_id = prof.business_id;
              const retryRes = await supabaseClient
                .from("orders")
                .upsert(payload, { onConflict: "id" });
              error = retryRes.error;
            }
          }

          // If error is due to optional columns not yet added to live DB (e.g. customer_name, payment_mode), fallback to core columns
          if (
            error &&
            (error.code === "PGRST204" ||
              error.message?.includes("column") ||
              error.message?.includes("schema cache"))
          ) {
            console.warn("[SyncEngine] Retrying orders upsert with core schema:", error.message);
            const corePayload: any = {
              id: payload.id,
              total_cents: payload.total_cents ?? 0,
              status: payload.status || "completed",
              business_id: payload.business_id,
            };
            if (payload.user_id) corePayload.user_id = payload.user_id;
            if (payload.created_at) corePayload.created_at = payload.created_at;

            const { error: coreErr } = await supabaseClient
              .from("orders")
              .upsert(corePayload, { onConflict: "id" });
            if (coreErr) throw coreErr;
          } else if (error) {
            throw error;
          }
        }
      } else if (action === "DELETE") {
        const { error } = await supabaseClient.from("orders").delete().eq("id", payload.id);
        if (error) throw error;
      }
      break;
    }

    case "order_items": {
      if (action === "INSERT") {
        const items = Array.isArray(payload) ? payload : [payload];
        // Filter items with valid UUID product_ids and ensure valid business_id
        const validItems = items
          .filter((item: any) => item.product_id && UUID_REGEX.test(item.product_id))
          .map((item: any) => ({
            ...item,
            business_id:
              item.business_id && UUID_REGEX.test(item.business_id) && item.business_id !== "default"
                ? item.business_id
                : effectiveBizId,
          }));

        if (validItems.length > 0) {
          const { error } = await supabaseClient.from("order_items").upsert(validItems, { onConflict: "id" });
          if (error) {
            // If FK violation because product does not exist in DB (e.g. sample items), log warning rather than halting sync
            if (error.code === "23503" || error.message?.includes("foreign key")) {
              console.warn("[SyncEngine] FK notice on order_items sync:", error.message);
            } else {
              throw error;
            }
          }
        } else {
          // Items were demo/sample non-UUID products (e.g. "demo-t3"), gracefully skip
          console.warn("[SyncEngine] Skipped order_items sync for non-UUID sample items:", items);
        }
      }
      break;
    }

    case "stock_adjust": {
      // Direct call to stock adjustment API route or RPC
      const res = await fetch("/api/stock/adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "Stock adjust sync failed");
      }
      break;
    }

    case "stock_ledger": {
      if (action === "INSERT") {
        const { error } = await supabaseClient.from("stock_ledger").insert(payload);
        if (error && error.code !== "23505") throw error;
      }
      break;
    }

    case "daily_expenses": {
      if (action === "INSERT" || action === "UPDATE") {
        const { error } = await supabaseClient
          .from("daily_expenses")
          .upsert(payload, { onConflict: "id" });
        if (error) throw error;
      } else if (action === "DELETE") {
        const { error } = await supabaseClient.from("daily_expenses").delete().eq("id", payload.id);
        if (error) throw error;
      }
      break;
    }

    case "monthly_expenses": {
      if (action === "INSERT" || action === "UPDATE") {
        const { error } = await supabaseClient
          .from("monthly_expenses")
          .upsert(payload, { onConflict: "id" });
        if (error) throw error;
      } else if (action === "DELETE") {
        const { error } = await supabaseClient.from("monthly_expenses").delete().eq("id", payload.id);
        if (error) throw error;
      }
      break;
    }

    case "invoices": {
      if (action === "INSERT" || action === "UPDATE") {
        const { error } = await supabaseClient
          .from("invoices")
          .upsert(payload, { onConflict: "id" });
        if (error) throw error;
      } else if (action === "DELETE") {
        const { error } = await supabaseClient.from("invoices").delete().eq("id", payload.id);
        if (error) throw error;
      }
      break;
    }

    case "timesheets": {
      if (action === "INSERT" || action === "UPDATE") {
        const { error } = await supabaseClient
          .from("timesheets")
          .upsert(payload, { onConflict: "id" });
        if (error) throw error;
      }
      break;
    }

    case "leaves": {
      if (action === "INSERT" || action === "UPDATE") {
        const { error } = await supabaseClient
          .from("leaves")
          .upsert(payload, { onConflict: "id" });
        if (error) throw error;
      }
      break;
    }

    case "external_contacts":
    case "customers": {
      const targetTable = "external_contacts";
      if (action === "INSERT" || action === "UPDATE") {
        const { error } = await supabaseClient
          .from(targetTable)
          .upsert(payload, { onConflict: "id" });
        if (error) throw error;
      } else if (action === "DELETE") {
        const { error } = await supabaseClient.from(targetTable).delete().eq("id", payload.id);
        if (error) throw error;
      }
      break;
    }

    case "suppliers": {
      if (action === "INSERT" || action === "UPDATE") {
        const { error } = await supabaseClient
          .from("suppliers")
          .upsert(payload, { onConflict: "id" });
        if (error) throw error;
      }
      break;
    }

    case "inventory_items": {
      if (action === "INSERT" || action === "UPDATE") {
        const { error } = await supabaseClient
          .from("inventory_items")
          .upsert(payload, { onConflict: "id" });
        if (error) throw error;
      }
      break;
    }

    case "purchase_orders": {
      if (action === "INSERT" || action === "UPDATE") {
        const { error } = await supabaseClient
          .from("purchase_orders")
          .upsert(payload, { onConflict: "id" });
        if (error) throw error;
      }
      break;
    }

    case "purchase_order_items": {
      if (action === "INSERT" || action === "UPDATE") {
        const items = Array.isArray(payload) ? payload : [payload];
        const { error } = await supabaseClient
          .from("purchase_order_items")
          .upsert(items, { onConflict: "id" });
        if (error) throw error;
      }
      break;
    }

    default: {
      // Generic Supabase handler fallback
      if (action === "INSERT" || action === "UPDATE") {
        const { error } = await supabaseClient.from(table_name).upsert(payload, { onConflict: "id" });
        if (error) throw error;
      } else if (action === "DELETE") {
        const { error } = await supabaseClient.from(table_name).delete().eq("id", payload.id);
        if (error) throw error;
      }
    }
  }
}

// Debounced background sync trigger
let bgSyncTimer: NodeJS.Timeout | null = null;
export function triggerBackgroundSync(businessId?: string, delayMs = 1500) {
  if (bgSyncTimer) clearTimeout(bgSyncTimer);
  bgSyncTimer = setTimeout(() => {
    processSyncQueue(businessId);
  }, delayMs);
}

// ==========================================
// Cloud Master Data Warmup & Local Refresh
// ==========================================

export async function pullCloudMasterData(businessId: string): Promise<void> {
  if (!businessId) return;
  const reachable = await checkServerReachability();
  if (!reachable) return;

  try {
    // 1. Fetch Categories & Products & Stocks
    const [catsRes, prodsRes, stocksRes, invRes, suppRes, custRes] = await Promise.all([
      supabaseClient.from("categories").select("*").eq("business_id", businessId),
      supabaseClient.from("products").select("*").eq("business_id", businessId).eq("active", true),
      supabaseClient.from("product_stocks").select("*").eq("business_id", businessId),
      supabaseClient.from("inventory_items").select("*").eq("business_id", businessId).eq("is_active", true),
      supabaseClient.from("suppliers").select("*").eq("business_id", businessId).eq("is_active", true),
      supabaseClient.from("external_contacts").select("*").eq("business_id", businessId),
    ]);

    if (catsRes.data && catsRes.data.length > 0) {
      const localCats: LocalCategory[] = catsRes.data.map((c: any) => ({
        id: c.id,
        business_id: businessId,
        name: c.name,
        icon_url: c.icon_url,
        icon_emoji: c.icon_emoji || "📦",
        updated_at: c.updated_at,
      }));
      await bulkPutItems(STORES.categories, localCats);
    }

    if (prodsRes.data && prodsRes.data.length > 0) {
      const localProds: LocalProduct[] = prodsRes.data.map((p: any) => ({
        id: p.id,
        business_id: businessId,
        name: p.name,
        price_cents: p.price_cents,
        category_id: p.category_id,
        unit_label: p.unit_label,
        subtitle: p.subtitle,
        image_url: p.image_url,
        active: p.active !== false,
        updated_at: p.updated_at,
      }));
      await bulkPutItems(STORES.products, localProds);
    }

    if (stocksRes.data && stocksRes.data.length > 0) {
      const localStocks: LocalProductStock[] = stocksRes.data.map((s: any) => ({
        product_id: s.product_id,
        business_id: businessId,
        available_qty: Number(s.available_qty) || 0,
        max_qty: Number(s.max_qty) || 0,
        notify_at_count: s.notify_at_count,
        updated_at: s.updated_at,
      }));
      await bulkPutItems(STORES.product_stocks, localStocks);
    }

    if (invRes.data && invRes.data.length > 0) {
      const localInv: LocalInventoryItem[] = invRes.data.map((i: any) => ({
        id: i.id,
        business_id: businessId,
        name: i.name,
        sku: i.sku,
        category: i.category,
        unit: i.unit,
        cost_per_unit: Number(i.cost_per_unit) || 0,
        current_stock: Number(i.current_stock) || 0,
        min_reorder_level: Number(i.min_reorder_level) || 0,
        is_active: i.is_active !== false,
        updated_at: i.updated_at,
      }));
      await bulkPutItems(STORES.inventory_items, localInv);
    }

    if (suppRes.data && suppRes.data.length > 0) {
      const localSupp: LocalSupplier[] = suppRes.data.map((s: any) => ({
        id: s.id,
        business_id: businessId,
        name: s.name,
        contact_person: s.contact_person,
        phone: s.phone,
        email: s.email,
        payment_terms: s.payment_terms,
        lead_time_days: s.lead_time_days,
        is_active: s.is_active !== false,
        updated_at: s.updated_at,
      }));
      await bulkPutItems(STORES.suppliers, localSupp);
    }

    if (custRes.data && custRes.data.length > 0) {
      const localCust: LocalCustomer[] = custRes.data.map((c: any) => ({
        id: c.id,
        business_id: businessId,
        name: c.name,
        phone: c.phone,
        role: c.role,
        updated_at: c.updated_at,
      }));
      await bulkPutItems(STORES.customers, localCust);
    }

    await setMeta(`last_warmup_${businessId}`, new Date().toISOString());
  } catch (warmupErr) {
    console.warn("[SyncEngine] Master data warmup skipped:", warmupErr);
  }
}
