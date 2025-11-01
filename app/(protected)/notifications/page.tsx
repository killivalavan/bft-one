"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { Card, CardContent } from "@/components/ui/Card";
import { ChevronLeft } from "lucide-react";

 type Notification = { id:string; message:string; kind:string; created_at:string; product_id?: string|null };

export default function NotificationsPage(){
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(()=>{
    (async ()=>{
      setLoading(true);
      const { data } = await supabaseClient.from('notifications').select('id,message,kind,created_at,product_id').order('created_at', { ascending: false });
      setItems(data||[]);
      setLoading(false);
    })();
    const ch = supabaseClient.channel('notif-live').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, (payload:any)=>{
      setItems(prev=> [payload.new as Notification, ...prev]);
    }).subscribe();
    return ()=>{ try { supabaseClient.removeChannel(ch); } catch {} };
  },[]);

  return (
    <div className="grid gap-2">
      <div>
        <Link href="/" className="inline-flex items-center gap-1 text-sky-700 text-sm">
          <ChevronLeft size={16} />
          <span>Home</span>
        </Link>
      </div>
      <div className="h-0" />
      <div className="grid gap-3">
      <h1 className="text-lg font-semibold text-sky-700">Stock Notifications</h1>
      <Card>
        <CardContent className="p-3">
          <div className="grid gap-2">
            {loading && <div className="text-sm text-zinc-600">Loading…</div>}
            {!loading && items.length===0 && (
              <div className="text-sm text-zinc-600">No notifications</div>
            )}
            {items.map(n=> (
              <div key={n.id} className="rounded-xl border border-zinc-200 p-2 bg-white text-zinc-900 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm">{n.message}</div>
                  <div className="text-[11px] text-zinc-600">{new Date(n.created_at).toLocaleString()}</div>
                </div>
                <div className="flex items-center gap-2">
                  {n.product_id && (
                    <a href={`/billing?pid=${n.product_id}`} className="text-[11px] px-2 py-0.5 rounded-full border border-sky-200 bg-sky-50 text-sky-700">View</a>
                  )}
                  <span className={`text-[11px] px-2 py-0.5 rounded-full border ${n.kind==='stock' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-zinc-50 text-zinc-700 border-zinc-200'}`}>{n.kind}</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
