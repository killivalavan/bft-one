"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { Bell } from "lucide-react";
import { NotificationList } from "@/components/notifications/NotificationList";
import { Notification } from "@/components/notifications/NotificationItem";

import { useTenant } from "@/lib/context/TenantContext";

export default function NotificationsPage() {
  const { business } = useTenant();
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const query = supabaseClient.from('notifications').select('id,message,kind,created_at,product_id').order('created_at', { ascending: false });
      if (business?.id) {
        query.eq('business_id', business.id);
      }
      const { data } = await query;
      setItems((data as Notification[]) || []);
      setLoading(false);
    })();
    const ch = supabaseClient.channel('notif-live').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, (payload: any) => {
      if (!business?.id || payload.new?.business_id === business.id) {
        setItems(prev => [payload.new as Notification, ...prev]);
      }
    }).subscribe();
    return () => { try { supabaseClient.removeChannel(ch); } catch { } };
  }, [business?.id]);

  return (
    <div className="min-h-screen pb-20">
      <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-[#EFF6FF] text-[#2563EB] rounded-xl border border-[#BFDBFE] shadow-2xs shrink-0">
            <Bell size={24} />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-[#0F172A] tracking-tight">Notifications</h1>
            <p className="text-xs sm:text-sm text-slate-500">Live operational alerts, low stock warnings & system updates</p>
          </div>
        </div>

        <NotificationList notifications={items} loading={loading} />
      </div>
    </div>
  );
}
