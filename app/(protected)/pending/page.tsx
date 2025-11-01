"use client";
import { useEffect, useMemo, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

type Row = { id:string; user_id:string|null; status:string; total_cents:number; created_at:string };
type ItemRow = { order_id:string; product_id:string; qty:number; product_name:string };

export default function PendingPage() {
  const [orders, setOrders] = useState<Row[]>([]);
  const [itemsByOrder, setItemsByOrder] = useState<Record<string, ItemRow[]>>({});

  async function load() {
    const { data: ord } = await supabaseClient
      .from("orders")
      .select("*")
      .eq("status","pending")
      .order("created_at",{ascending:false});
    setOrders(ord||[]);
    const ids = (ord||[]).map(o=>o.id);
    if (ids.length===0) { setItemsByOrder({}); return; }
    // Fetch all order items with product names in one request
    const { data: rows } = await supabaseClient
      .from("order_items")
      .select("order_id, product_id, qty, products(name)")
      .in("order_id", ids);
    const grouped: Record<string, ItemRow[]> = {};
    (rows||[]).forEach((r:any)=>{
      const entry: ItemRow = { order_id: r.order_id, product_id: r.product_id, qty: r.qty, product_name: r.products?.name || "Item" };
      (grouped[entry.order_id] ||= []).push(entry);
    });
    setItemsByOrder(grouped);
  }
  useEffect(()=>{ load(); },[]);
  // Realtime: keep pending list fresh
  useEffect(()=>{
    const ch = supabaseClient.channel('pending-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (_payload:any)=>{
        // Any change in orders might affect pending list (new, delivered, canceled)
        load();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, (_payload:any)=>{
        // Items changed; refresh to update names/qtys
        load();
      })
      .subscribe();
    return ()=>{ try { supabaseClient.removeChannel(ch); } catch {} };
  },[]);

  async function delivered(id:string) {
    const { error } = await supabaseClient.from("orders").update({ status:"delivered" }).eq("id", id);
    if (error) { alert(error.message); return; }
    load();
  }

  async function cancelOrder(id:string) {
    try {
      const res = await fetch('/api/orders/cancel', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ order_id: id }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed');
      load();
    } catch (e:any) {
      alert(e?.message||String(e));
    }
  }

  return (
    <div className="grid gap-3 bg-white text-zinc-900 p-3 rounded-lg border">
      <h1 className="text-lg font-semibold text-zinc-900">Pending Orders</h1>
      {orders.length === 0 ? (
        <div className="py-10 text-center text-xl font-semibold text-zinc-900">No pending orders</div>
      ) : (
      <div className="grid gap-2">
        {orders.map(o=>(
          <Card key={o.id}>
            <CardContent className="p-3 bg-white text-zinc-900">
              <div className="flex justify-between items-center">
                <div>
                  <div className="text-sm font-medium text-zinc-900">Order #{o.id.slice(0,8)}</div>
                  <div className="text-xs text-zinc-600">{new Date(o.created_at).toLocaleString()}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-zinc-900">₹ {(o.total_cents/100).toFixed(2)}</div>
                  <div className="grid grid-cols-1 gap-2 mt-1 justify-end">
                    <Button size="sm" variant="outline" onClick={()=>cancelOrder(o.id)}>Cancel order</Button>
                    <Button size="sm" onClick={()=>delivered(o.id)}>Mark as delivered</Button>
                  </div>
                </div>
              </div>
              {/* Compact item tiles */}
              <div className="mt-2 flex flex-wrap gap-2">
                {(itemsByOrder[o.id]||[]).map(it=> (
                  <span key={it.product_id} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border bg-white text-zinc-900 text-[12px] shadow-sm">
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-brand-50 text-brand-700 border border-brand-200 text-[11px] font-semibold">{it.qty}</span>
                    <span className="truncate max-w-[200px]">{it.product_name}</span>
                  </span>
                ))}
                {(!itemsByOrder[o.id] || itemsByOrder[o.id].length===0) && (
                  <span className="text-[12px] text-zinc-700">No items</span>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      )}
    </div>
  );
}
