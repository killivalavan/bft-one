"use client";
import { useEffect, useState, useMemo } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { useCart, totalCents } from "@/store/cart";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
// search removed per request

type Category = { id:string; name:string; icon_url?: string|null };

type Product = { id:string; name:string; price_cents:number; image_url:string|null; category_id:string; mrp_cents?: number|null; unit_label?: string|null; subtitle?: string|null; options_json?: any };
type Stock = { product_id:string; max_qty:number; available_qty:number; notify_at_count?: number|null };

export default function BillingPage() {
  const { toast } = useToast();
  const [categories,setCategories] = useState<Category[]>([]);
  const [products,setProducts] = useState<Product[]>([]);
  const [stocks,setStocks] = useState<Record<string,Stock>>({});
  const [activeCat,setActiveCat] = useState<string|undefined>();
  // search removed per request
  const items = useCart(s=>s.items);
  const increment = useCart(s=>s.increment);
  const decrement = useCart(s=>s.decrement);
  const clear = useCart(s=>s.clear);

  useEffect(()=>{
    (async ()=>{
      try {
        // 1) Warm start from session cache
        try {
          const cc = sessionStorage.getItem('billing_categories');
          const cp = sessionStorage.getItem('billing_products');
          const cs = sessionStorage.getItem('billing_stocks');
          if (cc) {
            const cats = JSON.parse(cc||'null');
            if (Array.isArray(cats)) { setCategories(cats); setActiveCat((cats&&cats[0]?.id) || undefined); }
          }
          if (cp) {
            const prods = JSON.parse(cp||'null');
            if (Array.isArray(prods)) setProducts(prods);
          }
          if (cs) {
            const stocksArr = JSON.parse(cs||'null');
            if (Array.isArray(stocksArr)) {
              const map: Record<string,Stock> = {};
              stocksArr.forEach((s:any)=>{ if (s?.product_id) map[s.product_id] = s; });
              setStocks(map);
            }
          }
        } catch {}

        // 2) Fetch fresh data in parallel and cache
        const [catsRes, prodsRes, stkRes] = await Promise.all([
          supabaseClient.from("categories").select("*").order("name"),
          supabaseClient.from("products").select("*").eq("active", true).order("name"),
          supabaseClient.from('product_stocks').select('product_id,max_qty,available_qty,notify_at_count')
        ]);
        if (catsRes.error) throw catsRes.error;
        if (prodsRes.error) throw prodsRes.error;
        setCategories(catsRes.data||[]);
        setActiveCat((catsRes.data&&catsRes.data[0]?.id) || undefined);
        setProducts(prodsRes.data||[]);
        const map: Record<string,Stock> = {};
        (stkRes.data||[]).forEach((s:any)=>{ map[s.product_id] = s; });
        setStocks(map);
        try {
          sessionStorage.setItem('billing_categories', JSON.stringify(catsRes.data||[]));
          sessionStorage.setItem('billing_products', JSON.stringify(prodsRes.data||[]));
          sessionStorage.setItem('billing_stocks', JSON.stringify(stkRes.data||[]));
        } catch {}
      } catch (e:any) {
        setCategories([]); setProducts([]);
        try { toast({ title: "Billing data failed", description: e?.message||String(e), variant: "error" }); } catch {}
      }
    })();
  },[]);

  // Focus a product if pid is provided in the URL
  useEffect(()=>{
    if (products.length===0) return;
    try {
      const sp = new URLSearchParams(window.location.search);
      const pid = sp.get('pid');
      if (!pid) return;
      const prod = products.find(p=>p.id===pid);
      if (!prod) return;
      setActiveCat(prod.category_id);
      setTimeout(()=>{
        const el = document.getElementById(`prod-${pid}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    } catch {}
  }, [products]);

  const shown = useMemo(()=> products.filter(p=>p.category_id===activeCat), [products, activeCat]);

  // Realtime: reflect stock changes from other devices instantly
  useEffect(()=>{
    const ch = supabaseClient.channel('billing-stocks-live')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'product_stocks' }, (payload:any)=>{
        const row = payload.new as any; if (!row?.product_id) return;
        setStocks(prev=> {
          const next = { ...prev, [row.product_id]: { ...(prev[row.product_id]||{ product_id: row.product_id, max_qty:0, available_qty:0 }), ...row } as any };
          try { sessionStorage.setItem('billing_stocks', JSON.stringify(Object.values(next))); } catch {}
          return next;
        });
      })
      .subscribe();
    return ()=>{ try { supabaseClient.removeChannel(ch); } catch {} };
  },[]);
  function statusFor(pid:string){
    const s = stocks[pid];
    if (!s) return { low:false, oos:false };
    const low = (s.notify_at_count ?? 0) > 0 && s.available_qty <= (s.notify_at_count as number);
    const oos = s.available_qty <= 0;
    return { low, oos, s } as any;
  }

  async function submitOrder() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) { toast({ title: "Login required", variant: "error" }); return; }
    const list = Object.values(items);
    if (list.length===0) return;
    const total = totalCents(items);
    const { data: order, error } = await supabaseClient.from("orders")
      .insert({ user_id: user.id, total_cents: total, status: "pending" })
      .select("*").single();
    if (error) { toast({ title: "Failed to submit order", description: error.message, variant: "error" }); return; }
    const rows = list.map(i=>({ order_id: order.id, product_id: i.product_id, qty: i.qty, price_cents: i.price_cents }));
    const { error: e2 } = await supabaseClient.from("order_items").insert(rows);
    if (e2) { toast({ title: "Failed to add items", description: e2.message, variant: "error" }); return; }
    try {
      // Adjust stock and create notifications server-side
      await fetch('/api/stock/adjust', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ items: rows }) });
    } catch {}

    // Optimistically update local stock so badges reflect immediately
    setStocks(prev => {
      const next = { ...prev } as Record<string, Stock>;
      for (const it of rows) {
        const cur = next[it.product_id] || { product_id: it.product_id, max_qty: 0, available_qty: 0, notify_at_count: null } as any;
        next[it.product_id] = { ...cur, available_qty: Math.max(0, (cur.available_qty||0) - (it.qty||0)) };
      }
      try { sessionStorage.setItem('billing_stocks', JSON.stringify(Object.values(next))); } catch {}
      return next;
    });

    // Reconcile with server for the specific products
    try {
      const pids = rows.map(r=>r.product_id);
      if (pids.length>0) {
        const { data: fresh } = await supabaseClient.from('product_stocks').select('product_id,max_qty,available_qty,notify_at_count').in('product_id', pids);
        if (fresh) {
          setStocks(prev=>{
            const next = { ...prev } as Record<string, Stock>;
            for (const s of fresh as any[]) next[s.product_id] = s as any;
            try { sessionStorage.setItem('billing_stocks', JSON.stringify(Object.values(next))); } catch {}
            return next;
          });
        }
      }
    } catch {}

    clear();
    toast({ title: "Order submitted", variant: "success" });
  }

  return (
    <div className="grid gap-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0 relative z-0">
          {activeCat ? (
            <div className="text-sm font-semibold text-foreground">
              {shown.length} items in {categories.find(c=>c.id===activeCat)?.name}
            </div>
          ) : (
            <div className="text-sm font-semibold text-foreground">Billing</div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-[110px_1fr] md:grid-cols-[140px_1fr] gap-3">
        {/* Left column: categories */}
        <div className="relative">
          <div className="sticky top-2 grid gap-1.5">
            {categories.map(c=>{
              const active = activeCat===c.id;
              return (
                <button key={c.id}
                  className={`w-full overflow-hidden whitespace-nowrap px-2 py-1 rounded-xl border text-xs flex items-center gap-2 text-left ${active?'bg-brand-50 border-brand-200 text-brand-800':'bg-white border-zinc-200 text-zinc-800'}`}
                  onClick={()=>setActiveCat(c.id)}>
                  {c.icon_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.icon_url} alt={c.name} className={`w-6 h-6 rounded-full object-cover border ${active?'border-brand-200':'border-zinc-200'}`} />
                  ) : (
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold ${active?'bg-brand-100 text-brand-700':'bg-zinc-100 text-zinc-700'}`}>{c.name.slice(0,2)}</span>
                  )}
                  <span className="truncate">{c.name}</span>
                </button>
              );
            })}
          </div>
        </div>
        {/* Right: products */}
        <div className="min-w-0">
          {/* Filter chips */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {shown.map(p=> {
              const st = statusFor(p.id) as any;
              const qInCart = (items[p.id]?.qty||0);
              const atLimit = st?.s ? (qInCart >= Math.max(0, st.s.available_qty)) : false;
              return (
              <Card key={p.id} id={`prod-${p.id}`} className="active:scale-[.99] overflow-hidden">
                <CardContent className="p-0">
                  <div className="p-1.5">
                    {/* image */}
                    <div className="relative aspect-square w-full rounded-lg overflow-hidden border bg-white">
                      {p.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-400 text-xs">No image</div>
                      )}
                      {st?.oos && (
                        <span className="absolute top-1 right-1 px-1.5 py-0.5 text-[10px] font-semibold rounded bg-red-600 text-white">Out of stock</span>
                      )}
                      {!st?.oos && st?.low && (
                        <span className="absolute top-1 right-1 px-1.5 py-0.5 text-[10px] font-semibold rounded bg-amber-500 text-white">Low stock</span>
                      )}
                    </div>
                    {/* content */}
                    <div className="mt-1 min-w-0">
                      <div className="text-[12px] font-medium truncate text-zinc-900">{p.name}</div>
                      {p.subtitle && <div className="text-[10px] text-zinc-600 truncate">{p.subtitle}</div>}
                      {p.unit_label && <div className="text-[10px] text-zinc-600">{p.unit_label}</div>}
                      <div className="text-[11px] mt-0.5 flex items-center gap-1">
                        <span className="font-semibold text-zinc-900">₹ {(p.price_cents/100).toFixed(2)}</span>
                        {p.mrp_cents && p.mrp_cents > p.price_cents && (
                          <span className="text-zinc-400 line-through text-[10px]">₹ {(p.mrp_cents/100).toFixed(2)}</span>
                        )}
                        {st?.s && (
                          <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full border border-zinc-200 text-zinc-700 bg-zinc-50">Avail: {Math.max(0, st.s.available_qty - qInCart)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="p-1.5 pt-0 flex items-center gap-2">
                    {Array.isArray(p.options_json) && p.options_json.length > 1 ? (
                      <Button size="sm" variant="outline" className="h-8 text-[13px] border-brand-600 text-brand-700 hover:bg-brand-50 flex-1 inline-flex items-center justify-center gap-2">
                        <span>{p.options_json.length} options</span>
                        <span className="min-w-5 h-5 px-1 inline-flex items-center justify-center rounded-full border border-brand-200 bg-brand-50 text-brand-700 text-[11px] font-semibold animate-pop" key={(items[p.id]?.qty||0)}>
                          {(items[p.id]?.qty||0)}
                        </span>
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className={`h-8 text-[13px] flex-1 inline-flex items-center justify-center gap-2 ${st?.oos || atLimit ? 'bg-zinc-300 text-zinc-600 cursor-not-allowed' : 'bg-brand-600 hover:bg-brand-700 text-white'}`}
                        onClick={()=>{ if (st?.oos || atLimit) { return; } increment({ product_id:p.id, name:p.name, price_cents:p.price_cents, qty:1 }); }}
                      >
                        {(()=>{ const q=(items[p.id]?.qty||0); return (
                          <>
                            <span
                              onClick={(e)=>{ e.preventDefault(); e.stopPropagation(); if(q>0){ decrement(p.id); } }}
                              className={`w-5 h-5 inline-flex items-center justify-center rounded-full text-[14px] font-bold ${q===0? 'bg-white/10 text-white/50 cursor-not-allowed':'bg-white/20 text-white cursor-pointer'}`}
                              aria-disabled={q===0}
                            >
                              −
                            </span>
                            <span className="min-w-6 h-6 px-1 inline-flex items-center justify-center rounded-md border border-brand-200 bg-white text-brand-700 text-[12px] font-semibold animate-pop" key={q}>
                              {q}
                            </span>
                            <span
                              onClick={(e)=>{ e.stopPropagation(); if(!(st?.oos || atLimit)){ increment({ product_id:p.id, name:p.name, price_cents:p.price_cents, qty:1 }); } }}
                              className={`w-5 h-5 inline-flex items-center justify-center rounded-full text-[14px] font-bold ${st?.oos || atLimit ? 'bg-white/10 text-white/50 cursor-not-allowed' : 'bg-white/20 text-white cursor-pointer'}`}
                            >
                              +
                            </span>
                          </>
                        ); })()}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );})}
          </div>
        </div>
      </div>

      {/* Sticky cart bar */}
      <div className="fixed left-0 right-0 bottom-0 bg-white border-t p-2">
        <div className="max-w-md mx-auto">
          <div className="flex flex-wrap gap-1 text-[11px]">
            {Object.values(items).map(i=> (
              <span key={i.product_id} className="px-2 py-1 rounded-full bg-zinc-100 border text-zinc-800">{i.name} {i.qty}</span>
            ))}
          </div>
          <div className="flex justify-between items-center mt-1.5">
            <div className="font-semibold text-zinc-900 text-sm">Total: ₹ {(totalCents(items)/100).toFixed(2)}</div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="h-9" onClick={clear}>Clear</Button>
              <Button size="sm" className="h-9" onClick={submitOrder}>Submit</Button>
            </div>
          </div>
        </div>
      </div>
      <div className="h-24" />
    </div>
  );
}
