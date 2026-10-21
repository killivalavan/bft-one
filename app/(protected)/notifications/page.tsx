"use client";
import Link from "next/link";
import { useEffect, useState, useMemo } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { Bell, CheckCheck, Radio, Box, Filter, Sparkles, Trash2 } from "lucide-react";
import { NotificationList } from "@/components/notifications/NotificationList";
import { Notification } from "@/components/notifications/NotificationItem";
import { useTenant } from "@/lib/context/TenantContext";
import { useUnreadNotificationsCount } from "@/lib/hooks/useUnreadNotificationsCount";
import { useProfile } from "@/lib/hooks/useProfile";
import { cn } from "@/lib/utils/cn";

import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";

export default function NotificationsPage() {
  const { business } = useTenant();
  const { flags } = useProfile();
  const isStoreAdmin = Boolean(flags?.isAdmin || flags?.isSuperAdmin);
  const { markAsRead, unreadCount, refreshCount, userId } = useUnreadNotificationsCount();
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [isClearing, setIsClearing] = useState(false);
  const [filterTab, setFilterTab] = useState<"all" | "baker" | "stock">("all");

  const handleMarkOneAsRead = (id: string) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id === id) {
          const currentMeta = it.meta || {};
          const readBy = Array.isArray(currentMeta.read_by) ? [...currentMeta.read_by] : [];
          if (userId && !readBy.includes(userId)) readBy.push(userId);
          return { ...it, meta: { ...currentMeta, read_by: readBy } };
        }
        return it;
      })
    );
    markAsRead(id);
    toast({ title: "Alert Read", description: "Marked notification as read." });
  };

  const handleMarkAllAsRead = () => {
    setItems((prev) =>
      prev.map((it) => {
        const currentMeta = it.meta || {};
        const readBy = Array.isArray(currentMeta.read_by) ? [...currentMeta.read_by] : [];
        if (userId && !readBy.includes(userId)) readBy.push(userId);
        return { ...it, meta: { ...currentMeta, read_by: readBy } };
      })
    );
    markAsRead();
    toast({
      title: "Alerts Acknowledged",
      description: "All notifications marked as read.",
    });
  };

  const handleDeleteOne = async (id: string) => {
    if (!business?.id || !isStoreAdmin) return;
    try {
      const res = await fetch("/api/notifications", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, business_id: business.id, user_id: userId }),
      });
      if (res.ok) {
        setItems((prev) => prev.filter((it) => it.id !== id));
        refreshCount();
        toast({ title: "Alert Cleared", description: "Notification removed from feed." });
      } else {
        toast({ title: "Error", description: "Failed to delete notification.", variant: "error" });
      }
    } catch {
      toast({ title: "Error", description: "Network error while clearing alert.", variant: "error" });
    }
  };

  const handleClearAll = async () => {
    if (!business?.id || !isStoreAdmin || items.length === 0) return;

    const countToClear = filterTab === "all" ? items.length : filteredItems.length;
    if (countToClear === 0) return;

    const confirmed = await confirm({
      title: "Clear Notifications",
      description:
        filterTab === "all"
          ? `Are you sure you want to clear all ${items.length} alerts for ${business.name || "this store"}?`
          : `Are you sure you want to clear all ${countToClear} ${filterTab === "baker" ? "kitchen" : "stock"} alerts?`,
      confirmLabel: "Clear All",
      variant: "danger",
    });
    if (!confirmed) return;

    setIsClearing(true);
    try {
      const res = await fetch("/api/notifications", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clear_all: true,
          business_id: business.id,
          filter: filterTab,
          user_id: userId,
        }),
      });

      if (res.ok) {
        if (filterTab === "all") {
          setItems([]);
        } else if (filterTab === "baker") {
          setItems((prev) => prev.filter((it) => it.kind !== "baker_broadcast" && !it.kind?.includes("baker")));
        } else if (filterTab === "stock") {
          setItems((prev) => prev.filter((it) => it.kind !== "stock"));
        }
        markAsRead();
        toast({ title: "Alerts Cleared", description: "Store notifications cleared successfully." });
      } else {
        toast({ title: "Error", description: "Failed to clear alerts.", variant: "error" });
      }
    } catch {
      toast({ title: "Error", description: "Network error while clearing alerts.", variant: "error" });
    } finally {
      setIsClearing(false);
    }
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      const query = supabaseClient
        .from('notifications')
        .select('id,message,kind,created_at,product_id,meta')
        .order('created_at', { ascending: false });
      if (business?.id) {
        query.eq('business_id', business.id);
      }
      const { data } = await query;
      setItems((data as Notification[]) || []);
      setLoading(false);
    })();
    const ch = supabaseClient
      .channel('notif-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, (payload: any) => {
        if (!business?.id || payload.new?.business_id === business.id) {
          setItems(prev => [payload.new as Notification, ...prev]);
        }
      })
      .subscribe();
    return () => { try { supabaseClient.removeChannel(ch); } catch { } };
  }, [business?.id]);

  const filteredItems = useMemo(() => {
    if (filterTab === "baker") {
      return items.filter(it => it.kind === "baker_broadcast" || it.kind?.includes("baker"));
    }
    if (filterTab === "stock") {
      return items.filter(it => it.kind === "stock");
    }
    return items;
  }, [items, filterTab]);

  const bakerCount = items.filter(it => it.kind === "baker_broadcast" || it.kind?.includes("baker")).length;

  return (
    <div>
      <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-[#EFF6FF] text-[#2563EB] rounded-2xl border border-[#BFDBFE] shadow-2xs shrink-0">
              <Bell size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-[#0F172A] tracking-tight">Store Notifications</h1>
                {bakerCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-800 border border-blue-200">
                    {bakerCount} Kitchen Alert{bakerCount === 1 ? "" : "s"}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">Live operational alerts, B2B kitchen notices &amp; stock updates</p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
            <button
              type="button"
              onClick={handleMarkAllAsRead}
              className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all shadow-2xs flex items-center gap-2 cursor-pointer active:scale-95"
            >
              <CheckCheck size={14} className="text-blue-600 shrink-0" />
              <span>Mark All as Read</span>
              {unreadCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-rose-600 text-white text-[10px] font-black">
                  {unreadCount}
                </span>
              )}
            </button>

            {isStoreAdmin && items.length > 0 && (
              <button
                type="button"
                disabled={isClearing}
                onClick={handleClearAll}
                className="px-3.5 py-2 rounded-xl border border-rose-200 bg-rose-50/80 hover:bg-rose-100 text-rose-700 text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer active:scale-95 disabled:opacity-50"
                title="Store Admin: Clear all alerts for this store"
              >
                <Trash2 size={14} className="text-rose-600 shrink-0" />
                <span>{isClearing ? "Clearing..." : "Clear Alerts"}</span>
              </button>
            )}
          </div>
        </div>

        {/* Filter Navigation */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl overflow-x-auto scrollbar-none">
          <button
            type="button"
            onClick={() => setFilterTab("all")}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap",
              filterTab === "all"
                ? "bg-white text-[#0F172A] shadow-2xs"
                : "text-slate-600 hover:text-slate-900"
            )}
          >
            All ({items.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterTab("baker")}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap",
              filterTab === "baker"
                ? "bg-white text-blue-700 shadow-2xs"
                : "text-slate-600 hover:text-slate-900"
            )}
          >
            <Radio size={12} className={filterTab === "baker" ? "text-blue-600" : ""} />
            <span>Kitchen Advisories ({bakerCount})</span>
          </button>
          <button
            type="button"
            onClick={() => setFilterTab("stock")}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap",
              filterTab === "stock"
                ? "bg-white text-amber-700 shadow-2xs"
                : "text-slate-600 hover:text-slate-900"
            )}
          >
            <Box size={12} className={filterTab === "stock" ? "text-amber-600" : ""} />
            <span>Stock Alerts ({items.filter(it => it.kind === "stock").length})</span>
          </button>
        </div>

        <NotificationList
          notifications={filteredItems}
          loading={loading}
          currentUserId={userId}
          onMarkAsRead={handleMarkOneAsRead}
          onDelete={isStoreAdmin ? handleDeleteOne : undefined}
          canDelete={isStoreAdmin}
        />
      </div>
    </div>
  );
}
