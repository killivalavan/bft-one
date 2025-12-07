"use client";
import { useEffect, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { PendingOrderCard } from "@/components/pending/PendingOrderCard";
import { ChevronLeft, Inbox } from "lucide-react";
import Link from "next/link";

type Row = { id: string; user_id: string | null; status: string; total_cents: number; created_at: string };
type ItemRow = { order_id: string; product_id: string; qty: number; product_name: string };

export default function PendingPage() {
  const [orders, setOrders] = useState<Row[]>([]);
  const [itemsByOrder, setItemsByOrder] = useState<Record<string, ItemRow[]>>({});

  async function load() {
    const { data: ord } = await supabaseClient
      .from("orders")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    setOrders(ord || []);
    const ids = (ord || []).map(o => o.id);
    if (ids.length === 0) { setItemsByOrder({}); return; }

    // Fetch items
    const { data: rows } = await supabaseClient
      .from("order_items")
      .select("order_id, product_id, qty, products(name)")
      .in("order_id", ids);

    const grouped: Record<string, ItemRow[]> = {};
    (rows || []).forEach((r: any) => {
      const entry: ItemRow = { order_id: r.order_id, product_id: r.product_id, qty: r.qty, product_name: r.products?.name || "Item" };
      (grouped[entry.order_id] ||= []).push(entry);
    });
    setItemsByOrder(grouped);
  }

  useEffect(() => { load(); }, []);

  // Realtime
  useEffect(() => {
    const ch = supabaseClient.channel('pending-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => load())
      .subscribe();
    return () => { try { supabaseClient.removeChannel(ch); } catch { } };
  }, []);

  async function delivered(id: string) {
    const { error } = await supabaseClient.from("orders").update({ status: "delivered" }).eq("id", id);
    if (error) { alert(error.message); return; }
    load();
  }

  async function cancelOrder(id: string) {
    try {
      const res = await fetch('/api/orders/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order_id: id }) });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data?.error || 'Failed');
      }
      load();
    } catch (e: any) {
      alert(e?.message || String(e));
    }
  }

  return (
    <div className="min-h-screen pb-20">
      <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-zinc-500 text-sm font-medium">
              <Link href="/" className="hover:text-sky-700 transition-colors flex items-center gap-1">
                <ChevronLeft size={16} /> Home
              </Link>
            </div>
            <h1 className="text-3xl font-bold text-zinc-900 tracking-tight">Pending Orders</h1>
          </div>
          <div className="text-sm font-medium px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full">
            {orders.length} Active
          </div>
        </div>

        <div className="grid gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {orders.map(o => (
            <PendingOrderCard
              key={o.id}
              orderId={o.id}
              totalCents={o.total_cents}
              createdAt={o.created_at}
              items={itemsByOrder[o.id] || []}
              onCancel={() => cancelOrder(o.id)}
              onDeliver={() => delivered(o.id)}
            />
          ))}

          {orders.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 bg-zinc-50 rounded-3xl border border-dashed border-zinc-200 text-zinc-400">
              <Inbox size={48} className="mb-4 opacity-50" />
              <div className="text-lg font-medium">All caught up!</div>
              <p className="text-sm">No pending orders at the moment.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
