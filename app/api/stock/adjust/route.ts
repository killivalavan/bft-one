import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/serverAuth";

export const dynamic = "force-dynamic";

interface ProductRecord {
  id: string;
  name: string;
}

interface StockRecord {
  product_id: string;
  max_qty: number;
  available_qty: number;
  notify_at_count?: number | null;
}

interface StockUpdatePayload {
  product_id: string;
  business_id: string;
  max_qty: number;
  available_qty: number;
}

interface NotificationPayload {
  business_id: string;
  product_id: string | null;
  message: string;
  kind: string;
  meta: Record<string, unknown>;
}

// Body: { items: Array<{ product_id: string; qty: number }>; idempotency_key?: string; strict_stock?: boolean }
export async function POST(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    if ("errorResponse" in auth) {
      return auth.errorResponse;
    }

    const { user, supa } = auth;
    const callerBusinessId = user.businessId;

    if (!callerBusinessId) {
      return NextResponse.json({ error: "Tenant context missing or invalid" }, { status: 400 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      items?: Array<{ product_id: string; qty: number }>;
      idempotency_key?: string;
      strict_stock?: boolean;
    };
    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length === 0) return NextResponse.json({ ok: true, skipped: true });

    const idempotencyKey =
      (typeof body.idempotency_key === "string" && body.idempotency_key.trim()) ||
      req.headers.get("x-idempotency-key") ||
      null;

    // 1. Primary Path: Atomic Database-Side Stock & Recipe BOM Adjustment via RPC
    const { data: rpcResult, error: rpcErr } = await supa.rpc("adjust_pos_stock_atomic", {
      p_business_id: callerBusinessId,
      p_items: items,
      p_user_id: user.id || null,
      p_idempotency_key: idempotencyKey,
      p_strict_stock: Boolean(body.strict_stock),
    });

    if (!rpcErr) {
      return NextResponse.json(rpcResult || { ok: true });
    }

    // If error was strict stock shortage, return 400 bad request immediately
    if (rpcErr.message && rpcErr.message.includes("INSUFFICIENT_STOCK")) {
      return NextResponse.json({ error: rpcErr.message, code: "INSUFFICIENT_STOCK" }, { status: 400 });
    }

    // If RPC does not exist in the database (e.g. pending migration), log warning and proceed to safe fallback
    const isRpcMissing =
      rpcErr.code === "42883" ||
      rpcErr.code === "PGRST202" ||
      (rpcErr.message && rpcErr.message.includes("adjust_pos_stock_atomic"));

    if (!isRpcMissing) {
      return NextResponse.json({ error: rpcErr.message }, { status: 500 });
    }

    console.warn("adjust_pos_stock_atomic RPC not detected; executing tenant-scoped application fallback.");

    // 2. Application Fallback (Tenant Scoped & Clamped to Non-Negative)
    const usage = new Map<string, number>();
    for (const it of items) {
      if (!it?.product_id || !Number.isFinite(it?.qty)) continue;
      usage.set(it.product_id, (usage.get(it.product_id) || 0) + Math.max(0, Math.floor(it.qty)));
    }

    const ids = Array.from(usage.keys());

    // Fetch stocks and products strictly scoped to tenant
    const [{ data: rawStocks }, { data: rawProds }] = await Promise.all([
      supa
        .from("product_stocks")
        .select("product_id,max_qty,available_qty,notify_at_count")
        .in("product_id", ids)
        .eq("business_id", callerBusinessId),
      supa
        .from("products")
        .select("id,name")
        .in("id", ids)
        .eq("business_id", callerBusinessId),
    ]);

    const prods = (rawProds || []) as unknown as ProductRecord[];
    const stocks = (rawStocks || []) as unknown as StockRecord[];

    const nameById = new Map<string, string>(prods.map((p) => [p.id, p.name]));
    const stockById = new Map<string, StockRecord>(stocks.map((s) => [s.product_id, s]));

    const updates: StockUpdatePayload[] = [];
    const notifs: NotificationPayload[] = [];

    for (const pid of ids) {
      const useQty = usage.get(pid) || 0;
      const s = stockById.get(pid) || { product_id: pid, max_qty: 0, available_qty: 0 };
      const before = s.available_qty || 0;
      const max = s.max_qty || 0;
      const after = Math.max(0, before - useQty);
      if (after === before) continue;
      updates.push({ product_id: pid, business_id: callerBusinessId, max_qty: max, available_qty: after });

      // notifications
      const custom = (s.notify_at_count ?? null) as number | null;
      const lowThreshold = custom && custom > 0 ? custom : null;
      const name = nameById.get(pid) || "Product";

      // Low-stock only when a custom threshold is present
      if (lowThreshold !== null) {
        if (before > lowThreshold && after <= lowThreshold && after > 0) {
          notifs.push({
            business_id: callerBusinessId,
            product_id: pid,
            kind: "stock",
            message: `Low stock: ${name} remaining ${after} (threshold ${lowThreshold})`,
            meta: { remaining: after, threshold: lowThreshold },
          });
        }
      }
      // Out-of-stock always when crossing to zero
      if (before > 0 && after === 0) {
        notifs.push({
          business_id: callerBusinessId,
          product_id: pid,
          kind: "stock",
          message: `Out of stock: ${name}`,
          meta: { remaining: after, max },
        });
      }
    }

    // Upsert updates with business_id scoping
    if (updates.length > 0) {
      const { error: upErr } = await supa.from("product_stocks").upsert(updates, { onConflict: "product_id" });
      if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
    }
    // Insert notifications
    if (notifs.length > 0) {
      await supa.from("notifications").insert(notifs);
    }

    // Recipe BOM Auto-Deduction for Inventory Items
    try {
      const { data: recipes } = await supa
        .from("item_recipes")
        .select("product_id, inventory_item_id, quantity_required, waste_factor_pct")
        .in("product_id", ids)
        .eq("business_id", callerBusinessId);

      if (recipes && recipes.length > 0) {
        const invDeductions = new Map<string, number>();
        for (const r of recipes) {
          const soldQty = usage.get(r.product_id) || 0;
          if (soldQty <= 0) continue;
          const wasteFactor = 1 + (r.waste_factor_pct || 0) / 100;
          const totalIngQty = (Number(r.quantity_required) || 0) * soldQty * wasteFactor;
          invDeductions.set(r.inventory_item_id, (invDeductions.get(r.inventory_item_id) || 0) + totalIngQty);
        }

        const invIds = Array.from(invDeductions.keys());
        if (invIds.length > 0) {
          const { data: invItems } = await supa
            .from("inventory_items")
            .select("id, current_stock, cost_per_unit")
            .in("id", invIds)
            .eq("business_id", callerBusinessId);

          if (invItems) {
            for (const item of invItems) {
              const deduct = invDeductions.get(item.id) || 0;
              const cur = Number(item.current_stock) || 0;
              const next = Math.max(0, cur - deduct);
              await supa
                .from("inventory_items")
                .update({ current_stock: next, updated_at: new Date().toISOString() })
                .eq("id", item.id)
                .eq("business_id", callerBusinessId);

              await supa.from("stock_ledger").insert({
                business_id: callerBusinessId,
                inventory_item_id: item.id,
                transaction_type: "POS_CONSUMPTION",
                quantity_delta: -deduct,
                balance_after: next,
                unit_cost: item.cost_per_unit,
                reason: "POS Order Auto-Deduction (Recipe BOM)",
                created_by: user.id,
              });
            }
          }
        }
      }
    } catch (recipeErr) {
      console.error("Recipe auto-deduction error:", recipeErr);
    }

    return NextResponse.json({ ok: true, updated: updates.length, notified: notifs.length });
  } catch (e: unknown) {
    const errorMsg = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
