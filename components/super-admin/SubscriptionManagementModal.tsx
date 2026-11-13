"use client";

import React, { useEffect, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils/cn";
import type {
  SubscriptionEvent,
  SubscriptionPlan,
  TenantSubscription,
} from "@/lib/subscription/plans";
import {
  Calendar,
  History,
  Loader2,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  ArrowUpRight,
} from "lucide-react";

interface SubscriptionManagementModalProps {
  business: {
    id: string;
    name: string;
    slug: string;
    subscription?: TenantSubscription | null;
    active_products_count?: number;
    employee_seats_count?: number;
  };
  plans: SubscriptionPlan[];
  initialTab?: "change_plan" | "extend" | "edit_expiry" | "history";
  onClose: () => void;
  onUpdated: () => Promise<void> | void;
}

export function SubscriptionManagementModal({
  business,
  plans,
  initialTab = "change_plan",
  onClose,
  onUpdated,
}: SubscriptionManagementModalProps) {
  const { toast } = useToast();
  const [tab, setTab] = useState<"change_plan" | "extend" | "edit_expiry" | "history">(
    initialTab
  );
  const [loadingDetails, setLoadingDetails] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [subscription, setSubscription] = useState<TenantSubscription | null>(
    business.subscription || null
  );
  const [events, setEvents] = useState<SubscriptionEvent[]>([]);
  const [usage, setUsage] = useState({
    activeProducts: business.active_products_count || 0,
    employeeLogins: business.employee_seats_count || 0,
  });

  // Action states
  const [selectedPlanId, setSelectedPlanId] = useState<string>(
    business.subscription?.plan_id || plans[0]?.id || ""
  );
  const [billingDuration, setBillingDuration] = useState<number>(1);
  const [extendDuration, setExtendDuration] = useState<number | "custom">(1);
  const [customExpiry, setCustomExpiry] = useState<string>("");
  const [reason, setReason] = useState<string>("");

  // Custom overrides for change plan
  const [useCustomOverrides, setUseCustomOverrides] = useState(false);
  const [overridePrice, setOverridePrice] = useState("");
  const [overrideProducts, setOverrideProducts] = useState("");
  const [overrideUnlimitedProducts, setOverrideUnlimitedProducts] = useState(false);
  const [overrideSeats, setOverrideSeats] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      setLoadingDetails(true);
      try {
        const {
          data: { session },
        } = await supabaseClient.auth.getSession();
        const token = session?.access_token;
        const res = await fetch(
          `/api/super-admin/subscriptions?businessId=${encodeURIComponent(business.id)}`,
          {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            cache: "no-store",
          }
        );
        const data = await res.json().catch(() => ({}));
        if (!active) return;
        if (data.subscription) {
          setSubscription(data.subscription);
          setSelectedPlanId(data.subscription.plan_id);
          if (data.subscription.expiry_date) {
            setCustomExpiry(String(data.subscription.expiry_date).slice(0, 10));
          }
        }
        if (Array.isArray(data.events)) setEvents(data.events);
        if (data.usage) {
          setUsage({
            activeProducts: data.usage.activeProducts || 0,
            employeeLogins: data.usage.employeeLogins || 0,
          });
        }
      } finally {
        if (active) setLoadingDetails(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [business.id]);

  async function executeAction(actionPayload: Record<string, any>, successTitle: string) {
    if (!reason.trim()) {
      toast({
        title: "Administrative Note Required",
        description: "Please enter a reason or note for the subscription audit log.",
        variant: "error",
      });
      return;
    }

    setSubmitting(true);
    try {
      const {
        data: { session },
      } = await supabaseClient.auth.getSession();
      const token = session?.access_token;
      const res = await fetch("/api/super-admin/subscriptions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          businessId: business.id,
          reason: reason.trim(),
          ...actionPayload,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Subscription update failed");
      }

      toast({ title: successTitle, variant: "success" });
      await onUpdated();
      onClose();
    } catch (err: any) {
      toast({
        title: "Action Failed",
        description: err.message || "Could not update subscription.",
        variant: "error",
      });
    } finally {
      setSubmitting(false);
    }
  }

  const selectedPlan = plans.find((p) => p.id === selectedPlanId);
  const isSuspended = subscription?.subscription_status === "suspended";

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-[#E2E8F0] space-y-5 my-8">
        <div className="flex items-start justify-between border-b border-[#E2E8F0] pb-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-extrabold text-[#0F172A]">
                Subscription: {business.name}
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-blue-50 text-blue-700 border border-blue-200">
                {subscription?.plan_name_snapshot || "Free"}
              </span>
              <span
                className={cn(
                  "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border",
                  isSuspended
                    ? "bg-rose-50 text-rose-700 border-rose-200"
                    : "bg-emerald-50 text-emerald-700 border-emerald-200"
                )}
              >
                {subscription?.subscription_status || "active"}
              </span>
            </div>
            <p className="text-xs text-[#64748B] mt-1">
              Usage: <strong>{usage.activeProducts}</strong> /{" "}
              {subscription?.product_limit_snapshot ?? "Unlimited"} active products •{" "}
              <strong>{usage.employeeLogins}</strong> / {subscription?.employee_limit_snapshot ?? 0}{" "}
              employee logins
              {subscription?.expiry_date
                ? ` • Expires ${new Date(subscription.expiry_date).toLocaleDateString("en-IN")}`
                : " • No expiry"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[#64748B] hover:text-[#0F172A] font-bold p-1 cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 border-b border-[#E2E8F0] pb-2 overflow-x-auto text-xs font-bold">
          {[
            { id: "change_plan", label: "Change Plan", icon: ArrowUpRight },
            { id: "extend", label: "Extend", icon: RefreshCw },
            { id: "edit_expiry", label: "Edit Expiry", icon: Calendar },
            { id: "history", label: "Audit History", icon: History },
          ].map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id as any)}
                className={cn(
                  "px-3 py-1.5 rounded-xl flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-all",
                  tab === t.id
                    ? "bg-[#2563EB] text-white"
                    : "text-[#64748B] hover:bg-slate-100 hover:text-[#0F172A]"
                )}
              >
                <Icon size={13} />
                <span>{t.label}</span>
              </button>
            );
          })}

          <div className="ml-auto">
            {isSuspended ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={submitting}
                onClick={() => executeAction({ action: "reactivate" }, "Subscription Reactivated")}
                className="h-8 text-xs text-emerald-700 border-emerald-200 hover:bg-emerald-50 gap-1 cursor-pointer"
              >
                <PlayCircle size={13} /> Reactivate
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={submitting}
                onClick={() => executeAction({ action: "suspend" }, "Subscription Suspended")}
                className="h-8 text-xs text-rose-700 border-rose-200 hover:bg-rose-50 gap-1 cursor-pointer"
              >
                <PauseCircle size={13} /> Suspend
              </Button>
            )}
          </div>
        </div>

        {tab === "change_plan" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-[#0F172A]">Target Plan</label>
                <select
                  value={selectedPlanId}
                  onChange={(e) => setSelectedPlanId(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-[#E2E8F0] text-xs font-bold bg-white"
                >
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.plan_name} — ₹{p.monthly_price}/mo (
                      {p.max_active_products === null ? "Unlimited" : p.max_active_products} products,{" "}
                      {p.max_employee_seats} seats)
                    </option>
                  ))}
                </select>
              </div>

              {selectedPlan?.plan_key !== "free" && (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#0F172A]">Billing Duration</label>
                  <select
                    value={billingDuration}
                    onChange={(e) => setBillingDuration(Number(e.target.value))}
                    className="w-full h-10 px-3 rounded-xl border border-[#E2E8F0] text-xs font-bold bg-white"
                  >
                    <option value={1}>1 Month</option>
                    <option value={3}>3 Months</option>
                    <option value={6}>6 Months</option>
                    <option value={12}>12 Months</option>
                  </select>
                </div>
              )}
            </div>

            <label className="flex items-center gap-2 text-xs font-semibold text-[#0F172A] cursor-pointer">
              <input
                type="checkbox"
                checked={useCustomOverrides}
                onChange={(e) => setUseCustomOverrides(e.target.checked)}
                className="rounded text-[#2563EB]"
              />
              Custom Plan Configuration (store-only overrides)
            </label>

            {useCustomOverrides && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 rounded-2xl bg-slate-50 border border-[#E2E8F0]">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-[#0F172A]">Custom Price (₹)</label>
                  <Input
                    type="number"
                    min={0}
                    placeholder={String(selectedPlan?.monthly_price ?? 0)}
                    value={overridePrice}
                    onChange={(e) => setOverridePrice(e.target.value)}
                    className="h-9 text-xs bg-white"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold text-[#0F172A]">Product Limit</label>
                    <label className="flex items-center gap-1 text-[10px] text-[#2563EB] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={overrideUnlimitedProducts}
                        onChange={(e) => setOverrideUnlimitedProducts(e.target.checked)}
                      />
                      Unlim.
                    </label>
                  </div>
                  <Input
                    type="number"
                    min={0}
                    disabled={overrideUnlimitedProducts}
                    placeholder={
                      selectedPlan?.max_active_products === null
                        ? "Unlimited"
                        : String(selectedPlan?.max_active_products ?? 5)
                    }
                    value={overrideUnlimitedProducts ? "" : overrideProducts}
                    onChange={(e) => setOverrideProducts(e.target.value)}
                    className="h-9 text-xs bg-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-[#0F172A]">Employee Seats</label>
                  <Input
                    type="number"
                    min={0}
                    placeholder={String(selectedPlan?.max_employee_seats ?? 0)}
                    value={overrideSeats}
                    onChange={(e) => setOverrideSeats(e.target.value)}
                    className="h-9 text-xs bg-white"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "extend" && (
          <div className="space-y-3">
            <p className="text-xs text-[#64748B]">
              Active subscriptions extend from their current expiry date; expired subscriptions extend from today.
            </p>
            <div className="flex flex-wrap gap-2">
              {[1, 3, 6, 12].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setExtendDuration(m)}
                  className={cn(
                    "px-3.5 py-2 rounded-xl text-xs font-bold border cursor-pointer transition-all",
                    extendDuration === m
                      ? "bg-[#2563EB] text-white border-[#2563EB]"
                      : "bg-white text-[#0F172A] border-[#E2E8F0] hover:bg-slate-50"
                  )}
                >
                  +{m} {m === 1 ? "Month" : "Months"}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setExtendDuration("custom")}
                className={cn(
                  "px-3.5 py-2 rounded-xl text-xs font-bold border cursor-pointer transition-all",
                  extendDuration === "custom"
                    ? "bg-[#2563EB] text-white border-[#2563EB]"
                    : "bg-white text-[#0F172A] border-[#E2E8F0] hover:bg-slate-50"
                )}
              >
                Custom Date
              </button>
            </div>
            {extendDuration === "custom" && (
              <div className="space-y-1 max-w-xs">
                <label className="text-xs font-bold text-[#0F172A]">New Expiry Date</label>
                <Input
                  type="date"
                  value={customExpiry}
                  onChange={(e) => setCustomExpiry(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
            )}
          </div>
        )}

        {tab === "edit_expiry" && (
          <div className="space-y-2 max-w-xs">
            <label className="text-xs font-bold text-[#0F172A]">
              Expiry Date (leave blank for no expiry)
            </label>
            <Input
              type="date"
              value={customExpiry}
              onChange={(e) => setCustomExpiry(e.target.value)}
              className="h-9 text-xs"
            />
          </div>
        )}

        {tab === "history" && (
          <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
            {loadingDetails ? (
              <div className="py-8 flex items-center justify-center text-xs text-[#64748B] gap-2">
                <Loader2 className="animate-spin" size={14} /> Loading audit history...
              </div>
            ) : events.length === 0 ? (
              <p className="text-xs text-[#64748B] py-6 text-center">
                No subscription events recorded yet.
              </p>
            ) : (
              events.map((ev) => (
                <div
                  key={ev.id}
                  className="p-3 rounded-xl border border-[#E2E8F0] bg-slate-50/70 text-xs space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[#0F172A]">{ev.event_type}</span>
                    <span className="text-[11px] text-[#64748B]">
                      {new Date(ev.created_at).toLocaleString("en-IN")}
                    </span>
                  </div>
                  <p className="text-[#334155]">{ev.reason}</p>
                  <div className="text-[11px] text-[#64748B]">
                    By: {ev.admin_email || ev.admin_id || "System"}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {tab !== "history" && (
          <div className="space-y-1.5 pt-2 border-t border-[#E2E8F0]">
            <label className="text-xs font-bold text-[#0F172A]">
              Administrative Note / Reason *
            </label>
            <Input
              placeholder="e.g., Upgraded to Pro for 6 months per client payment confirmation"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="h-9 text-xs"
            />
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="rounded-xl text-xs cursor-pointer"
          >
            Close
          </Button>
          {tab === "change_plan" && (
            <Button
              type="button"
              disabled={submitting}
              onClick={() =>
                executeAction(
                  {
                    action: "change_plan",
                    planId: selectedPlanId,
                    billingDurationMonths: billingDuration,
                    customOverrides: useCustomOverrides
                      ? {
                          monthly_price: overridePrice,
                          max_active_products: overrideProducts,
                          is_unlimited_products: overrideUnlimitedProducts,
                          max_employee_seats: overrideSeats,
                        }
                      : undefined,
                  },
                  "Subscription Plan Updated"
                )
              }
              className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold rounded-xl text-xs px-5 cursor-pointer"
            >
              {submitting ? <Loader2 className="animate-spin" size={14} /> : "Apply Plan Change"}
            </Button>
          )}
          {tab === "extend" && (
            <Button
              type="button"
              disabled={submitting}
              onClick={() =>
                executeAction(
                  extendDuration === "custom"
                    ? { action: "extend", customExpiryDate: customExpiry }
                    : { action: "extend", durationMonths: extendDuration },
                  "Subscription Extended"
                )
              }
              className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold rounded-xl text-xs px-5 cursor-pointer"
            >
              {submitting ? <Loader2 className="animate-spin" size={14} /> : "Extend Subscription"}
            </Button>
          )}
          {tab === "edit_expiry" && (
            <Button
              type="button"
              disabled={submitting}
              onClick={() =>
                executeAction(
                  { action: "edit_expiry", expiryDate: customExpiry || null },
                  "Expiry Date Updated"
                )
              }
              className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold rounded-xl text-xs px-5 cursor-pointer"
            >
              {submitting ? <Loader2 className="animate-spin" size={14} /> : "Save Expiry Date"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

