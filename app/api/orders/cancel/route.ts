import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

// POST { order_id: string }
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(()=>({})) as { order_id?: string };
    const order_id = body.order_id?.trim();
    if (!order_id) return NextResponse.json({ error: "order_id required" }, { status: 400 });

    const supa = supabaseAdmin();

    // fetch order to ensure exists and is cancelable (pending)
    const { data: ord, error: ordErr } = await supa
      .from("orders")
      .select("id,status")
      .eq("id", order_id)
      .maybeSingle();
    if (ordErr) return NextResponse.json({ error: ordErr.message }, { status: 500 });
    if (!ord) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    // fetch items
    const { data: items, error: itemsErr } = await supa
      .from("order_items")
      .select("product_id, qty")
      .eq("order_id", order_id);
    if (itemsErr) return NextResponse.json({ error: itemsErr.message }, { status: 500 });

    // restock each item
    const updates: Array<{ product_id: string; available_qty: number }> = [];
    for (const it of items || []) {
      const pid = it.product_id;
      const qty = Math.max(0, Math.floor(it.qty||0));
      if (!pid || qty === 0) continue;
      const { data: s, error: sErr } = await supa
        .from('product_stocks')
        .select('available_qty')
        .eq('product_id', pid)
        .maybeSingle();
      if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });
      const before = s?.available_qty || 0;
      const after = before + qty;
      updates.push({ product_id: pid, available_qty: after });
    }

    if (updates.length > 0) {
      const { error: upErr } = await supa.from('product_stocks').upsert(updates, { onConflict: 'product_id' });
      if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
    }

    // mark order canceled
    const { error: updErr } = await supa.from('orders').update({ status: 'canceled' }).eq('id', order_id);
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

    // Clear notifications for these products if now healthy
    try {
      await fetch(process.env.NEXT_PUBLIC_BASE_URL ? `${process.env.NEXT_PUBLIC_BASE_URL}/api/notifications/reconcile` : `http://localhost:3000/api/notifications/reconcile`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ product_ids: updates.map(u=>u.product_id) })
      });
    } catch {}

    return NextResponse.json({ ok: true, restocked: updates.length });
  } catch (e:any) {
    return NextResponse.json({ error: e?.message || 'unknown' }, { status: 500 });
  }
}
