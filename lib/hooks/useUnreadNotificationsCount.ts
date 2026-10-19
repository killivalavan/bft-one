"use client";

import { useState, useEffect, useCallback } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { useTenant } from "@/lib/context/TenantContext";
import { useUser } from "@/lib/hooks/useUser";

export function useUnreadNotificationsCount() {
  const { business } = useTenant();
  const { user } = useUser();
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const bizId = business?.id;
  const userId = user?.id;

  const getStorageKey = useCallback(() => {
    return userId
      ? `bftone_read_notifs_${userId}`
      : bizId
      ? `bftone_read_notifs_${bizId}`
      : "bftone_read_notifs_default";
  }, [userId, bizId]);

  const fetchUnreadCount = useCallback(async () => {
    if (!bizId) return;

    try {
      const storageKey = getStorageKey();
      let locallyReadIds: string[] = [];
      try {
        locallyReadIds = JSON.parse(localStorage.getItem(storageKey) || "[]");
      } catch {}

      const { data: notifs, error } = await supabaseClient
        .from("notifications")
        .select("id, meta")
        .eq("business_id", bizId);

      if (!error && notifs) {
        let count = 0;
        for (const n of notifs) {
          const meta = n.meta && typeof n.meta === "object" ? n.meta : {};
          const readBy: string[] = Array.isArray(meta.read_by) ? meta.read_by : [];
          const isRead = (userId && readBy.includes(userId)) || locallyReadIds.includes(n.id);
          if (!isRead) {
            count++;
          }
        }
        setUnreadCount(count);
      }
    } catch (err) {
      console.warn("Failed to fetch unread notification count", err);
    }
  }, [bizId, userId, getStorageKey]);

  const markAsRead = useCallback(
    async (notificationId?: string) => {
      if (!bizId || typeof window === "undefined") return;

      const storageKey = getStorageKey();
      let currentLocalIds: string[] = [];
      try {
        currentLocalIds = JSON.parse(localStorage.getItem(storageKey) || "[]");
      } catch {}

      if (notificationId) {
        // Mark single item read for this user
        if (!currentLocalIds.includes(notificationId)) {
          currentLocalIds.push(notificationId);
          try {
            localStorage.setItem(storageKey, JSON.stringify(currentLocalIds));
          } catch {}
        }
        setUnreadCount((prev) => Math.max(0, prev - 1));

        window.dispatchEvent(
          new CustomEvent("bftone_notifications_read", {
            detail: { id: notificationId, userId },
          })
        );

        if (userId) {
          fetch("/api/notifications", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: notificationId,
              user_id: userId,
              business_id: bizId,
              status: "read",
            }),
          }).catch(() => {});
        }
      } else {
        // Mark all read for this user
        setUnreadCount(0);
        window.dispatchEvent(
          new CustomEvent("bftone_notifications_read", {
            detail: { mark_all: true, userId },
          })
        );

        if (userId) {
          fetch("/api/notifications", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mark_all: true,
              user_id: userId,
              business_id: bizId,
            }),
          }).catch(() => {});
        }
      }
    },
    [bizId, userId, getStorageKey]
  );

  useEffect(() => {
    Promise.resolve().then(() => {
      fetchUnreadCount();
    });

    const handleReadEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ mark_all?: boolean; userId?: string }>;
      const detail = customEvent.detail;
      if (detail?.mark_all && detail?.userId === userId) {
        setUnreadCount(0);
      } else {
        fetchUnreadCount();
      }
    };

    const handleFocus = () => {
      fetchUnreadCount();
    };

    window.addEventListener("focus", handleFocus);
    window.addEventListener("bftone_notifications_read", handleReadEvent);

    // Realtime listener for incoming notifications
    const channel = supabaseClient
      .channel(`notif-count-${bizId || "global"}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
        },
        (payload: { new?: { business_id?: string } }) => {
          if (!bizId || payload.new?.business_id === bizId) {
            setUnreadCount((prev) => prev + 1);
          }
        }
      )
      .subscribe();

    return () => {
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("bftone_notifications_read", handleReadEvent);
      try {
        supabaseClient.removeChannel(channel);
      } catch {}
    };
  }, [bizId, userId, fetchUnreadCount]);

  return { unreadCount, markAsRead, refreshCount: fetchUnreadCount, userId };
}
