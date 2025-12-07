"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { ChevronLeft, Bell } from "lucide-react";
import { NotificationList } from "@/components/notifications/NotificationList";
import { Notification } from "@/components/notifications/NotificationItem";

export default function NotificationsPage() {
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabaseClient.from('notifications').select('id,message,kind,created_at,product_id').order('created_at', { ascending: false });
      setItems((data as Notification[]) || []);
      setLoading(false);
    })();
    const ch = supabaseClient.channel('notif-live').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, (payload: any) => {
      setItems(prev => [payload.new as Notification, ...prev]);
    }).subscribe();
    return () => { try { supabaseClient.removeChannel(ch); } catch { } };
  }, []);

  return (
    <div className="min-h-screen pb-20">
      <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-6">
        <div className="flex items-center gap-2 text-zinc-500 text-sm font-medium">
          <Link href="/" className="hover:text-sky-700 transition-colors flex items-center gap-1">
            <ChevronLeft size={16} /> Home
          </Link>
        </div>

        <div className="flex items-center gap-3">
          <div className="p-2 bg-rose-100 text-rose-600 rounded-xl">
            <Bell size={24} />
          </div>
          <h1 className="text-3xl font-bold text-zinc-900 tracking-tight">Notifications</h1>
        </div>

        <NotificationList notifications={items} loading={loading} />
      </div>
    </div>
  );
}
