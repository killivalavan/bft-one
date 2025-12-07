"use client";
import { useEffect, useState, useMemo } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { useCart, totalCents } from "@/store/cart";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils/cn";
import { Check } from "lucide-react";

type Category = { id: string; name: string; icon_url?: string | null };
type Product = { id: string; name: string; price_cents: number; image_url: string | null; category_id: string; mrp_cents?: number | null; unit_label?: string | null; subtitle?: string | null; options_json?: any };
type Stock = { product_id: string; max_qty: number; available_qty: number; notify_at_count?: number | null };

export default function BillingPage() {
  const { toast } = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [stocks, setStocks] = useState<Record<string, Stock>>({});
  const [activeCat, setActiveCat] = useState<string | undefined>();

  const items = useCart(s => s.items);
  const increment = useCart(s => s.increment);
  const decrement = useCart(s => s.decrement);
  const clear = useCart(s => s.clear);

  useEffect(() => {
    (async () => {
      try {
        // 1) Warm start from session cache
        try {
          const cc = sessionStorage.getItem('billing_categories');
          const cp = sessionStorage.getItem('billing_products');
          const cs = sessionStorage.getItem('billing_stocks');
          if (cc) {
            const cats = JSON.parse(cc || 'null');
            if (Array.isArray(cats)) { setCategories(cats); setActiveCat((cats && cats[0]?.id) || undefined); }
          }
          if (cp) {
            const prods = JSON.parse(cp || 'null');
            if (Array.isArray(prods)) setProducts(prods);
          }
          if (cs) {
            const stocksArr = JSON.parse(cs || 'null');
            if (Array.isArray(stocksArr)) {
              const map: Record<string, Stock> = {};
              stocksArr.forEach((s: any) => { if (s?.product_id) map[s.product_id] = s; });
              setStocks(map);
            }
          }
        } catch { }

        // 2) Fetch fresh data in parallel and cache
        const [catsRes, prodsRes, stkRes] = await Promise.all([
          supabaseClient.from("categories").select("*").order("name"),
          supabaseClient.from("products").select("*").eq("active", true).order("name"),
          supabaseClient.from('product_stocks').select('product_id,max_qty,available_qty,notify_at_count')
        ]);
        if (catsRes.error) throw catsRes.error;
        if (prodsRes.error) throw prodsRes.error;
        setCategories(catsRes.data || []);
        setActiveCat((catsRes.data && catsRes.data[0]?.id) || undefined);
        setProducts(prodsRes.data || []);
        const map: Record<string, Stock> = {};
        (stkRes.data || []).forEach((s: any) => { map[s.product_id] = s; });
        setStocks(map);
        try {
          sessionStorage.setItem('billing_categories', JSON.stringify(catsRes.data || []));
          sessionStorage.setItem('billing_products', JSON.stringify(prodsRes.data || []));
          sessionStorage.setItem('billing_stocks', JSON.stringify(stkRes.data || []));
        } catch { }
      } catch (e: any) {
        setCategories([]); setProducts([]);
        try { toast({ title: "Billing data failed", description: e?.message || String(e), variant: "error" }); } catch { }
      }
    })();
  }, []);

  // Focus a product if pid is provided in the URL
  useEffect(() => {
    if (products.length === 0) return;
    try {
      const sp = new URLSearchParams(window.location.search);
      const pid = sp.get('pid');
      if (!pid) return;
      const prod = products.find(p => p.id === pid);
      if (!prod) return;
      setActiveCat(prod.category_id);
      setTimeout(() => {
        const el = document.getElementById(`prod-${pid}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    } catch { }
  }, [products]);

  const shown = useMemo(() => products.filter(p => p.category_id === activeCat), [products, activeCat]);

  // Realtime: reflect stock changes from other devices instantly
  useEffect(() => {
    const ch = supabaseClient.channel('billing-stocks-live')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'product_stocks' }, (payload: any) => {
        const row = payload.new as any; if (!row?.product_id) return;
        setStocks(prev => {
          const next = { ...prev, [row.product_id]: { ...(prev[row.product_id] || { product_id: row.product_id, max_qty: 0, available_qty: 0 }), ...row } as any };
          try { sessionStorage.setItem('billing_stocks', JSON.stringify(Object.values(next))); } catch { }
          return next;
        });
      })
      .subscribe();
    return () => { try { supabaseClient.removeChannel(ch); } catch { } };
  }, []);

  function statusFor(pid: string) {
    const s = stocks[pid];
    if (!s) return { low: false, oos: false };
    const low = (s.notify_at_count ?? 0) > 0 && s.available_qty <= (s.notify_at_count as number);
    const oos = s.available_qty <= 0;
    return { low, oos, s } as any;
  }

  async function submitOrder() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) { toast({ title: "Login required", variant: "error" }); return; }
    const list = Object.values(items);
    if (list.length === 0) return;
    const total = totalCents(items);
    const { data: order, error } = await supabaseClient.from("orders")
      .insert({ user_id: user.id, total_cents: total, status: "pending" })
      .select("*").single();
    if (error) { toast({ title: "Failed to submit order", description: error.message, variant: "error" }); return; }
    const rows = list.map(i => ({ order_id: order.id, product_id: i.product_id, qty: i.qty, price_cents: i.price_cents }));
    const { error: e2 } = await supabaseClient.from("order_items").insert(rows);
    if (e2) { toast({ title: "Failed to add items", description: e2.message, variant: "error" }); return; }
    try {
      // Adjust stock and create notifications server-side
      await fetch('/api/stock/adjust', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: rows }) });
    } catch { }

    // Optimistically update local stock
    setStocks(prev => {
      const next = { ...prev } as Record<string, Stock>;
      for (const it of rows) {
        const cur = next[it.product_id] || { product_id: it.product_id, max_qty: 0, available_qty: 0, notify_at_count: null } as any;
        next[it.product_id] = { ...cur, available_qty: Math.max(0, (cur.available_qty || 0) - (it.qty || 0)) };
      }
      try { sessionStorage.setItem('billing_stocks', JSON.stringify(Object.values(next))); } catch { }
      return next;
    });

    try {
      const pids = rows.map(r => r.product_id);
      if (pids.length > 0) {
        const { data: fresh } = await supabaseClient.from('product_stocks').select('product_id,max_qty,available_qty,notify_at_count').in('product_id', pids);
        if (fresh) {
          setStocks(prev => {
            const next = { ...prev } as Record<string, Stock>;
            for (const s of fresh as any[]) next[s.product_id] = s as any;
            try { sessionStorage.setItem('billing_stocks', JSON.stringify(Object.values(next))); } catch { }
            return next;
          });
        }
      }
    } catch { }

    clear();
    toast({ title: "Order submitted", variant: "success" });
  }

  return (
    <div className="grid gap-4 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-zinc-900 tracking-tight">Billing</h1>
          {activeCat && (
            <p className="text-sm text-zinc-500">
              Showing {shown.length} items in <span className="font-medium text-sky-600">{categories.find(c => c.id === activeCat)?.name}</span>
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-[96px_1fr] md:grid-cols-[130px_1fr] gap-4">
        {/* Left column: categories */}
        <div className="relative">
          <div className="sticky top-20 grid gap-2">
            {categories.map(c => {
              const active = activeCat === c.id;
              return (
                <button key={c.id}
                  className={cn(
                    "w-full aspect-square overflow-hidden px-2 py-2 rounded-2xl flex flex-col items-center justify-center gap-1 transition-all duration-300",
                    active
                      ? "bg-sky-600 text-white shadow-md scale-105 ring-2 ring-sky-200"
                      : "bg-white border border-zinc-100 text-zinc-600 hover:bg-zinc-50 hover:border-zinc-200 hover:shadow-sm"
                  )}
                  onClick={() => setActiveCat(c.id)}>
                  <span className="text-center text-xs sm:text-sm font-semibold leading-tight line-clamp-2">
                    {c.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: products */}
        <div className="min-w-0">
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {shown.map(p => {
              const st = statusFor(p.id) as any;
              const qInCart = (items[p.id]?.qty || 0);
              const atLimit = st?.s ? (qInCart >= Math.max(0, st.s.available_qty)) : false;

              return (
                <div key={p.id} id={`prod-${p.id}`} className="group bg-white rounded-2xl border border-zinc-100 shadow-sm hover:shadow-md hover:border-zinc-200 transition-all duration-300 overflow-hidden flex flex-col h-full">
                  {/* Image Area */}
                  <div className="relative aspect-square bg-zinc-50 overflow-hidden">
                    {p.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.image_url} alt={p.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-zinc-300 text-xs font-medium">No Image</div>
                    )}

                    {/* Badges */}
                    <div className="absolute top-2 right-2 flex flex-col gap-1 items-end">
                      {st?.oos && <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide rounded-full bg-rose-500 text-white shadow-sm">Out of stock</span>}
                      {!st?.oos && st?.low && <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide rounded-full bg-amber-500 text-white shadow-sm">Low stock</span>}
                      {qInCart > 0 && (
                        <span className="min-w-[24px] h-6 px-1.5 flex items-center justify-center rounded-full bg-sky-600 text-white text-xs font-bold shadow-sm ring-2 ring-white animate-in zoom-in">
                          {qInCart}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Content Area */}
                  <div className="p-3 flex-1 flex flex-col">
                    <div className="flex-1 min-w-0 mb-2">
                      <h3 className="text-sm font-semibold text-zinc-900 leading-snug line-clamp-2">{p.name}</h3>
                      {p.subtitle && <p className="text-[11px] text-zinc-500 truncate mt-0.5">{p.subtitle}</p>}

                      <div className="mt-2 flex items-baseline justify-between">
                        <div>
                          <span className="text-sm font-bold text-zinc-900">₹{(p.price_cents / 100).toFixed(2)}</span>
                          {p.mrp_cents && p.mrp_cents > p.price_cents && (
                            <span className="ml-1 text-[11px] text-zinc-400 line-through">₹{(p.mrp_cents / 100).toFixed(2)}</span>
                          )}
                        </div>
                        {st?.s && (
                          <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-zinc-50 text-zinc-600", st.low ? "text-amber-600 bg-amber-50" : "")}>
                            {Math.max(0, st.s.available_qty - qInCart)} left
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div>
                      {Array.isArray(p.options_json) && p.options_json.length > 1 ? (
                        <Button variant="outline" size="sm" className="w-full h-9 bg-zinc-50 border-zinc-200 text-zinc-700 hover:bg-zinc-100 text-xs">
                          Select Options
                        </Button>
                      ) : (
                        <div className="flex items-center gap-2">
                          {qInCart === 0 ? (
                            <Button
                              size="sm"
                              className={cn(
                                "w-full h-9 text-xs font-semibold tracking-wide",
                                st?.oos || atLimit ? "bg-zinc-100 text-zinc-400" : "bg-sky-600 text-white hover:bg-sky-700 shadow-sm"
                              )}
                              disabled={st?.oos || atLimit}
                              onClick={() => increment({ product_id: p.id, name: p.name, price_cents: p.price_cents, qty: 1 })}
                            >
                              {st?.oos ? "NO STOCK" : "ADD"}
                            </Button>
                          ) : (
                            <div className="flex items-center justify-between w-full h-9 bg-sky-50 rounded-lg border border-sky-100 px-1">
                              <button
                                onClick={() => decrement(p.id)}
                                className="w-7 h-7 flex items-center justify-center rounded-md bg-white text-sky-700 hover:bg-sky-100 shadow-sm transition-colors disabled:opacity-50"
                              >
                                -
                              </button>
                              <span className="text-sm font-bold text-sky-700 w-6 text-center">{qInCart}</span>
                              <button
                                disabled={st?.oos || atLimit}
                                onClick={() => increment({ product_id: p.id, name: p.name, price_cents: p.price_cents, qty: 1 })}
                                className="w-7 h-7 flex items-center justify-center rounded-md bg-sky-600 text-white hover:bg-sky-700 shadow-sm transition-colors disabled:bg-zinc-200 disabled:text-zinc-400"
                              >
                                +
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Sticky Floating Cart */}
      <div className="fixed left-0 right-0 bottom-4 z-40 px-4 pointer-events-none">
        <div className="max-w-md mx-auto pointer-events-auto">
          <div className="bg-zinc-900/90 backdrop-blur-md text-white rounded-2xl shadow-2xl p-4 ring-1 ring-white/10 animate-in slide-in-from-bottom-6 duration-500">
            {Object.keys(items).length > 0 ? (
              <div>
                <div className="flex flex-wrap gap-1.5 mb-3 max-h-20 overflow-y-auto no-scrollbar">
                  {Object.values(items).map(i => (
                    <span key={i.product_id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 border border-white/5 text-[11px] font-medium text-zinc-200">
                      {i.name}
                      <span className="bg-white text-zinc-900 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold">{i.qty}</span>
                    </span>
                  ))}
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] text-zinc-400 font-medium uppercase tracking-wider">Total Amount</p>
                    <p className="text-lg font-bold text-white leading-none">₹{(totalCents(items) / 100).toFixed(2)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={clear} className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold text-white transition-colors">
                      Clear
                    </button>
                    <button onClick={submitOrder} className="px-6 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-sm font-bold shadow-lg shadow-sky-500/20 transition-all active:scale-95 flex items-center gap-2">
                      Submit Order <Check size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between text-zinc-400">
                <span className="text-sm">Your cart is empty</span>
                <span className="text-lg font-bold text-zinc-600">₹0.00</span>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="h-24" />
    </div >
  );
}
