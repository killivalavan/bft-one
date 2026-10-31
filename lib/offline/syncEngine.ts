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
      ? allOps.filter((o) => o.business_id === businessId)
      : allOps;
    pendingCount = filteredOps.filter((o) => o.status === "pending" || o.status === "syncing").length;
    failedCount = filteredOps.filter((o) => o.status === "failed" || o.status === "rejected").length;
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
  userId?: string | null;
  customId?: string;
}): Promise<SyncQueueItem> {
  const operationId = params.customId || crypto.randomUUID();
  let resolvedUserId = params.userId || null;
  let resolvedBusinessId = params.businessId;

  // If businessId or userId is missing/default, attempt resolution from current session
  if (!resolvedUserId || !resolvedBusinessId || resolvedBusinessId === "default") {
    try {
      const { data: { session } } = await supabaseClient.auth.getSession().catch(() => ({ data: { session: null } }));
      if (session?.user) {
        if (!resolvedUserId) resolvedUserId = session.user.id;
        if (!resolvedBusinessId || resolvedBusinessId === "default") {
          const { data: prof } = await supabaseClient
            .from("profiles")
            .select("business_id")
            .eq("id", session.user.id)
            .maybeSingle();
          if (prof?.business_id) {
            resolvedBusinessId = prof.business_id;
          }
        }
      }
    } catch {}
  }

  const isInvalidTenant = !resolvedBusinessId || resolvedBusinessId === "default" || !UUID_REGEX.test(resolvedBusinessId);

  const queueItem: SyncQueueItem = {
    id: operationId,
    client_operation_id: operationId,
    business_id: resolvedBusinessId || "unassigned",
    user_id: resolvedUserId,
    table_name: params.tableName,
    action: params.action,
    payload: params.payload,
    status: isInvalidTenant ? "rejected" : "pending",
    retry_count: 0,
    last_error: isInvalidTenant ? "Quarantined: Missing or unassigned business ID at time of mutation." : null,
    created_at: new Date().toISOString(),
  };

  await putItem<SyncQueueItem>(STORES.sync_queue, queueItem);
  emitSyncReport(resolvedBusinessId);

  // If online and tenant is valid, trigger background sync opportunistically
  if (!isInvalidTenant && typeof navigator !== "undefined" && navigator.onLine) {
    triggerBackgroundSync(resolvedBusinessId);
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

  // 1. Session verification: Offline mutations require an authenticated session
  let { data: { session } } = await supabaseClient.auth.getSession().catch(() => ({ data: { session: null } }));
  if (!session?.user) {
    const refreshed = await supabaseClient.auth.refreshSession().catch(() => ({ data: { session: null } }));
    session = refreshed.data?.session || null;
  }

  if (!session?.user?.id) {
    emitSyncReport(businessId);
    return {
      successCount: 0,
      failedCount: 0,
      errors: ["Authentication required: Cannot sync offline operations without an active session."],
    };
  }

  // 2. Resolve caller's authoritative tenant context
  let callerProf: { business_id?: string | null; is_super_admin?: boolean } | null = null;
  try {
    const { data: prof } = await supabaseClient
      .from("profiles")
      .select("business_id, is_super_admin")
      .eq("id", session.user.id)
      .maybeSingle();
    callerProf = prof;
  } catch (err: any) {
    console.warn("[SyncEngine] Failed to resolve user profile:", err);
  }

  if (!callerProf) {
    emitSyncReport(businessId);
    return {
      successCount: 0,
      failedCount: 0,
      errors: ["Cannot determine tenant authorization: profile not found."],
    };
  }

  const isSuperAdmin = Boolean(callerProf.is_super_admin);
  const userBizId = callerProf.business_id;

  if (!isSuperAdmin && (!userBizId || !UUID_REGEX.test(userBizId))) {
    emitSyncReport(businessId);
    return {
      successCount: 0,
      failedCount: 0,
      errors: ["Account has no valid business workspace assigned."],
    };
  }

  // Authoritative tenant for this sync batch
  const activeTenantId = isSuperAdmin
    ? (businessId && UUID_REGEX.test(businessId) ? businessId : userBizId)
    : userBizId;

  if (!activeTenantId) {
    emitSyncReport(businessId);
    return {
      successCount: 0,
      failedCount: 0,
      errors: ["No target business context resolved for sync."],
    };
  }

  // If a specific businessId was requested and caller is NOT super admin, ensure it matches userBizId
  if (!isSuperAdmin && businessId && businessId !== userBizId) {
    emitSyncReport(businessId);
    return {
      successCount: 0,
      failedCount: 0,
      errors: [`Tenant mismatch: Requested business (${businessId}) does not match active session business (${userBizId}).`],
    };
  }

  isCurrentlySyncing = true;
  currentLastError = null;
  emitSyncReport(activeTenantId);

  let successCount = 0;
  let failedCount = 0;
  const errors: string[] = [];

  try {
    const allOps = await getAllItems<SyncQueueItem>(STORES.sync_queue);

    // Quarantine any ops with unassigned or invalid business_id
    for (const op of allOps) {
      if ((!op.business_id || op.business_id === "default" || !UUID_REGEX.test(op.business_id)) && op.status !== "rejected") {
        op.status = "rejected";
        op.last_error = "Quarantined: Mutation has no valid tenant business ID.";
        await putItem<SyncQueueItem>(STORES.sync_queue, op);
      }
    }

    // STRICT MULTI-TENANT ISOLATION (TEN-01):
    // Only process operations that belong strictly to the active authenticated tenant.
    // Operations from other stores are left untouched in the queue for their respective sessions.
    const pendingOps = allOps.filter(
      (o) =>
        o.business_id === activeTenantId &&
        (o.status === "pending" || o.status === "failed") &&
        (o.retry_count || 0) < 5
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
        await executeCloudMutation(op, activeTenantId, session.user.id);
        op.status = "synced";
        op.synced_at = new Date().toISOString();
        op.last_error = null;
        await putItem<SyncQueueItem>(STORES.sync_queue, op);
        successCount++;
      } catch (err: any) {
        console.warn(`[SyncEngine] Error syncing ${op.table_name} (${op.id}):`, err);
        op.retry_count = (op.retry_count || 0) + 1;
        const errMessage: string = err?.message || String(err) || "Unknown sync error";
        op.last_error = errMessage;
        currentLastError = errMessage;

        // If permanent isolation violation or exceeded retry threshold, quarantine as rejected
        if (op.retry_count >= 5 || errMessage.includes("Tenant mismatch") || errMessage.includes("isolation violation")) {
          op.status = "rejected";
        } else {
          op.status = "failed";
        }

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
    emitSyncReport(activeTenantId);
  }

  return { successCount, failedCount, errors };
}

// ==========================================
// Cloud Mutation Dispatcher
// ==========================================

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function executeCloudMutation(
  op: SyncQueueItem,
  activeTenantId: string,
  sessionUserId: string
): Promise<void> {
  const { table_name, action, payload } = op;

  // Strict tenant boundary assertion:
  // Op must belong to activeTenantId, and activeTenantId must be a valid UUID
  if (!op.business_id || op.business_id !== activeTenantId || !UUID_REGEX.test(op.business_id)) {
    throw new Error(
      `Tenant isolation violation: Mutation business_id (${op.business_id}) does not match authorized session tenant (${activeTenantId}).`
    );
  }

  // Ensure payload's business_id strictly matches the authorized tenant
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    payload.business_id = activeTenantId;
  }

  switch (table_name) {
    case "orders": {
      if (action === "INSERT" || action === "UPDATE") {
        payload.business_id = activeTenantId;

        // Preserve original user_id if set on payload, or fall back to session user
        if (!payload.user_id) {
          payload.user_id = sessionUserId;
        }

        let { error } = await supabaseClient
          .from("orders")
          .upsert(payload, { onConflict: "id" });

        if (error) {
          // If error is due to optional columns not yet added to live DB (e.g. customer_name, payment_mode), fallback to core columns
          if (
            error.code === "PGRST204" ||
            error.message?.includes("column") ||
            error.message?.includes("schema cache")
          ) {
            console.warn("[SyncEngine] Retrying orders upsert with core schema:", error.message);
            const corePayload: any = {
              id: payload.id,
              total_cents: payload.total_cents ?? 0,
              status: payload.status || "completed",
              business_id: activeTenantId,
            };
            if (payload.user_id) corePayload.user_id = payload.user_id;
            if (payload.created_at) corePayload.created_at = payload.created_at;

            const { error: coreErr } = await supabaseClient
              .from("orders")
              .upsert(corePayload, { onConflict: "id" });
            if (coreErr) throw coreErr;
          } else {
            throw error;
          }
        }
      } else if (action === "DELETE") {
        const { error } = await supabaseClient.from("orders").delete().eq("id", payload.id).eq("business_id", activeTenantId);
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
            business_id: activeTenantId,
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
          console.warn("[SyncEngine] Skipped order_items sync for non-UUID sample items:", items);
        }
      }
      break;
    }

    case "stock_adjust": {
      const { getAuthHeaders } = await import("@/lib/auth/clientAuth");
      const headers = await getAuthHeaders();
      const res = await fetch("/api/stock/adjust", {
        method: "POST",
        headers,
        body: JSON.stringify({ ...payload, business_id: activeTenantId }),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "Stock adjust sync failed");
      }
      break;
    }

    case "stock_ledger": {
      if (action === "INSERT") {
        const { error } = await supabaseClient.from("stock_ledger").insert({
          ...payload,
          business_id: activeTenantId,
        });
        if (error && error.code !== "23505") throw error;
      }
      break;
    }

    case "purchase_order_items": {
      if (action === "INSERT" || action === "UPDATE") {
        const items = Array.isArray(payload) ? payload : [payload];
        const { error } = await supabaseClient
          .from("purchase_order_items")
          .upsert(items.map((i: any) => ({ ...i, business_id: activeTenantId })), { onConflict: "id" });
        if (error) throw error;
      }
      break;
    }

    default: {
      // Unified handler for daily_expenses, monthly_expenses, invoices, timesheets, leaves,
      // external_contacts/customers, suppliers, inventory_items, purchase_orders, etc.
      const targetTable = table_name === "customers" ? "external_contacts" : table_name;
      if (action === "INSERT" || action === "UPDATE") {
        const { error } = await supabaseClient.from(targetTable).upsert({ ...payload, business_id: activeTenantId }, { onConflict: "id" });
        if (error) throw error;
      } else if (action === "DELETE") {
        const { error } = await supabaseClient.from(targetTable).delete().eq("id", payload.id).eq("business_id", activeTenantId);
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
