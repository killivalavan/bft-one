"use client";
import { useEffect, useState, useMemo } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { useCart, totalCents } from "@/store/cart";
import { useToast } from "@/components/ui/Toast";
import { CategorySelector } from "@/components/billing/CategorySelector";
import { ProductCard } from "@/components/billing/ProductCard";
import { CartBar } from "@/components/billing/CartBar";

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
        if (!activeCat) setActiveCat((catsRes.data && catsRes.data[0]?.id) || undefined);
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

    // Optimistically update local stock so badges reflect immediately
    setStocks(prev => {
      const next = { ...prev } as Record<string, Stock>;
      for (const it of rows) {
        const cur = next[it.product_id] || { product_id: it.product_id, max_qty: 0, available_qty: 0, notify_at_count: null } as any;
        next[it.product_id] = { ...cur, available_qty: Math.max(0, (cur.available_qty || 0) - (it.qty || 0)) };
      }
      try { sessionStorage.setItem('billing_stocks', JSON.stringify(Object.values(next))); } catch { }
      return next;
    });

    // Reconcile with server for the specific products
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
    <div className="flex flex-col md:flex-row h-[calc(100vh-64px)] overflow-hidden bg-neutral-50/50">

      {/* Sidebar: Categories */}
      <aside className="shrink-0 w-full md:w-64 bg-white border-b md:border-b-0 md:border-r border-zinc-200 z-20">
        <div className="p-3 md:p-4 h-full overflow-hidden flex flex-col">
          <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-3 hidden md:block">Categories</h2>
          <div className="flex-1 overflow-y-auto no-scrollbar">
            <CategorySelector
              categories={categories}
              activeId={activeCat}
              onSelect={setActiveCat}
            />
          </div>
        </div>
      </aside>

      {/* Main Content: Products */}
      <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-24 relative">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="mb-6 flex items-end justify-between">
            <div>
              <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">
                {categories.find(c => c.id === activeCat)?.name || 'Billing'}
              </h1>
              <p className="text-zinc-500 text-sm mt-1">{shown.length} products available</p>
            </div>
          </div>

          {/* Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {shown.map(p => (
              <div key={p.id} id={`prod-${p.id}`} className="contents">
                <ProductCard
                  product={p}
                  qty={items[p.id]?.qty || 0}
                  stockStatus={statusFor(p.id)}
                  onIncrement={() => increment({ product_id: p.id, name: p.name, price_cents: p.price_cents, qty: 1 })}
                  onDecrement={() => decrement(p.id)}
                  onAdd={() => increment({ product_id: p.id, name: p.name, price_cents: p.price_cents, qty: 1 })}
                />
              </div>
            ))}
          </div>

          {/* Empty State */}
          {shown.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center opacity-60">
              <div className="w-16 h-16 bg-zinc-200 rounded-full mb-4" />
              <p className="text-zinc-500 font-medium">No products found in this category</p>
            </div>
          )}
        </div>
      </main>

      {/* Sticky Cart Bar */}
      <CartBar
        itemCount={Object.values(items).reduce((a, b) => a + (b.qty || 0), 0)}
        totalCents={totalCents(items)}
        onClear={clear}
        onSubmit={submitOrder}
      />
    </div>
  );
}
