import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

// Body: { items: Array<{ product_id:string; qty:number }> }
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(()=>({})) as { items?: Array<{ product_id:string; qty:number }> };
    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length === 0) return NextResponse.json({ ok: true, skipped: true });

    // Sum quantities per product
    const usage = new Map<string, number>();
    for (const it of items) {
      if (!it?.product_id || !Number.isFinite(it?.qty)) continue;
      usage.set(it.product_id, (usage.get(it.product_id) || 0) + Math.max(0, Math.floor(it.qty)));
    }

    const ids = Array.from(usage.keys());
    const supa = supabaseAdmin();

    // Fetch stocks and products
    const [{ data: stocks }, { data: prods }] = await Promise.all([
      supa.from('product_stocks').select('product_id,max_qty,available_qty,notify_at_count').in('product_id', ids),
      supa.from('products').select('id,name').in('id', ids)
    ]);
    const nameById = new Map<string,string>((prods||[]).map((p:any)=>[p.id,p.name]));
    const stockById = new Map<string, any>((stocks||[]).map((s:any)=>[s.product_id, s]));

    const updates: any[] = [];
    const notifs: Array<{ product_id:string|null; message:string; kind:string; meta:any }> = [];

    for (const pid of ids) {
      const useQty = usage.get(pid) || 0;
      const s = stockById.get(pid) || { product_id: pid, max_qty: 0, available_qty: 0 };
      const before = s.available_qty || 0;
      const max = s.max_qty || 0;
      const after = Math.max(0, before - useQty);
      if (after === before) continue;
      updates.push({ product_id: pid, max_qty: max, available_qty: after });

      // notifications
      const custom = (s.notify_at_count ?? null) as number | null;
      const lowThreshold = custom && custom > 0 ? custom : null;
      const name = nameById.get(pid) || 'Product';
      // Low-stock only when a custom threshold is present
      if (lowThreshold !== null) {
        if (before > lowThreshold && after <= lowThreshold && after > 0) {
          notifs.push({ product_id: pid, kind: 'stock', message: `Low stock: ${name} remaining ${after} (threshold ${lowThreshold})`, meta: { remaining: after, threshold: lowThreshold } });
        }
      }
      // Out-of-stock always when crossing to zero
      if (before > 0 && after === 0) {
        notifs.push({ product_id: pid, kind: 'stock', message: `Out of stock: ${name}`, meta: { remaining: after, max } });
      }
    }

    // Upsert updates
    if (updates.length > 0) {
      const { error: upErr } = await supa.from('product_stocks').upsert(updates, { onConflict: 'product_id' });
      if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
    }
    // Insert notifications
    if (notifs.length > 0) {
      await supa.from('notifications').insert(notifs as any);
    }

    return NextResponse.json({ ok: true, updated: updates.length, notified: notifs.length });
  } catch (e:any) {
    return NextResponse.json({ error: e?.message || 'unknown' }, { status: 500 });
  }
}
