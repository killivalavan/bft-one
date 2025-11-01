"use client";
import { useEffect, useMemo, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { Card, CardContent } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

type Category = { id:string; name:string };
type Product = { id:string; name:string; image_url:string|null; category_id:string };

type Stock = { product_id:string; max_qty:number; available_qty:number; notify_at_count?: number|null };

export default function StockManagerPage(){
  const [allowed, setAllowed] = useState<null|boolean>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCat, setActiveCat] = useState<string|undefined>(undefined);
  const [products, setProducts] = useState<Product[]>([]);
  const [stocks, setStocks] = useState<Record<string, Stock>>({});
  // no add-category here; use Admin → Products

  // Load data once on mount
  useEffect(()=>{
    (async ()=>{
      // gate
      const { data:{ user } } = await supabaseClient.auth.getUser();
      if (!user) { setAllowed(false); return; }
      const { data: prof } = await supabaseClient.from('profiles').select('is_admin,is_stock_manager').eq('id', user.id).maybeSingle();
      if (!prof?.is_admin && !prof?.is_stock_manager) { setAllowed(false); return; }
      setAllowed(true);
      // load
      const [{ data: cats }, { data: prods }, { data: stockRows }] = await Promise.all([
        supabaseClient.from('categories').select('id,name').order('name'),
        supabaseClient.from('products').select('id,name,image_url,category_id').order('name'),
        supabaseClient.from('product_stocks').select('product_id,max_qty,available_qty,notify_at_count')
      ]);
      setCategories(cats||[]);
      if ((cats&&cats[0]?.id) && !activeCat) setActiveCat(cats[0]!.id);
      setProducts(prods||[]);
      const map: Record<string,Stock> = {};
      (stockRows||[]).forEach((s:any)=>{ map[s.product_id] = s; });
      setStocks(map);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  // Realtime: reflect new categories/products created in Admin
  useEffect(()=>{
    const ch = supabaseClient.channel('stock-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'categories' }, (payload:any)=>{
        const c = payload.new as Category; if (!c?.id) return;
        setCategories(prev=> [...prev, c].sort((a,b)=>a.name.localeCompare(b.name)));
        if (!activeCat) setActiveCat(c.id);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'products' }, (payload:any)=>{
        const p = payload.new as Product; if (!p?.id) return;
        setProducts(prev=> [...prev, p].sort((a,b)=>a.name.localeCompare(b.name)));
      })
      .subscribe();
    return ()=>{ try { supabaseClient.removeChannel(ch); } catch {} };
  },[activeCat]);

  const shown = useMemo(()=> products.filter(p=>p.category_id===activeCat), [products, activeCat]);

  async function saveAvailable(product_id:string, available:number){
    const current = stocks[product_id] || { product_id, max_qty:0, available_qty:0 } as Stock;
    const next = { ...current, available_qty: available } as Stock;
    const upsert = { product_id, max_qty: next.max_qty, available_qty: next.available_qty, notify_at_count: next.notify_at_count ?? null } as any;
    const { error } = await supabaseClient.from('product_stocks').upsert(upsert, { onConflict: 'product_id' });
    if (!error) {
      setStocks(prev=> ({ ...prev, [product_id]: next }));
      try { await fetch('/api/notifications/reconcile', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ product_ids: [product_id] }) }); } catch {}
    }
  }

  async function saveNotify(product_id:string, count:number){
    const current = stocks[product_id] || { product_id, max_qty:0, available_qty:0 } as Stock;
    const next = { ...current, notify_at_count: Math.max(0, count) } as Stock;
    const upsert = { product_id, max_qty: next.max_qty, available_qty: next.available_qty, notify_at_count: next.notify_at_count } as any;
    const { error } = await supabaseClient.from('product_stocks').upsert(upsert, { onConflict: 'product_id' });
    if (!error) {
      setStocks(prev=> ({ ...prev, [product_id]: next }));
      try { await fetch('/api/notifications/reconcile', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ product_ids: [product_id] }) }); } catch {}
    }
  }

  // add-category removed; manage categories in Admin → Products

  if (allowed===null) return <div className="p-4">Loading…</div>;
  if (!allowed) return <div className="p-4 text-red-600">Stock Manager only</div>;

  const currentCatName = categories.find(c=>c.id===activeCat)?.name || 'All';

  return (
    <div className="grid gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h1 className="text-xl md:text-2xl font-semibold text-sky-700">Stock Manager</h1>
        <div className="text-[12px] md:text-sm text-zinc-600">{currentCatName} • {shown.length} items</div>
      </div>
      <div className="grid md:grid-cols-[180px_1fr] grid-cols-1 gap-3">
        {/* Categories (horizontal chips on mobile, sticky sidebar on md+) */}
        <div className="relative">
          <div className="md:sticky md:top-2 md:grid md:gap-1.5 flex gap-2 overflow-x-auto pb-1">
            {categories.map(c=>{
              const active = activeCat===c.id;
              return (
                <button key={c.id}
                  className={`shrink-0 overflow-hidden whitespace-nowrap px-3 h-9 rounded-full border text-sm inline-flex items-center gap-2 text-left shadow-sm ${active?'bg-brand-50 border-brand-200 text-brand-800':'bg-white border-zinc-200 text-zinc-800'}`}
                  onClick={()=>setActiveCat(c.id)}>
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold ${active?'bg-brand-100 text-brand-700':'bg-zinc-100 text-zinc-700'}`}>{c.name.slice(0,2)}</span>
                  <span className="truncate">{c.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Products */}
        <div className="grid gap-2">
          {shown.map(p=> {
            const s = stocks[p.id] || { product_id:p.id, max_qty:0, available_qty:0 };
            return (
            <Card key={p.id} className="shadow-sm hover:shadow transition-shadow rounded-xl border border-zinc-200">
              <CardContent className="p-3 flex items-center gap-3 flex-wrap">
                <div className="w-14 h-14 rounded-lg overflow-hidden border bg-white flex items-center justify-center">
                  {p.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-[10px] text-zinc-500">No image</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-medium text-zinc-900 truncate">{p.name}</div>
                  <div className="text-[12px] text-zinc-600">Available: {s.available_qty}</div>
                </div>
                <div className="grid grid-cols-1 gap-1 w-auto md:w-64 items-center ml-auto">
                  <Input type="number" defaultValue={s.available_qty}
                    onBlur={e=> saveAvailable(p.id, Math.max(0, parseInt(e.target.value||'0')))} placeholder="Available"
                    className="h-9 text-[13px] w-[140px] md:w-full" />
                  <Input type="number" defaultValue={s.notify_at_count ?? ''}
                    onBlur={e=> saveNotify(p.id, Math.max(0, parseInt(e.target.value||'0')))} placeholder="Notify at"
                    className="h-9 text-[13px] w-[140px] md:w-full" />
                  <div className="text-[11px] text-zinc-500 text-right md:text-left">Tap outside to save</div>
                </div>
              </CardContent>
            </Card>
          );})}
        </div>
      </div>
    </div>
  );
}
