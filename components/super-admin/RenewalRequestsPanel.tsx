"use client";

import React, { useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils/cn";
import type { SubscriptionRequest } from "@/lib/subscription/plans";
import { Check, X, Clock, Loader2 } from "lucide-react";

interface RenewalRequestsPanelProps {
  requests: SubscriptionRequest[];
  onRefresh: () => Promise<void> | void;
}

export function RenewalRequestsPanel({ requests, onRefresh }: RenewalRequestsPanelProps) {
  const { toast } = useToast();
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [decision, setDecision] = useState<"approved" | "rejected" | null>(null);
  const [adminNote, setAdminNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const pendingCount = requests.filter((r) => r.request_status === "pending").length;

  async function handleReview(e: React.FormEvent) {
    e.preventDefault();
    if (!reviewingId || !decision) return;
    if (!adminNote.trim()) {
      toast({
        title: "Administrative Note Required",
        description: "Please enter a note explaining approval or rejection.",
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
          action: "review_request",
          requestId: reviewingId,
          decision,
          reason: adminNote.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to review request");

      toast({
        title: decision === "approved" ? "Request Approved & Activated" : "Request Rejected",
        variant: "success",
      });
      setReviewingId(null);
      setDecision(null);
      setAdminNote("");
      await onRefresh();
    } catch (err: any) {
      toast({ title: "Review Failed", description: err.message, variant: "error" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-extrabold text-[#0F172A]">
            Store Renewal & Upgrade Requests
          </h2>
          <p className="text-xs text-[#64748B]">
            Review and approve Store Admin subscription requests. Paid plans activate only upon Super Admin approval.
          </p>
        </div>
        {pendingCount > 0 && (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
            {pendingCount} Pending
          </span>
        )}
      </div>

      {requests.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#E2E8F0] p-8 text-center text-xs text-[#64748B]">
          No subscription renewal or upgrade requests found.
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-[#E2E8F0] overflow-x-auto shadow-xs">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-[#E2E8F0] text-[#64748B] uppercase text-[11px]">
              <tr>
                <th className="py-3 px-4">Store</th>
                <th className="py-3 px-4">Current Plan</th>
                <th className="py-3 px-4">Requested Plan</th>
                <th className="py-3 px-4">Duration</th>
                <th className="py-3 px-4">Requested At</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {requests.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/70">
                  <td className="py-3 px-4 font-bold text-[#0F172A]">
                    <div>{r.businesses?.name || r.business_id}</div>
                    {r.businesses?.enabled_modules?.store_id && (
                      <div className="text-[10px] font-mono text-[#64748B]">
                        {r.businesses.enabled_modules.store_id}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-4 capitalize text-[#64748B]">{r.current_plan_key}</td>
                  <td className="py-3 px-4 font-bold text-[#2563EB]">
                    {r.requested_plan?.plan_name || "Plan"} (₹
                    {r.requested_plan?.monthly_price ?? 0}/mo)
                  </td>
                  <td className="py-3 px-4 font-semibold">
                    {r.requested_duration_months}{" "}
                    {r.requested_duration_months === 1 ? "Month" : "Months"}
                  </td>
                  <td className="py-3 px-4 text-[#64748B]">
                    {new Date(r.created_at).toLocaleString("en-IN")}
                  </td>
                  <td className="py-3 px-4">
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
                      {r.request_status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    {r.request_status === "pending" ? (
                      <div className="inline-flex items-center gap-1.5">
                        <Button
                          size="sm"
                          onClick={() => {
                            setReviewingId(r.id);
                            setDecision("approved");
                            setAdminNote("");
                          }}
                          className="h-7 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] rounded-lg gap-1 cursor-pointer"
                        >
                          <Check size={12} /> Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setReviewingId(r.id);
                            setDecision("rejected");
                            setAdminNote("");
                          }}
                          className="h-7 px-2.5 text-rose-700 border-rose-200 hover:bg-rose-50 text-[11px] rounded-lg gap-1 cursor-pointer"
                        >
                          <X size={12} /> Reject
                        </Button>
                      </div>
                    ) : (
                      <span className="text-[11px] text-[#64748B]">
                        {r.admin_note || "Reviewed"}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {reviewingId && decision && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleReview}
            className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-[#E2E8F0] space-y-4"
          >
            <h3 className="text-base font-extrabold text-[#0F172A]">
              {decision === "approved"
                ? "Approve & Activate Subscription"
                : "Reject Subscription Request"}
            </h3>
            <p className="text-xs text-[#64748B]">
              {decision === "approved"
                ? "Approving will activate or extend the requested plan for this store and record an audit event."
                : "Rejecting will leave the store on its current subscription status."}
            </p>
            <div className="space-y-1">
              <label className="text-xs font-bold text-[#0F172A]">Administrative Note *</label>
              <Input
                placeholder="Enter reason or payment reference..."
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
                required
                className="h-9 text-xs"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setReviewingId(null);
                  setDecision(null);
                }}
                className="rounded-xl text-xs cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                className={cn(
                  "rounded-xl text-xs font-bold text-white px-4 cursor-pointer",
                  decision === "approved"
                    ? "bg-emerald-600 hover:bg-emerald-700"
                    : "bg-rose-600 hover:bg-rose-700"
                )}
              >
                {submitting ? (
                  <Loader2 className="animate-spin" size={14} />
                ) : decision === "approved" ? (
                  "Confirm Approval"
                ) : (
                  "Confirm Rejection"
                )}
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

