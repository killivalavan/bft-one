"use client";
import { useEffect, useMemo, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { StockHeader } from "@/components/stock/StockHeader";
import { CategoryTabs } from "@/components/stock/CategoryTabs";
import { StockCard } from "@/components/stock/StockCard";
import { Loader2 } from "lucide-react";

type Category = { id: string; name: string };
type Product = { id: string; name: string; image_url: string | null; category_id: string };
type Stock = { product_id: string; max_qty: number; available_qty: number; notify_at_count?: number | null };

export default function StockManagerPage() {
  const [allowed, setAllowed] = useState<null | boolean>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCat, setActiveCat] = useState<string | undefined>(undefined);
  const [products, setProducts] = useState<Product[]>([]);
  const [stocks, setStocks] = useState<Record<string, Stock>>({});

  async function loadData() {
    const [{ data: cats }, { data: prods }, { data: stockRows }] = await Promise.all([
      supabaseClient.from('categories').select('id,name').order('name'),
      supabaseClient.from('products').select('id,name,image_url,category_id').order('name'),
      supabaseClient.from('product_stocks').select('product_id,max_qty,available_qty,notify_at_count')
    ]);
    setCategories(cats || []);
    if ((cats && cats[0]?.id) && !activeCat) setActiveCat(cats[0]!.id);
    setProducts(prods || []);
    const map: Record<string, Stock> = {};
    (stockRows || []).forEach((s: any) => { map[s.product_id] = s; });
    setStocks(map);
  }

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabaseClient.auth.getUser();
      if (!user) { setAllowed(false); return; }
      const { data: prof } = await supabaseClient.from('profiles').select('is_admin,is_stock_manager').eq('id', user.id).maybeSingle();
      if (!prof?.is_admin && !prof?.is_stock_manager) { setAllowed(false); return; }
      setAllowed(true);
      await loadData();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Realtime subscription
  useEffect(() => {
    const ch = supabaseClient.channel('stock-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'categories' }, (payload: any) => {
        const c = payload.new as Category; if (!c?.id) return;
        setCategories(prev => [...prev, c].sort((a, b) => a.name.localeCompare(b.name)));
        if (!activeCat) setActiveCat(c.id);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'products' }, (payload: any) => {
        const p = payload.new as Product; if (!p?.id) return;
        setProducts(prev => [...prev, p].sort((a, b) => a.name.localeCompare(b.name)));
      })
      .subscribe();
    return () => { try { supabaseClient.removeChannel(ch); } catch { } };
  }, [activeCat]);

  const shown = useMemo(() => products.filter(p => p.category_id === activeCat), [products, activeCat]);

  async function saveAvailable(product_id: string, available: number) {
    const current = stocks[product_id] || { product_id, max_qty: 0, available_qty: 0 } as Stock;
    const next = { ...current, available_qty: available } as Stock;
    const upsert = { product_id, max_qty: next.max_qty, available_qty: next.available_qty, notify_at_count: next.notify_at_count ?? null } as any;
    const { error } = await supabaseClient.from('product_stocks').upsert(upsert, { onConflict: 'product_id' });
    if (!error) {
      setStocks(prev => ({ ...prev, [product_id]: next }));
      try { await fetch('/api/notifications/reconcile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ product_ids: [product_id] }) }); } catch { }
    }
  }

  async function saveNotify(product_id: string, count: number) {
    const current = stocks[product_id] || { product_id, max_qty: 0, available_qty: 0 } as Stock;
    const next = { ...current, notify_at_count: Math.max(0, count) } as Stock;
    const upsert = { product_id, max_qty: next.max_qty, available_qty: next.available_qty, notify_at_count: next.notify_at_count } as any;
    const { error } = await supabaseClient.from('product_stocks').upsert(upsert, { onConflict: 'product_id' });
    if (!error) {
      setStocks(prev => ({ ...prev, [product_id]: next }));
      try { await fetch('/api/notifications/reconcile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ product_ids: [product_id] }) }); } catch { }
    }
  }

  if (allowed === null) return (
    <div className="flex items-center justify-center min-h-[50vh] text-zinc-500 gap-2">
      <Loader2 className="animate-spin" /> Verifying Access...
    </div>
  )
  if (!allowed) return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-6">
      <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center text-rose-500 mb-4">
        <span className="text-2xl">🚫</span>
      </div>
      <h2 className="text-xl font-bold text-zinc-900">Access Denied</h2>
      <p className="text-zinc-500 mt-2">You do not have permission to view the Stock Manager.</p>
    </div>
  );

  const currentCatName = categories.find(c => c.id === activeCat)?.name || 'All';

  return (
    <div className="min-h-screen pb-20 space-y-6">
      <StockHeader
        itemCount={shown.length}
        categoryName={currentCatName}
        onRefresh={loadData}
      />

      <div className="grid md:grid-cols-[200px_1fr] gap-6 items-start">
        <CategoryTabs
          categories={categories}
          activeId={activeCat}
          onChange={setActiveCat}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-4 animate-in fade-in duration-500">
          {shown.map(p => {
            const s = stocks[p.id] || { product_id: p.id, max_qty: 0, available_qty: 0 };
            return (
              <StockCard
                key={p.id}
                name={p.name}
                imageUrl={p.image_url}
                available={s.available_qty}
                notifyAt={s.notify_at_count ?? null}
                onUpdateAvailable={(v) => saveAvailable(p.id, v)}
                onUpdateNotify={(v) => saveNotify(p.id, v)}
              />
            );
          })}
          {shown.length === 0 && (
            <div className="col-span-full py-12 text-center text-zinc-400 bg-zinc-50 rounded-2xl border border-dashed border-zinc-200">
              No products in this category.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
