"use client";

import React, { useEffect, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils/cn";
import type {
  EffectiveEntitlements,
  SubscriptionPlan,
  SubscriptionRequest,
} from "@/lib/subscription/plans";
import {
  CreditCard,
  Package,
  Users,
  ShieldCheck,
  Sparkles,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Infinity as InfinityIcon,
  Loader2,
  ArrowUpRight,
} from "lucide-react";

export function MySubscriptionView() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [entitlements, setEntitlements] = useState<EffectiveEntitlements | null>(null);
  const [availablePlans, setAvailablePlans] = useState<SubscriptionPlan[]>([]);
  const [requests, setRequests] = useState<SubscriptionRequest[]>([]);

  // Renewal / Upgrade request modal
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [durationMonths, setDurationMonths] = useState<1 | 3 | 6 | 12>(1);
  const [requestNote, setRequestNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function loadSubscription() {
    setLoading(true);
    try {
      const {
        data: { session },
      } = await supabaseClient.auth.getSession();
      const token = session?.access_token;
      const res = await fetch("/api/subscription/me", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to load subscription");
      setEntitlements(data.entitlements || null);
      setAvailablePlans(data.availablePlans || []);
      setRequests(data.requests || []);
      if (data.availablePlans?.length > 0) {
        const paid = data.availablePlans.find((p: SubscriptionPlan) => p.plan_key !== "free");
        setSelectedPlanId(paid?.id || data.availablePlans[0].id);
      }
    } catch (err: any) {
      toast({
        title: "Could not load subscription",
        description: err.message,
        variant: "error",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSubscription();
  }, []);

  async function handleSubmitRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPlanId) return;
    setSubmitting(true);
    try {
      const {
        data: { session },
      } = await supabaseClient.auth.getSession();
      const token = session?.access_token;
      const res = await fetch("/api/subscription/me", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          requestedPlanId: selectedPlanId,
          requestedDurationMonths: durationMonths,
          requestNote: requestNote.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to submit request");

      toast({
        title: "Subscription Request Submitted",
        description: "Super Admin will review and activate your requested plan.",
        variant: "success",
      });
      setShowRequestModal(false);
      setRequestNote("");
      await loadSubscription();
    } catch (err: any) {
      toast({ title: "Request Failed", description: err.message, variant: "error" });
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="py-20 flex items-center justify-center gap-2 text-sm text-[#64748B]">
        <Loader2 className="animate-spin text-[#2563EB]" size={20} />
        <span>Loading subscription details...</span>
      </div>
    );
  }

  if (!entitlements) {
    return (
      <Card className="border-[#E2E8F0]">
        <CardContent className="p-6 text-sm text-[#64748B]">
          Subscription details are currently unavailable.
        </CardContent>
      </Card>
    );
  }

  const productPct =
    entitlements.maxActiveProducts === null
      ? 0
      : entitlements.maxActiveProducts === 0
        ? 100
        : Math.min(
            100,
            Math.round((entitlements.usage.activeProducts / entitlements.maxActiveProducts) * 100)
          );

  const seatPct =
    entitlements.maxEmployeeSeats === 0
      ? entitlements.usage.employeeLogins > 0
        ? 100
        : 0
      : Math.min(
          100,
          Math.round((entitlements.usage.employeeLogins / entitlements.maxEmployeeSeats) * 100)
        );

  const isFreeOrFallback =
    entitlements.planKey === "free" || entitlements.isExpiredFallback;

  const statusBadgeClass =
    entitlements.derivedStatus === "active"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : entitlements.derivedStatus === "expiring_soon"
        ? "bg-amber-50 text-amber-700 border-amber-200"
        : entitlements.derivedStatus === "expired" || entitlements.derivedStatus === "suspended"
          ? "bg-rose-50 text-rose-700 border-rose-200"
          : "bg-slate-100 text-slate-700 border-slate-200";

  return (
    <div className="space-y-6">
      {/* Expired Fallback Warning */}
      {entitlements.isExpiredFallback && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="text-rose-600 shrink-0 mt-0.5" size={18} />
            <div className="text-xs text-rose-900 space-y-0.5">
              <div className="font-bold text-sm">
                Your {entitlements.planName} subscription has expired
              </div>
              <p>
                Your account is currently subject to Free plan limits (max 5 active products, 0 new employee logins). All existing data, sales, and records are safely preserved.
              </p>
            </div>
          </div>
          <Button
            onClick={() => setShowRequestModal(true)}
            className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shrink-0 cursor-pointer"
          >
            Renew Plan
          </Button>
        </div>
      )}

      {/* Subscription Overview */}
      <Card className="border-[#E2E8F0] shadow-xs rounded-2xl bg-white">
        <CardContent className="p-5 sm:p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-xl font-extrabold text-[#0F172A]">
                  {entitlements.planName} Plan
                </h2>
                <span
                  className={cn(
                    "px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase border",
                    statusBadgeClass
                  )}
                >
                  {entitlements.derivedStatus.replace("_", " ")}
                </span>
              </div>
              <p className="text-xs text-[#64748B]">
                Monthly Price:{" "}
                <strong className="text-[#0F172A]">
                  ₹{Number(entitlements.monthlyPrice).toLocaleString("en-IN")}/month
                </strong>{" "}
                • Support:{" "}
                <strong className="capitalize text-[#0F172A]">
                  {entitlements.supportLevel} Support
                </strong>
              </p>
            </div>

            <Button
              onClick={() => setShowRequestModal(true)}
              className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs rounded-xl px-4 h-10 gap-1.5 cursor-pointer self-start sm:self-auto"
            >
              <ArrowUpRight size={15} />
              <span>Renew / Upgrade Plan</span>
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs">
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/70">
              <div className="text-[#64748B] font-medium">Activation Date</div>
              <div className="font-bold text-[#0F172A] mt-1">
                {entitlements.startDate
                  ? new Date(entitlements.startDate).toLocaleDateString("en-IN")
                  : "—"}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/70">
              <div className="text-[#64748B] font-medium">Expiry Date</div>
              <div className="font-bold text-[#0F172A] mt-1">
                {entitlements.expiryDate
                  ? new Date(entitlements.expiryDate).toLocaleDateString("en-IN")
                  : "No Expiry (Free)"}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/70">
              <div className="text-[#64748B] font-medium">Days Remaining</div>
              <div className="font-bold text-[#0F172A] mt-1">
                {entitlements.daysRemaining === null
                  ? "—"
                  : entitlements.daysRemaining <= 0
                    ? "Expired"
                    : `${entitlements.daysRemaining} days`}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/70">
              <div className="text-[#64748B] font-medium">Support Level</div>
              <div className="font-bold text-[#0F172A] mt-1 capitalize flex items-center gap-1">
                <Sparkles
                  size={13}
                  className={
                    entitlements.supportLevel === "priority" ? "text-amber-500" : "text-[#2563EB]"
                  }
                />
                {entitlements.supportLevel}
              </div>
            </div>
          </div>

          {isFreeOrFallback && (
            <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200/80 text-xs text-blue-950 flex flex-wrap items-center gap-4">
              <span className="font-bold flex items-center gap-1.5">
                <ShieldCheck size={15} className="text-[#2563EB]" /> Free Plan Entitlements:
              </span>
              <span>• 1 Store Admin login included</span>
              <span>• Employee login seats: 0</span>
              <span>• Maximum 5 active products</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Usage Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-[#E2E8F0] shadow-xs rounded-2xl bg-white">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold text-[#0F172A]">
                <Package size={16} className="text-[#2563EB]" />
                <span>Active Products</span>
              </div>
              <span className="text-xs font-extrabold text-[#0F172A] flex items-center gap-1">
                {entitlements.usage.activeProducts} /{" "}
                {entitlements.maxActiveProducts === null ? (
                  <span className="inline-flex items-center gap-1 text-[#2563EB]">
                    <InfinityIcon size={14} /> Unlimited
                  </span>
                ) : (
                  entitlements.maxActiveProducts
                )}
              </span>
            </div>

            {entitlements.maxActiveProducts !== null ? (
              <div className="w-full h-2.5 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    productPct >= 100
                      ? "bg-rose-500"
                      : productPct >= 80
                        ? "bg-amber-500"
                        : "bg-[#2563EB]"
                  )}
                  style={{ width: `${productPct}%` }}
                />
              </div>
            ) : (
              <div className="text-xs text-emerald-700 font-semibold">
                Unlimited active product capacity enabled on Business plan.
              </div>
            )}

            <p className="text-[11px] text-[#64748B]">
              POS Products: {entitlements.usage.posProducts} • B2B Products:{" "}
              {entitlements.usage.b2bProducts}. Archived products do not count toward your limit.
            </p>
          </CardContent>
        </Card>

        <Card className="border-[#E2E8F0] shadow-xs rounded-2xl bg-white">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold text-[#0F172A]">
                <Users size={16} className="text-[#2563EB]" />
                <span>Employee Login Seats</span>
              </div>
              <span className="text-xs font-extrabold text-[#0F172A]">
                {entitlements.usage.employeeLogins} / {entitlements.maxEmployeeSeats}
              </span>
            </div>

            <div className="w-full h-2.5 rounded-full bg-slate-100 overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  seatPct >= 100
                    ? "bg-rose-500"
                    : seatPct >= 80
                      ? "bg-amber-500"
                      : "bg-emerald-500"
                )}
                style={{ width: `${seatPct}%` }}
              />
            </div>

            <p className="text-[11px] text-[#64748B]">
              Store Admin logins ({entitlements.usage.adminLogins}) are included and do not consume employee login seats.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Subscription Renewal / Upgrade Requests */}
      <Card className="border-[#E2E8F0] shadow-xs rounded-2xl bg-white">
        <CardContent className="p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-extrabold text-[#0F172A]">
                Renewal &amp; Upgrade Requests
              </h3>
              <p className="text-xs text-[#64748B]">
                Requests are reviewed and activated by CounterCub Super Admin.
              </p>
            </div>
          </div>

          {requests.length === 0 ? (
            <p className="text-xs text-[#64748B] py-4">
              No subscription requests submitted yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-[#64748B] uppercase text-[11px]">
                  <tr>
                    <th className="py-2.5 px-3">Requested Plan</th>
                    <th className="py-2.5 px-3">Duration</th>
                    <th className="py-2.5 px-3">Submitted</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Admin Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {requests.map((r) => (
                    <tr key={r.id}>
                      <td className="py-2.5 px-3 font-bold text-[#0F172A]">
                        {r.requested_plan?.plan_name || "Plan"} (₹
                        {r.requested_plan?.monthly_price ?? 0}/mo)
                      </td>
                      <td className="py-2.5 px-3">
                        {r.requested_duration_months}{" "}
                        {r.requested_duration_months === 1 ? "Month" : "Months"}
                      </td>
                      <td className="py-2.5 px-3 text-[#64748B]">
                        {new Date(r.created_at).toLocaleString("en-IN")}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border",
                            r.request_status === "approved"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : r.request_status === "rejected"
                                ? "bg-rose-50 text-rose-700 border-rose-200"
                                : "bg-amber-50 text-amber-700 border-amber-200"
                          )}
                        >
                          {r.request_status === "pending" && <Clock size={10} />}
                          {r.request_status === "approved" && <CheckCircle2 size={10} />}
                          {r.request_status === "rejected" && <XCircle size={10} />}
                          {r.request_status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-[#64748B]">
                        {r.admin_note || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Request Modal */}
      {showRequestModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleSubmitRequest}
            className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-[#E2E8F0] space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <CreditCard size={18} className="text-[#2563EB]" />
                <h3 className="text-base font-extrabold text-[#0F172A]">
                  Request Plan Renewal / Upgrade
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowRequestModal(false)}
                className="text-[#64748B] hover:text-[#0F172A] font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-[#0F172A]">Select Plan</label>
                <select
                  value={selectedPlanId}
                  onChange={(e) => setSelectedPlanId(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-[#E2E8F0] text-xs font-bold bg-white"
                >
                  {availablePlans
                    .filter((p) => p.plan_key !== "free")
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.plan_name} — ₹{p.monthly_price}/mo (
                        {p.max_active_products === null ? "Unlimited" : p.max_active_products}{" "}
                        products, {p.max_employee_seats} seats)
                      </option>
                    ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-[#0F172A]">Duration</label>
                <select
                  value={durationMonths}
                  onChange={(e) =>
                    setDurationMonths(Number(e.target.value) as 1 | 3 | 6 | 12)
                  }
                  className="w-full h-10 px-3 rounded-xl border border-[#E2E8F0] text-xs font-bold bg-white"
                >
                  <option value={1}>1 Month</option>
                  <option value={3}>3 Months</option>
                  <option value={6}>6 Months</option>
                  <option value={12}>12 Months</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-[#0F172A]">Note (optional)</label>
                <Input
                  placeholder="Any billing or contact note for Super Admin..."
                  value={requestNote}
                  onChange={(e) => setRequestNote(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowRequestModal(false)}
                className="rounded-xl text-xs cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold rounded-xl text-xs px-5 cursor-pointer"
              >
                {submitting ? <Loader2 className="animate-spin" size={14} /> : "Submit Request"}
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

