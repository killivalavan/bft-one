"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  Clock,
  History,
  Loader2,
  Mail,
  RefreshCw,
  Send,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";

type AlertFilter =
  | "all"
  | "expiring_7d"
  | "expiring_3d"
  | "expiring_1d"
  | "expired"
  | "reminder_sent";

type TemplateChoice = "reminder_7d" | "reminder_3d" | "reminder_1d" | "expired_notice";

export function SubscriptionAlertsPanel() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState({
    expiringWithin7Days: 0,
    expiringWithin1Day: 0,
    alreadyExpired: 0,
    remindersAlreadySent: 0,
  });
  const [alerts, setAlerts] = useState<any[]>([]);
  const [filter, setFilter] = useState<AlertFilter>("all");
  const [search, setSearch] = useState("");

  // Preview & Confirm Modal
  const [activeAlert, setActiveAlert] = useState<any>(null);
  const [templateType, setTemplateType] = useState<TemplateChoice>("reminder_7d");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);
  const [confirmResend, setConfirmResend] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendNonce, setSendNonce] = useState("");
  const [sendResult, setSendResult] = useState<any>(null);

  // History Modal
  const [historyAlert, setHistoryAlert] = useState<any>(null);

  const authFetch = useCallback(async (url: string, init?: RequestInit) => {
    const { data } = await supabaseClient.auth.getSession();
    const token = data?.session?.access_token || "";
    return fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(init?.headers || {}),
      },
    });
  }, []);

  const loadAlerts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch("/api/super-admin/subscription-alerts");
      if (res.ok) {
        const d = await res.json();
        setSummary(
          d.summary || {
            expiringWithin7Days: 0,
            expiringWithin1Day: 0,
            alreadyExpired: 0,
            remindersAlreadySent: 0,
          }
        );
        setAlerts(d.alerts || []);
      }
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  const loadPreview = useCallback(
    async (businessId: string, tpl: TemplateChoice) => {
      setPreviewLoading(true);
      setPreviewData(null);
      setConfirmResend(false);
      setSendResult(null);
      try {
        const res = await authFetch("/api/super-admin/subscription-alerts", {
          method: "POST",
          body: JSON.stringify({ action: "preview", businessId, templateType: tpl }),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) {
          setPreviewData({ error: d.error || "Unable to load preview." });
        } else {
          setPreviewData(d);
        }
      } finally {
        setPreviewLoading(false);
      }
    },
    [authFetch]
  );

  function openSendModal(row: any, defaultTpl?: TemplateChoice) {
    const suggested: TemplateChoice =
      defaultTpl ||
      (row.daysRemaining < 0 || row.subscriptionStatus === "expired"
        ? "expired_notice"
        : row.daysRemaining <= 1
          ? "reminder_1d"
          : row.daysRemaining <= 3
            ? "reminder_3d"
            : "reminder_7d");

    setActiveAlert(row);
    setTemplateType(suggested);
    setSendNonce(crypto.randomUUID());
    loadPreview(row.businessId, suggested);
  }

  async function handleConfirmSend() {
    if (!activeAlert || sending) return;
    if (previewData?.alreadySentForCurrentExpiry && !confirmResend) {
      toast({
        title: "Confirmation Required",
        description: "Please confirm intentional resend for this expiry cycle.",
        variant: "error",
      });
      return;
    }

    setSending(true);
    try {
      const res = await authFetch("/api/super-admin/subscription-alerts", {
        method: "POST",
        body: JSON.stringify({
          action: "send",
          businessId: activeAlert.businessId,
          templateType,
          idempotencyNonce: sendNonce,
          confirmResend,
        }),
      });
      const data = await res.json().catch(() => ({}));
      setSendResult(data);

      if (res.ok && data.ok) {
        toast({
          title: "Reminder Email Sent",
          description: `Sent to ${data.recipientEmail} (Message ID: ${data.messageId})`,
          variant: "success",
        });
        loadAlerts();
      } else {
        toast({
          title: "Send Failed",
          description: data.error || "Unable to send email.",
          variant: "error",
        });
      }
    } finally {
      setSending(false);
    }
  }

  const filteredAlerts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return alerts.filter((a) => {
      if (filter === "expiring_7d" && !(a.daysRemaining >= 0 && a.daysRemaining <= 7)) return false;
      if (filter === "expiring_3d" && !(a.daysRemaining >= 0 && a.daysRemaining <= 3)) return false;
      if (filter === "expiring_1d" && !(a.daysRemaining >= 0 && a.daysRemaining <= 1)) return false;
      if (filter === "expired" && a.bucket !== "expired") return false;
      if (
        filter === "reminder_sent" &&
        !a.emailHistory?.some((h: any) => h.status === "sent" || h.status === "delivered")
      ) {
        return false;
      }
      if (q) {
        const sName = String(a.storeName || "").toLowerCase();
        const email = String(a.contactEmail || "").toLowerCase();
        return sName.includes(q) || email.includes(q);
      }
      return true;
    });
  }, [alerts, filter, search]);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Expiring within 7 days", val: summary.expiringWithin7Days, icon: Clock, color: "text-amber-600" },
          { label: "Expiring within 1 day", val: summary.expiringWithin1Day, icon: AlertTriangle, color: "text-orange-600" },
          { label: "Already expired", val: summary.alreadyExpired, icon: XCircle, color: "text-red-600" },
          { label: "Reminder emails already sent", val: summary.remindersAlreadySent, icon: CheckCircle2, color: "text-emerald-600" },
        ].map((c) => {
          const Icon = c.icon;
          return (
            <Card key={c.label} className="border border-[#E2E8F0] bg-white rounded-2xl">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-semibold text-[#64748B]">{c.label}</div>
                  <div className="text-2xl font-extrabold text-[#0F172A] mt-1">{c.val}</div>
                </div>
                <Icon size={22} className={c.color} />
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Filters & Search */}
      <Card className="border border-[#E2E8F0] bg-white rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-[#E2E8F0] flex flex-wrap gap-3 items-center justify-between">
          <div className="flex flex-wrap gap-2">
            {[
              { id: "all", label: "All" },
              { id: "expiring_7d", label: "Expiring within 7 days" },
              { id: "expiring_3d", label: "Expiring within 3 days" },
              { id: "expiring_1d", label: "Expiring tomorrow" },
              { id: "expired", label: "Expired" },
              { id: "reminder_sent", label: "Reminder sent" },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id as AlertFilter)}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition-all",
                  filter === f.id
                    ? "bg-[#0F172A] text-white"
                    : "bg-slate-50 text-[#64748B] border border-[#E2E8F0] hover:text-[#0F172A]"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Input
              placeholder="Search store name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-56 text-xs"
            />
            <Button variant="outline" size="sm" onClick={loadAlerts} className="text-xs">
              <RefreshCw size={13} className={cn("mr-1.5", loading && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Alert Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-[#E2E8F0] text-[#64748B]">
              <tr>
                <th className="p-3">Store &amp; Admin</th>
                <th className="p-3">Verified Contact Email</th>
                <th className="p-3">Plan &amp; Amount</th>
                <th className="p-3">Expiry &amp; Remaining</th>
                <th className="p-3">Status</th>
                <th className="p-3">Last Reminder</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {filteredAlerts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-[#64748B]">
                    {loading ? "Calculating subscription alerts..." : "No matching expiring subscriptions."}
                  </td>
                </tr>
              ) : (
                filteredAlerts.map((row) => (
                  <tr key={row.subscriptionId} className="hover:bg-slate-50/60">
                    <td className="p-3">
                      <div className="font-bold text-[#0F172A]">{row.storeName}</div>
                      <div className="text-[11px] text-[#64748B]">{row.adminName}</div>
                    </td>
                    <td className="p-3">
                      {row.contactEmail ? (
                        <span className="font-mono text-[11px]">{row.contactEmail}</span>
                      ) : (
                        <span className="text-red-600 font-semibold">Missing verified email</span>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="font-semibold">{row.planName}</div>
                      <div className="text-[11px] text-[#64748B]">
                        {row.currencySymbol}{Number(row.amount || 0).toLocaleString("en-IN")}
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="font-mono text-[11px]">
                        {new Date(row.expiryDate).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                          timeZone: "Asia/Kolkata",
                        })}
                      </div>
                      <div
                        className={cn(
                          "text-[11px] font-bold",
                          row.daysRemaining < 0
                            ? "text-red-600"
                            : row.daysRemaining <= 1
                              ? "text-orange-600"
                              : row.daysRemaining <= 7
                                ? "text-amber-600"
                                : "text-slate-500"
                        )}
                      >
                        {row.daysRemaining < 0
                          ? `Expired ${Math.abs(row.daysRemaining)}d ago`
                          : row.daysRemaining === 0
                            ? "Expires today"
                            : `${row.daysRemaining}d remaining`}
                      </div>
                    </td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 text-[10px] font-bold uppercase">
                        {row.subscriptionStatus}
                      </span>
                    </td>
                    <td className="p-3">
                      {row.lastReminderDate ? (
                        <div>
                          <div className="font-mono text-[11px]">
                            {row.lastReminderDate.slice(0, 10)}
                          </div>
                          <div className="text-[10px] font-bold uppercase text-blue-700">
                            {row.lastEmailStatus}
                          </div>
                        </div>
                      ) : (
                        <span className="text-[#94A3B8]">None</span>
                      )}
                    </td>
                    <td className="p-3 text-right space-x-2 whitespace-nowrap">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!row.contactEmail}
                        onClick={() => openSendModal(row)}
                        className="h-8 text-[11px]"
                      >
                        <BellRing size={12} className="mr-1" />
                        Send Alert
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setHistoryAlert(row)}
                        className="h-8 text-[11px]"
                      >
                        <History size={12} className="mr-1" />
                        History ({row.emailHistory?.length || 0})
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Preview & Confirm Modal */}
      {activeAlert && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#E2E8F0] max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden text-xs">
            <div className="p-5 border-b border-[#E2E8F0] flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-[#0F172A]">
                  Send Manual Subscription Alert — {activeAlert.storeName}
                </h3>
                <p className="text-[11px] text-[#64748B]">
                  Recipient: <strong className="font-mono">{activeAlert.contactEmail}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveAlert(null)}
                className="font-bold text-[#64748B] hover:text-[#0F172A] cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              <div className="flex flex-wrap gap-2">
                {[
                  { id: "reminder_7d", label: "7-Day Reminder" },
                  { id: "reminder_3d", label: "3-Day Reminder" },
                  { id: "reminder_1d", label: "1-Day Reminder" },
                  { id: "expired_notice", label: "Expired Notification" },
                ].map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => {
                      const choice = tpl.id as TemplateChoice;
                      setTemplateType(choice);
                      setSendNonce(crypto.randomUUID());
                      loadPreview(activeAlert.businessId, choice);
                    }}
                    className={cn(
                      "px-3 py-1.5 rounded-xl font-bold border cursor-pointer",
                      templateType === tpl.id
                        ? "bg-[#2563EB] text-white border-[#2563EB]"
                        : "bg-white text-[#64748B] border-[#E2E8F0]"
                    )}
                  >
                    {tpl.label}
                  </button>
                ))}
              </div>

              {previewLoading ? (
                <div className="py-10 flex items-center justify-center gap-2 text-[#64748B]">
                  <Loader2 size={16} className="animate-spin" /> Loading live subscription preview...
                </div>
              ) : previewData?.error ? (
                <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700">
                  {previewData.error}
                </div>
              ) : previewData ? (
                <div className="space-y-3">
                  <div className="p-3 rounded-xl bg-slate-50 border border-[#E2E8F0]">
                    <div><strong>Subject:</strong> {previewData.subject}</div>
                    <div><strong>From:</strong> CounterCub Support &lt;support@countercub.com&gt;</div>
                    <div><strong>To:</strong> {previewData.recipientEmail}</div>
                  </div>

                  {previewData.alreadySentForCurrentExpiry && (
                    <label className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={confirmResend}
                        onChange={(e) => setConfirmResend(e.target.checked)}
                        className="mt-0.5"
                      />
                      <span>
                        A reminder of this type was already sent for the current expiry date. Check to confirm intentional manual resend.
                      </span>
                    </label>
                  )}

                  <div
                    className="border border-[#E2E8F0] rounded-xl p-3 bg-slate-50 max-h-64 overflow-y-auto"
                    dangerouslySetInnerHTML={{ __html: previewData.html }}
                  />
                </div>
              ) : null}

              {sendResult && (
                <div
                  className={cn(
                    "p-3 rounded-xl border",
                    sendResult.ok
                      ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                      : "bg-red-50 border-red-200 text-red-700"
                  )}
                >
                  {sendResult.ok ? (
                    <span>
                      Dispatched successfully! Resend Message ID:{" "}
                      <strong className="font-mono">{sendResult.messageId}</strong>
                    </span>
                  ) : (
                    <span>Failed: {sendResult.error}</span>
                  )}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-[#E2E8F0] flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setActiveAlert(null)}>
                Close
              </Button>
              <Button
                size="sm"
                disabled={sending || previewLoading || !previewData || Boolean(previewData.error)}
                onClick={handleConfirmSend}
                className="bg-[#2563EB] text-white"
              >
                {sending ? (
                  <>
                    <Loader2 size={13} className="mr-1.5 animate-spin" /> Sending...
                  </>
                ) : (
                  <>
                    <Send size={13} className="mr-1.5" /> Confirm &amp; Send Email
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Email History Modal */}
      {historyAlert && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#E2E8F0] max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden text-xs">
            <div className="p-5 border-b border-[#E2E8F0] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mail size={16} className="text-[#2563EB]" />
                <h3 className="text-sm font-bold text-[#0F172A]">
                  Subscription Email History — {historyAlert.storeName}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setHistoryAlert(null)}
                className="font-bold text-[#64748B] hover:text-[#0F172A] cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="p-5 overflow-y-auto space-y-2">
              {(historyAlert.emailHistory || []).length === 0 ? (
                <p className="text-center text-[#64748B] py-8">No reminder or expiry emails recorded for this store.</p>
              ) : (
                historyAlert.emailHistory.map((h: any) => (
                  <div key={h.id} className="p-3 rounded-xl border border-[#E2E8F0] space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[#0F172A]">{h.subject}</span>
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 text-[10px] font-bold uppercase">
                        {h.status}
                      </span>
                    </div>
                    <div className="text-[11px] text-[#64748B]">
                      Type: <span className="font-mono">{h.emailType}</span> &bull; To: {h.recipientEmail}
                    </div>
                    <div className="text-[11px] text-[#64748B]">
                      Sent: {(h.sentAt || h.createdAt || "").slice(0, 19).replace("T", " ")} &bull; By:{" "}
                      {h.sentByAdmin || "System"}
                    </div>
                    <div className="text-[11px] font-mono text-[#475569]">
                      Message ID: {h.providerMessageId || "—"}
                    </div>
                    {h.lastError && (
                      <div className="p-2 rounded bg-red-50 text-red-700 text-[11px]">
                        Failure: {h.lastError}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

