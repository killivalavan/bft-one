"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { supabaseClient } from "@/lib/supabaseClient";
import { useProfile } from "@/lib/hooks/useProfile";
import { useTenant } from "@/lib/context/TenantContext";
import type { EffectiveEntitlements } from "@/lib/subscription/plans";
import { AlertTriangle, X, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export function SubscriptionExpiryBanner() {
  const { flags } = useProfile();
  const { business } = useTenant();
  const [entitlements, setEntitlements] = useState<EffectiveEntitlements | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const isStoreAdmin = Boolean(flags?.isAdmin && !flags?.isSuperAdmin);

  useEffect(() => {
    if (!isStoreAdmin || !business?.id) return;
    const dismissKey = `cc_sub_banner_dismissed_${business.id}`;
    if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(dismissKey) === "1") {
      setDismissed(true);
      return;
    }

    let active = true;
    async function check() {
      try {
        const {
          data: { session },
        } = await supabaseClient.auth.getSession();
        const token = session?.access_token;
        if (!token) return;
        const res = await fetch("/api/subscription/me", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = await res.json();
        if (active && data?.entitlements) {
          setEntitlements(data.entitlements);
        }
      } catch {}
    }
    check();
    return () => {
      active = false;
    };
  }, [isStoreAdmin, business?.id]);

  if (!isStoreAdmin || dismissed || !entitlements) return null;
  if (entitlements.notificationLevel === "none") return null;

  const isExpired = entitlements.notificationLevel === "expired";
  const is3Days = entitlements.notificationLevel === "3_days";

  const message = isExpired
    ? "Your subscription has expired. Your account is now subject to Free plan limits."
    : is3Days
      ? "Your subscription is approaching expiry. Please renew your plan."
      : `Your subscription expires in ${entitlements.daysRemaining} days. Renew your plan to continue enjoying your current features.`;

  return (
    <div
      className={cn(
        "px-4 py-2.5 text-xs font-medium flex items-center justify-between gap-3 border-b",
        isExpired
          ? "bg-rose-50 text-rose-900 border-rose-200"
          : "bg-amber-50 text-amber-950 border-amber-200"
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        <AlertTriangle
          size={15}
          className={cn("shrink-0", isExpired ? "text-rose-600" : "text-amber-600")}
        />
        <span className="truncate">{message}</span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Link
          href="/admin/subscription"
          className={cn(
            "inline-flex items-center gap-1 font-bold underline underline-offset-2",
            isExpired ? "text-rose-800" : "text-amber-900"
          )}
        >
          <span>Renew Plan</span>
          <ArrowRight size={12} />
        </Link>
        <button
          type="button"
          onClick={() => {
            setDismissed(true);
            try {
              if (business?.id) {
                sessionStorage.setItem(`cc_sub_banner_dismissed_${business.id}`, "1");
              }
            } catch {}
          }}
          aria-label="Dismiss subscription reminder"
          className="p-1 rounded-md hover:bg-black/5 cursor-pointer"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

