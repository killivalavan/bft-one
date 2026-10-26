import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/serverAuth";

export const dynamic = "force-dynamic";

// POST { order_id: string }
export async function POST(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    if ("errorResponse" in auth) {
      return auth.errorResponse;
    }

    const { user: caller, supa } = auth;
    const callerBusinessId = caller.businessId;
    const isSuperAdmin = caller.isSuperAdmin;

    const body = (await req.json().catch(() => ({}))) as { order_id?: string };
    const order_id = body.order_id?.trim();
    if (!order_id) return NextResponse.json({ error: "order_id required" }, { status: 400 });

    // Fetch order to ensure it exists and belongs to caller's business
    const { data: ord, error: ordErr } = await supa
      .from("orders")
      .select("id, status, business_id")
      .eq("id", order_id)
      .maybeSingle();

    if (ordErr) return NextResponse.json({ error: ordErr.message }, { status: 500 });
    if (!ord) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    // Strict Tenant Boundary Check: fail closed if business_id is missing or belongs to another business
    if (!isSuperAdmin && (!ord.business_id || ord.business_id !== callerBusinessId)) {
      return NextResponse.json({ error: "Unauthorized: Cannot cancel order of another business" }, { status: 403 });
    }

    const targetBizId = ord.business_id || callerBusinessId;

    // Fetch items
    const { data: items, error: itemsErr } = await supa
      .from("order_items")
      .select("product_id, qty")
      .eq("order_id", order_id);
    if (itemsErr) return NextResponse.json({ error: itemsErr.message }, { status: 500 });

    // Restock each item
    const updates: Array<{ product_id: string; business_id: string; available_qty: number }> = [];
    for (const it of items || []) {
      const pid = it.product_id;
      const qty = Math.max(0, Math.floor(it.qty || 0));
      if (!pid || qty === 0) continue;
      const { data: s, error: sErr } = await supa
        .from("product_stocks")
        .select("available_qty")
        .eq("product_id", pid)
        .eq("business_id", targetBizId)
        .maybeSingle();
      if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });
      const before = s?.available_qty || 0;
      const after = before + qty;
      updates.push({ product_id: pid, business_id: targetBizId, available_qty: after });
    }

    if (updates.length > 0) {
      const { error: upErr } = await supa.from("product_stocks").upsert(updates, { onConflict: "product_id" });
      if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
    }

    // Mark order canceled
    const { error: updErr } = await supa.from("orders").update({ status: "canceled" }).eq("id", order_id);
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

    return NextResponse.json({ ok: true, restocked: updates.length });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "unknown" }, { status: 500 });
  }
}
