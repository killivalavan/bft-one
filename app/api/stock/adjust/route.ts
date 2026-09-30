import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/serverAuth";
import { supabaseAdmin } from "@/lib/supabaseServer";

// Body: { items: Array<{ product_id:string; qty:number }> }
export async function POST(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    let supa = supabaseAdmin();
    let callerBusinessId = "a0000000-0000-0000-0000-000000000001";

    if (!("errorResponse" in auth)) {
      supa = auth.supa;
      callerBusinessId = auth.user.businessId;
    }

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

    // Recipe BOM Auto-Deduction for Inventory Items
    try {
      const { data: recipes } = await supa
        .from('item_recipes')
        .select('product_id, inventory_item_id, quantity_required, waste_factor_pct')
        .in('product_id', ids);

      if (recipes && recipes.length > 0) {
        const invDeductions = new Map<string, number>();
        for (const r of recipes) {
          const soldQty = usage.get(r.product_id) || 0;
          if (soldQty <= 0) continue;
          const wasteFactor = 1 + ((r.waste_factor_pct || 0) / 100);
          const totalIngQty = (Number(r.quantity_required) || 0) * soldQty * wasteFactor;
          invDeductions.set(r.inventory_item_id, (invDeductions.get(r.inventory_item_id) || 0) + totalIngQty);
        }

        const invIds = Array.from(invDeductions.keys());
        if (invIds.length > 0) {
          const { data: invItems } = await supa
            .from('inventory_items')
            .select('id, current_stock, cost_per_unit')
            .in('id', invIds);

          if (invItems) {
            for (const item of invItems) {
              const deduct = invDeductions.get(item.id) || 0;
              const cur = Number(item.current_stock) || 0;
              const next = Math.max(0, cur - deduct);
              await supa
                .from('inventory_items')
                .update({ current_stock: next, updated_at: new Date().toISOString() })
                .eq('id', item.id);

              await supa.from('stock_ledger').insert({
                business_id: callerBusinessId,
                inventory_item_id: item.id,
                transaction_type: 'POS_CONSUMPTION',
                quantity_delta: -deduct,
                balance_after: next,
                unit_cost: item.cost_per_unit,
                reason: 'POS Order Auto-Deduction (Recipe BOM)',
              });
            }
          }
        }
      }
    } catch (recipeErr) {
      console.error('Recipe auto-deduction error:', recipeErr);
    }

    return NextResponse.json({ ok: true, updated: updates.length, notified: notifs.length });
  } catch (e:any) {
    return NextResponse.json({ error: e?.message || 'unknown' }, { status: 500 });
  }
}
