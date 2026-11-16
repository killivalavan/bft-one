"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import {
  Activity,
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  FileCode2,
  History,
  Loader2,
  Mail,
  Megaphone,
  Monitor,
  RefreshCw,
  Send,
  Settings,
  Smartphone,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";

type EmailSubTab =
  | "overview"
  | "logs"
  | "templates"
  | "scheduled"
  | "campaigns"
  | "settings"
  | "audit";

export function EmailCentrePanel() {
  const { toast } = useToast();
  const [subTab, setSubTab] = useState<EmailSubTab>("overview");
  const [loading, setLoading] = useState(false);

  // Overview state
  const [overview, setOverview] = useState<any>(null);

  // Logs & Scheduled state
  const [logs, setLogs] = useState<any[]>([]);
  const [logSearch, setLogSearch] = useState("");
  const [logCategory, setLogCategory] = useState("all");
  const [logStatus, setLogStatus] = useState("all");
  const [selectedLog, setSelectedLog] = useState<any>(null);

  // Templates state
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTpl, setSelectedTpl] = useState<any>(null);
  const [tplPreviewMode, setTplPreviewMode] = useState<"desktop" | "mobile">("desktop");

  // Campaigns state
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [campForm, setCampForm] = useState({
    name: "",
    category: "offers" as "offers" | "features" | "announcements",
    subject: "",
    bodyHtml: "<p>Hello,</p><p>We have an exciting update for your store on CounterCub.</p>",
    target: "all_opted_in" as "all_opted_in" | "free" | "basic" | "pro" | "inactive",
    scheduledFor: "",
  });
  const [audiencePreview, setAudiencePreview] = useState<{ eligibleCount: number; excludedCount: number } | null>(null);

  // Settings & Audit state
  const [settings, setSettings] = useState<any>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

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

  const loadTab = useCallback(
    async (tab: EmailSubTab) => {
      setLoading(true);
      try {
        if (tab === "overview") {
          const res = await authFetch("/api/super-admin/email/overview?days=14");
          if (res.ok) setOverview(await res.json());
        } else if (tab === "logs" || tab === "scheduled") {
          const params = new URLSearchParams();
          if (tab === "scheduled") params.set("scheduledOnly", "true");
          if (logCategory !== "all") params.set("category", logCategory);
          if (logStatus !== "all") params.set("status", logStatus);
          if (logSearch.trim()) params.set("search", logSearch.trim());
          const res = await authFetch(`/api/super-admin/email/logs?${params.toString()}`);
          if (res.ok) {
            const d = await res.json();
            setLogs(d.logs || []);
          }
        } else if (tab === "templates") {
          const res = await authFetch("/api/super-admin/email/templates");
          if (res.ok) {
            const d = await res.json();
            setTemplates(d.templates || []);
            if (!selectedTpl && d.templates?.length) setSelectedTpl(d.templates[0]);
          }
        } else if (tab === "campaigns") {
          const [cRes, aRes] = await Promise.all([
            authFetch("/api/super-admin/email/campaigns"),
            authFetch(
              `/api/super-admin/email/campaigns?previewAudience=true&category=${campForm.category}&target=${campForm.target}`
            ),
          ]);
          if (cRes.ok) setCampaigns((await cRes.json()).campaigns || []);
          if (aRes.ok) setAudiencePreview(await aRes.json());
        } else if (tab === "settings") {
          const res = await authFetch("/api/super-admin/email/settings");
          if (res.ok) setSettings((await res.json()).settings);
        } else if (tab === "audit") {
          const res = await authFetch("/api/super-admin/email/audit");
          if (res.ok) setAuditLogs((await res.json()).auditLogs || []);
        }
      } finally {
        setLoading(false);
      }
    },
    [authFetch, logCategory, logStatus, logSearch, selectedTpl, campForm.category, campForm.target]
  );

  useEffect(() => {
    loadTab(subTab);
  }, [subTab, loadTab]);

  async function handleSendTestEmail() {
    if (subTab === "templates" && selectedTpl) {
      const res = await authFetch("/api/super-admin/email/templates", {
        method: "POST",
        body: JSON.stringify({
          templateKey: selectedTpl.template_key,
          subjectTemplate: selectedTpl.subject_template,
          bodyHtmlTemplate: selectedTpl.body_html_template,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        toast({
          title: `Test "${selectedTpl.name}" Sent`,
          description: `Sent to ${data.recipient} (ID: ${data.messageId})`,
          variant: "success",
        });
      } else {
        toast({ title: "Template Test Failed", description: data.error || "Failed", variant: "error" });
      }
      return;
    }

    const res = await authFetch("/api/super-admin/email/test", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) {
      toast({
        title: "Test Email Sent",
        description: `Sent to ${data.recipient} (ID: ${data.messageId})`,
        variant: "success",
      });
    } else {
      toast({ title: "Test Email Failed", description: data.error || "Failed", variant: "error" });
    }
  }

  async function handleRetryDispatch(dispatchId: string) {
    const res = await authFetch("/api/super-admin/email/retry", {
      method: "POST",
      body: JSON.stringify({ dispatchId }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      toast({ title: "Retry Dispatched", description: `Status: ${data.status}`, variant: "success" });
      loadTab(subTab);
    } else {
      toast({ title: "Retry Failed", description: data.error || "Error", variant: "error" });
    }
  }

  async function handleCancelDispatch(dispatchId: string) {
    const res = await authFetch("/api/super-admin/email/logs", {
      method: "POST",
      body: JSON.stringify({ action: "cancel", dispatchId }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      toast({ title: "Notification Cancelled", variant: "info" });
      loadTab(subTab);
    } else {
      toast({ title: "Cancel Failed", description: data.error || "Error", variant: "error" });
    }
  }

  async function handleSaveTemplate() {
    if (!selectedTpl) return;
    const res = await authFetch("/api/super-admin/email/templates", {
      method: "PATCH",
      body: JSON.stringify({
        templateKey: selectedTpl.template_key,
        subjectTemplate: selectedTpl.subject_template,
        bodyHtmlTemplate: selectedTpl.body_html_template,
        bodyTextTemplate: selectedTpl.body_text_template,
        isEnabled: selectedTpl.is_enabled,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      toast({ title: "Template Saved", variant: "success" });
      loadTab("templates");
    } else {
      toast({ title: "Save Failed", description: data.error, variant: "error" });
    }
  }

  async function handleCampaignAction(action: "create_draft" | "schedule" | "send_now" | "send_test") {
    const res = await authFetch("/api/super-admin/email/campaigns", {
      method: "POST",
      body: JSON.stringify({
        action,
        name: campForm.name,
        category: campForm.category,
        subject: campForm.subject,
        bodyHtml: campForm.bodyHtml,
        audienceFilter: { target: campForm.target },
        scheduledFor: campForm.scheduledFor || undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      toast({
        title: action === "send_test" ? "Test Campaign Sent" : "Campaign Updated",
        description:
          data.sentCount !== undefined
            ? `Sent to ${data.sentCount}/${data.eligibleCount} opted-in stores.`
            : undefined,
        variant: "success",
      });
      loadTab("campaigns");
    } else {
      toast({ title: "Campaign Action Failed", description: data.error, variant: "error" });
    }
  }

  async function handleSaveSettings() {
    if (!settings) return;
    const res = await authFetch("/api/super-admin/email/settings", {
      method: "PATCH",
      body: JSON.stringify({
        senderName: settings.sender_name,
        senderEmail: settings.sender_email,
        replyToEmail: settings.reply_to_email,
        reminder7dEnabled: settings.reminder_7d_enabled,
        reminder1dEnabled: settings.reminder_1d_enabled,
        reminder0dEnabled: settings.reminder_0d_enabled,
        sendHourLocal: settings.send_hour_local,
        timezone: settings.timezone,
        appDailyLimit: settings.app_daily_limit,
        appMonthlyLimit: settings.app_monthly_limit,
        criticalReserveCount: settings.critical_reserve_count,
        supportResolutionEnabled: settings.support_resolution_enabled,
        announcementsEnabled: settings.announcements_enabled,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      toast({ title: "Email Settings Updated", variant: "success" });
      setSettings(data.settings);
    } else {
      toast({ title: "Update Failed", description: data.error, variant: "error" });
    }
  }

  const navItems: Array<{ id: EmailSubTab; label: string; icon: any }> = [
    { id: "overview", label: "Overview", icon: Activity },
    { id: "logs", label: "Email Logs", icon: Mail },
    { id: "templates", label: "Templates", icon: FileCode2 },
    { id: "scheduled", label: "Scheduled", icon: CalendarClock },
    { id: "campaigns", label: "Campaigns", icon: Megaphone },
    { id: "settings", label: "Settings", icon: Settings },
    { id: "audit", label: "Audit History", icon: History },
  ];

  const SAMPLE_TEMPLATE_VARS: Record<string, string> = {
    storeName: "Royal Chai House",
    subdomain: "royal-chai.countercub.com",
    storePrefix: "KBS",
    storeId: "KBS74713",
    adminLoginId: "KBS74713",
    contactEmail: "owner@royalchai.com",
    adminName: "Aarav",
    planName: "Pro Plan",
    planPrice: "₹999",
    planAmount: "₹999",
    previousPlan: "Basic Plan",
    newPlan: "Pro Plan",
    priceDifference: "+₹500 / cycle",
    billingCycle: "Monthly (1 month)",
    productLimit: "250",
    employeeLimit: "25",
    activationDate: "16 Nov 2026",
    effectiveDate: "16 Nov 2026",
    expiryDate: "16 Dec 2026",
    daysRemainingLabel: "in 7 days",
    loginUrl: "https://royal-chai.countercub.com/login",
    renewalUrl: "https://royal-chai.countercub.com/admin/subscription",
    retryUrl: "https://royal-chai.countercub.com/admin/subscription",
    supportEmail: "support@countercub.com",
    ticketNumber: "SP-49281",
    issueTitle: "POS Printer Sync",
    resolutionSummary: "Updated thermal printer configuration and verified receipt printing.",
    resolvedDate: "16 Nov 2026",
    paymentAmount: "₹999",
    paymentDate: "16 Nov 2026",
    transactionRef: "TXN_904821",
    subscriptionStatus: "Active",
    renewalAmount: "₹999",
    accountStatus: "Expired",
    gracePeriodInfo: "Submit a renewal request from your Store Subscription page.",
    limitationsNote: "Limited to 50 active products and 3 employee seats.",
    failureReason: "Card authorization declined",
  };

  function interpolateTemplateText(tpl: string): string {
    return (tpl || "").replace(/\{\{(\w+)\}\}/g, (_, key) => SAMPLE_TEMPLATE_VARS[key] ?? `{{${key}}}`);
  }

  function buildRealisticEmailPreviewHtml(tpl: any): string {
    const bodyHtml = interpolateTemplateText(tpl?.body_html_template || "");
    const vars: string[] = Array.isArray(tpl?.allowed_variables) ? tpl.allowed_variables : [];
    const detailRows = vars
      .slice(0, 6)
      .map(
        (v) =>
          `<tr><td style="padding:5px 0;color:#64748b;width:155px;text-transform:capitalize;">${v.replace(/([A-Z])/g, " $1")}</td><td style="padding:5px 0;color:#0f172a;font-weight:600;">${SAMPLE_TEMPLATE_VARS[v] || "Sample Value"}</td></tr>`
      )
      .join("");

    return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:16px;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="background:#0f172a;padding:18px 24px;">
                <span style="font-size:17px;font-weight:700;color:#ffffff;">CounterCub</span>
                <span style="display:inline-block;margin-left:8px;padding:2px 8px;border-radius:9999px;background:#1e293b;color:#cbd5e1;font-size:10px;font-weight:600;text-transform:uppercase;">${tpl?.category || "Email"}</span>
              </td>
            </tr>
            <tr>
              <td style="padding:24px;font-size:13px;line-height:1.65;color:#1e293b;">
                ${bodyHtml}
                ${
                  detailRows
                    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:16px 0;padding:12px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;font-size:12px;">${detailRows}</table>`
                    : ""
                }
                <div style="margin:18px 0;">
                  <span style="display:inline-block;padding:10px 18px;background:#2563eb;color:#ffffff;font-size:12px;font-weight:600;border-radius:8px;">Open CounterCub Workspace</span>
                </div>
                <p style="margin:16px 0 0;font-size:12px;color:#475569;">Regards,<br/>CounterCub Support Team</p>
              </td>
            </tr>
            <tr>
              <td style="padding:14px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:11px;color:#64748b;">
                CounterCub Platform &bull; support@countercub.com
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
  }

  const m = overview?.localMetrics || {};
  const lim = overview?.limits || {};

  return (
    <div className="space-y-6">
      {/* Header & Sub-navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSubTab(item.id)}
                className={cn(
                  "px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer",
                  subTab === item.id
                    ? "bg-[#0F172A] text-white shadow-xs"
                    : "bg-white text-[#64748B] border border-[#E2E8F0] hover:text-[#0F172A]"
                )}
              >
                <Icon size={14} />
                {item.label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => loadTab(subTab)} className="text-xs">
            <RefreshCw size={13} className={cn("mr-1.5", loading && "animate-spin")} />
            Refresh
          </Button>
          <Button size="sm" onClick={handleSendTestEmail} className="text-xs bg-[#2563EB] text-white">
            <Send size={13} className="mr-1.5" />
            {subTab === "templates" && selectedTpl ? "Send Template Test" : "Send Test Email"}
          </Button>
        </div>
      </div>

      {/* OVERVIEW */}
      {subTab === "overview" && (
        <div className="space-y-6">
          {lim.monthlyUsagePct >= (lim.warnThreshold1 ?? 70) && (
            <div
              className={cn(
                "p-4 rounded-2xl border flex items-center gap-3 text-xs font-semibold",
                lim.monthlyUsagePct >= (lim.warnThreshold3 ?? 95)
                  ? "bg-red-50 border-red-200 text-red-800"
                  : "bg-amber-50 border-amber-200 text-amber-800"
              )}
            >
              <AlertTriangle size={16} />
              <span>
                Monthly email usage is at {lim.monthlyUsagePct}% ({m.sentMonth || 0} / {lim.effectiveMonthlyLimit || 2400}).
                {lim.monthlyUsagePct >= (lim.warnThreshold3 ?? 95) &&
                  " Critical reserve active: P2/P3 non-urgent emails are deferred."}
              </span>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { label: "Sent Today (Local)", val: m.sentToday ?? 0 },
              { label: "Sent This Month (Local)", val: m.sentMonth ?? 0 },
              { label: "Delivered (Webhook)", val: m.delivered ?? 0 },
              { label: "Failed / Bounced", val: `${m.failed ?? 0} / ${m.bounced ?? 0}` },
              { label: "Queued / Scheduled", val: `${m.pendingQueue ?? 0} / ${m.scheduledCount ?? 0}` },
            ].map((card) => (
              <Card key={card.label} className="border border-[#E2E8F0] bg-white rounded-2xl">
                <CardContent className="p-4">
                  <div className="text-[11px] font-semibold text-[#64748B]">{card.label}</div>
                  <div className="text-xl font-extrabold text-[#0F172A] mt-1">{card.val}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2 border border-[#E2E8F0] bg-white rounded-2xl">
              <CardHeader className="pb-2">
                <h3 className="text-sm font-bold text-[#0F172A]">Daily Email Volume (Last 14 Days — Local Records)</h3>
              </CardHeader>
              <CardContent>
                <div className="flex items-end gap-1.5 h-36 pt-4">
                  {(overview?.dailySeries || []).map((d: any) => {
                    const total = d.transactional + d.marketing + d.failed;
                    const max = Math.max(
                      1,
                      ...(overview?.dailySeries || []).map((x: any) => x.transactional + x.marketing + x.failed)
                    );
                    const pct = Math.max(4, Math.round((total / max) * 100));
                    return (
                      <div key={d.date} className="flex-1 flex flex-col items-center gap-1" title={`${d.date}: ${total} emails`}>
                        <div className="w-full bg-slate-100 rounded-t-md h-28 flex items-end overflow-hidden">
                          <div className="w-full bg-[#2563EB] rounded-t-md" style={{ height: `${pct}%` }} />
                        </div>
                        <span className="text-[9px] text-[#64748B] font-mono">{d.date.slice(5)}</span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card className="border border-[#E2E8F0] bg-white rounded-2xl">
              <CardHeader className="pb-2">
                <h3 className="text-sm font-bold text-[#0F172A]">Provider &amp; Quota Protection</h3>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[#64748B]">Resend API Status</span>
                  <span className="font-bold flex items-center gap-1">
                    {overview?.providerStatus?.connected ? (
                      <>
                        <CheckCircle2 size={14} className="text-emerald-600" />
                        {overview?.providerStatus?.sendingOnly
                          ? "Connected (Send-Only Key)"
                          : "Connected"}
                      </>
                    ) : (
                      <>
                        <XCircle size={14} className="text-amber-600" />
                        {overview?.providerStatus?.error || "API Key Not Configured"}
                      </>
                    )}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#64748B]">Verified Domains</span>
                  <span className="font-mono font-semibold">
                    {overview?.providerStatus?.verifiedDomains?.join(", ") || "countercub.com (Vercel)"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#64748B]">Effective Daily Cap</span>
                  <span className="font-bold">
                    {m.sentToday ?? 0} / {lim.effectiveDailyLimit ?? 80}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#64748B]">Effective Monthly Cap</span>
                  <span className="font-bold">
                    {m.sentMonth ?? 0} / {lim.effectiveMonthlyLimit ?? 2400} ({lim.monthlyUsagePct ?? 0}%)
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#64748B]">Transactional / Marketing</span>
                  <span className="font-semibold">
                    {m.transactionalMonth ?? 0} / {m.marketingMonth ?? 0}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* LOGS & SCHEDULED */}
      {(subTab === "logs" || subTab === "scheduled") && (
        <Card className="border border-[#E2E8F0] bg-white rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-[#E2E8F0] flex flex-wrap gap-3 items-center justify-between">
            <div className="flex flex-wrap gap-2 items-center">
              <Input
                placeholder="Search store, email, subject, message ID..."
                value={logSearch}
                onChange={(e) => setLogSearch(e.target.value)}
                className="h-9 w-64 text-xs"
              />
              <select
                value={logCategory}
                onChange={(e) => setLogCategory(e.target.value)}
                className="h-9 px-3 rounded-xl border border-[#E2E8F0] text-xs bg-white"
              >
                <option value="all">All Categories</option>
                <option value="account">Account</option>
                <option value="subscription">Subscription</option>
                <option value="payment">Payment</option>
                <option value="support">Support</option>
                <option value="marketing">Marketing</option>
              </select>
              <select
                value={logStatus}
                onChange={(e) => setLogStatus(e.target.value)}
                className="h-9 px-3 rounded-xl border border-[#E2E8F0] text-xs bg-white"
              >
                <option value="all">All Statuses</option>
                <option value="queued">Queued</option>
                <option value="sent">Sent</option>
                <option value="delivered">Delivered</option>
                <option value="failed">Failed</option>
                <option value="bounced">Bounced</option>
                <option value="complained">Complained</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-[#E2E8F0] text-[#64748B]">
                <tr>
                  <th className="p-3">Time</th>
                  <th className="p-3">Store</th>
                  <th className="p-3">Recipient</th>
                  <th className="p-3">Category / Type</th>
                  <th className="p-3">Subject</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Message ID</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-[#64748B]">
                      {loading ? "Loading records..." : "No email records found."}
                    </td>
                  </tr>
                ) : (
                  logs.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/60">
                      <td className="p-3 whitespace-nowrap font-mono text-[11px]">
                        {(row.scheduled_for || row.sent_at || row.created_at || "").slice(0, 16).replace("T", " ")}
                      </td>
                      <td className="p-3 font-semibold">{row.businesses?.name || "Platform"}</td>
                      <td className="p-3">{row.recipient_email}</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-[10px] font-bold uppercase mr-1">
                          {row.category}
                        </span>
                        <span className="text-[#64748B]">{row.email_type}</span>
                      </td>
                      <td className="p-3 max-w-[220px] truncate">{row.subject}</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-bold text-[10px] uppercase">
                          {row.status}
                        </span>
                      </td>
                      <td className="p-3 font-mono text-[10px] text-[#64748B]">
                        {row.provider_message_id ? row.provider_message_id.slice(0, 14) + "…" : "—"}
                      </td>
                      <td className="p-3 text-right space-x-2 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setSelectedLog(row)}
                          className="text-[#2563EB] font-semibold hover:underline cursor-pointer"
                        >
                          Details
                        </button>
                        {row.status === "failed" && (
                          <button
                            type="button"
                            onClick={() => handleRetryDispatch(row.id)}
                            className="text-emerald-600 font-semibold hover:underline cursor-pointer"
                          >
                            Retry
                          </button>
                        )}
                        {row.status === "queued" && row.priority !== 0 && (
                          <button
                            type="button"
                            onClick={() => handleCancelDispatch(row.id)}
                            className="text-red-600 font-semibold hover:underline cursor-pointer"
                          >
                            Cancel
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* TEMPLATES */}
      {subTab === "templates" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="border border-[#E2E8F0] bg-white rounded-2xl">
            <CardHeader className="pb-2">
              <h3 className="text-sm font-bold text-[#0F172A]">Email Templates</h3>
            </CardHeader>
            <CardContent className="space-y-2">
              {templates.map((t) => (
                <button
                  key={t.template_key}
                  type="button"
                  onClick={() => setSelectedTpl(t)}
                  className={cn(
                    "w-full text-left p-3 rounded-xl border text-xs transition-all cursor-pointer",
                    selectedTpl?.template_key === t.template_key
                      ? "border-[#2563EB] bg-blue-50/50"
                      : "border-[#E2E8F0] hover:bg-slate-50"
                  )}
                >
                  <div className="flex items-center justify-between font-bold text-[#0F172A]">
                    <span>{t.name}</span>
                    {t.is_mandatory && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900 text-white">P0</span>
                    )}
                  </div>
                  <div className="text-[11px] text-[#64748B] mt-0.5">{t.category}</div>
                </button>
              ))}
            </CardContent>
          </Card>

          {selectedTpl && (
            <Card className="lg:col-span-2 border border-[#E2E8F0] bg-white rounded-2xl">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div>
                  <h3 className="text-sm font-bold text-[#0F172A]">{selectedTpl.name}</h3>
                  <p className="text-[11px] text-[#64748B]">
                    Variables: {(selectedTpl.allowed_variables || []).map((v: string) => `{{${v}}}`).join(", ")}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setTplPreviewMode("desktop")}
                    className={cn("p-1.5 rounded-lg border cursor-pointer", tplPreviewMode === "desktop" ? "bg-slate-900 text-white" : "bg-white")}
                  >
                    <Monitor size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setTplPreviewMode("mobile")}
                    className={cn("p-1.5 rounded-lg border cursor-pointer", tplPreviewMode === "mobile" ? "bg-slate-900 text-white" : "bg-white")}
                  >
                    <Smartphone size={14} />
                  </button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 text-xs">
                <div>
                  <label className="font-bold text-[#0F172A]">Subject</label>
                  <Input
                    value={selectedTpl.subject_template}
                    onChange={(e) =>
                      setSelectedTpl({ ...selectedTpl, subject_template: e.target.value })
                    }
                    className="mt-1 h-9 text-xs"
                  />
                </div>
                <div>
                  <label className="font-bold text-[#0F172A]">HTML Body (Scripts &amp; unsafe handlers stripped)</label>
                  <textarea
                    rows={5}
                    value={selectedTpl.body_html_template}
                    onChange={(e) =>
                      setSelectedTpl({ ...selectedTpl, body_html_template: e.target.value })
                    }
                    className="mt-1 w-full rounded-xl border border-[#E2E8F0] p-3 font-mono text-xs"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 font-semibold">
                    <input
                      type="checkbox"
                      checked={selectedTpl.is_enabled}
                      disabled={selectedTpl.is_mandatory}
                      onChange={(e) =>
                        setSelectedTpl({ ...selectedTpl, is_enabled: e.target.checked })
                      }
                    />
                    Enabled {selectedTpl.is_mandatory && "(Mandatory P0 — cannot disable)"}
                  </label>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={handleSendTestEmail} className="text-xs">
                      <Send size={12} className="mr-1.5" />
                      Send Test
                    </Button>
                    <Button size="sm" onClick={handleSaveTemplate} className="bg-[#2563EB] text-white text-xs">
                      Save Template
                    </Button>
                  </div>
                </div>
                <div className="border border-[#E2E8F0] rounded-xl overflow-hidden bg-slate-100">
                  <div className="px-4 py-2.5 bg-white border-b border-[#E2E8F0] space-y-1 text-[11px]">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[#0F172A]">
                        Inbox Preview ({tplPreviewMode === "desktop" ? "Desktop 600px" : "Mobile 360px"})
                      </span>
                      <span className="text-[#64748B]">Sample data interpolated</span>
                    </div>
                    <div className="text-[#475569]">
                      <strong>From:</strong> CounterCub Support &lt;support@countercub.com&gt; &bull;{" "}
                      <strong>To:</strong> owner@royalchai.com
                    </div>
                    <div className="text-[#0F172A]">
                      <strong>Subject:</strong> {interpolateTemplateText(selectedTpl.subject_template)}
                    </div>
                  </div>
                  <div className="p-3 flex justify-center">
                    <iframe
                      title="Email Template Preview"
                      sandbox=""
                      srcDoc={buildRealisticEmailPreviewHtml(selectedTpl)}
                      className={cn(
                        "bg-white rounded-xl border border-[#E2E8F0] transition-all",
                        tplPreviewMode === "mobile" ? "w-[360px] h-[460px]" : "w-full h-[460px]"
                      )}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* CAMPAIGNS */}
      {subTab === "campaigns" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="border border-[#E2E8F0] bg-white rounded-2xl">
            <CardHeader className="pb-2">
              <h3 className="text-sm font-bold text-[#0F172A]">Create Marketing Campaign</h3>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <Input
                placeholder="Campaign name (e.g. Pro Upgrade Offer)"
                value={campForm.name}
                onChange={(e) => setCampForm({ ...campForm, name: e.target.value })}
                className="h-9 text-xs"
              />
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={campForm.category}
                  onChange={(e) => setCampForm({ ...campForm, category: e.target.value as any })}
                  className="h-9 px-3 rounded-xl border border-[#E2E8F0] bg-white"
                >
                  <option value="offers">Special Offers</option>
                  <option value="features">New Features</option>
                  <option value="announcements">Announcements</option>
                </select>
                <select
                  value={campForm.target}
                  onChange={(e) => setCampForm({ ...campForm, target: e.target.value as any })}
                  className="h-9 px-3 rounded-xl border border-[#E2E8F0] bg-white"
                >
                  <option value="all_opted_in">All Opted-In Stores</option>
                  <option value="free">Free Plan Stores</option>
                  <option value="basic">Basic Plan Stores</option>
                  <option value="pro">Pro Plan Stores</option>
                  <option value="inactive">Inactive Stores</option>
                </select>
              </div>
              <Input
                placeholder="Email Subject"
                value={campForm.subject}
                onChange={(e) => setCampForm({ ...campForm, subject: e.target.value })}
                className="h-9 text-xs"
              />
              <textarea
                rows={4}
                value={campForm.bodyHtml}
                onChange={(e) => setCampForm({ ...campForm, bodyHtml: e.target.value })}
                className="w-full rounded-xl border border-[#E2E8F0] p-3 font-mono text-xs"
              />
              {audiencePreview && (
                <div className="p-3 rounded-xl bg-slate-50 border border-[#E2E8F0] flex justify-between">
                  <span>Eligible Opted-In Recipients: <strong>{audiencePreview.eligibleCount}</strong></span>
                  <span>Excluded (No Consent / Suppressed): <strong>{audiencePreview.excludedCount}</strong></span>
                </div>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                <Button size="sm" variant="outline" onClick={() => handleCampaignAction("send_test")} className="text-xs">
                  Send Test
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleCampaignAction("create_draft")} className="text-xs">
                  Save Draft
                </Button>
                <Button size="sm" onClick={() => handleCampaignAction("send_now")} className="text-xs bg-[#2563EB] text-white">
                  Send Campaign
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-[#E2E8F0] bg-white rounded-2xl">
            <CardHeader className="pb-2">
              <h3 className="text-sm font-bold text-[#0F172A]">Campaign History</h3>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              {campaigns.length === 0 ? (
                <p className="text-[#64748B] py-6 text-center">No campaigns created yet.</p>
              ) : (
                campaigns.map((c) => (
                  <div key={c.id} className="p-3 rounded-xl border border-[#E2E8F0] flex items-center justify-between">
                    <div>
                      <div className="font-bold text-[#0F172A]">{c.name}</div>
                      <div className="text-[11px] text-[#64748B]">
                        {c.category} &bull; Eligible: {c.eligible_count} &bull; Excluded: {c.excluded_count}
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full bg-slate-100 font-bold text-[10px] uppercase">
                      {c.status}
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* SETTINGS */}
      {subTab === "settings" && settings && (
        <Card className="border border-[#E2E8F0] bg-white rounded-2xl">
          <CardHeader className="pb-2">
            <h3 className="text-sm font-bold text-[#0F172A]">Global Email &amp; Usage Settings</h3>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="font-bold">Sender Name</label>
              <Input
                value={settings.sender_name}
                onChange={(e) => setSettings({ ...settings, sender_name: e.target.value })}
                className="mt-1 h-9 text-xs"
              />
            </div>
            <div>
              <label className="font-bold">Sender Email</label>
              <Input
                value={settings.sender_email}
                onChange={(e) => setSettings({ ...settings, sender_email: e.target.value })}
                className="mt-1 h-9 text-xs"
              />
            </div>
            <div>
              <label className="font-bold">Reply-To Email</label>
              <Input
                value={settings.reply_to_email}
                onChange={(e) => setSettings({ ...settings, reply_to_email: e.target.value })}
                className="mt-1 h-9 text-xs"
              />
            </div>
            <div>
              <label className="font-bold">App Daily Limit (Provider: {settings.provider_daily_limit})</label>
              <Input
                type="number"
                value={settings.app_daily_limit}
                onChange={(e) => setSettings({ ...settings, app_daily_limit: Number(e.target.value) })}
                className="mt-1 h-9 text-xs"
              />
            </div>
            <div>
              <label className="font-bold">App Monthly Limit (Provider: {settings.provider_monthly_limit})</label>
              <Input
                type="number"
                value={settings.app_monthly_limit}
                onChange={(e) => setSettings({ ...settings, app_monthly_limit: Number(e.target.value) })}
                className="mt-1 h-9 text-xs"
              />
            </div>
            <div>
              <label className="font-bold">Timezone &amp; Reminder Hour</label>
              <Input
                value={`${settings.timezone} @ ${settings.send_hour_local}:00`}
                disabled
                className="mt-1 h-9 text-xs bg-slate-50"
              />
            </div>
            <div className="sm:col-span-3 flex flex-wrap gap-4 pt-2">
              <label className="flex items-center gap-2 font-semibold">
                <input
                  type="checkbox"
                  checked={settings.reminder_7d_enabled}
                  onChange={(e) => setSettings({ ...settings, reminder_7d_enabled: e.target.checked })}
                />
                7-Day Expiry Reminder
              </label>
              <label className="flex items-center gap-2 font-semibold">
                <input
                  type="checkbox"
                  checked={settings.reminder_1d_enabled}
                  onChange={(e) => setSettings({ ...settings, reminder_1d_enabled: e.target.checked })}
                />
                1-Day Expiry Reminder
              </label>
              <label className="flex items-center gap-2 font-semibold">
                <input
                  type="checkbox"
                  checked={settings.reminder_0d_enabled}
                  onChange={(e) => setSettings({ ...settings, reminder_0d_enabled: e.target.checked })}
                />
                Expiry-Day Reminder
              </label>
              <label className="flex items-center gap-2 font-semibold">
                <input
                  type="checkbox"
                  checked={settings.support_resolution_enabled}
                  onChange={(e) => setSettings({ ...settings, support_resolution_enabled: e.target.checked })}
                />
                Support Resolution Emails
              </label>
            </div>
            <div className="sm:col-span-3 pt-2">
              <Button size="sm" onClick={handleSaveSettings} className="bg-[#2563EB] text-white text-xs">
                Save Email Settings
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* AUDIT */}
      {subTab === "audit" && (
        <Card className="border border-[#E2E8F0] bg-white rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-[#E2E8F0] text-[#64748B]">
                <tr>
                  <th className="p-3">Timestamp</th>
                  <th className="p-3">Action</th>
                  <th className="p-3">Actor</th>
                  <th className="p-3">Target</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {auditLogs.map((a) => (
                  <tr key={a.id}>
                    <td className="p-3 font-mono text-[11px]">{(a.created_at || "").slice(0, 19).replace("T", " ")}</td>
                    <td className="p-3 font-bold">{a.action}</td>
                    <td className="p-3">{a.actor_email}</td>
                    <td className="p-3 font-mono text-[11px]">{a.target_type}:{a.target_id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* LOG DETAILS MODAL */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#E2E8F0] max-w-lg w-full p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-[#0F172A]">Email Dispatch Details</h4>
              <button type="button" onClick={() => setSelectedLog(null)} className="font-bold cursor-pointer">✕</button>
            </div>
            <div className="space-y-1.5">
              <div><strong>Subject:</strong> {selectedLog.subject}</div>
              <div><strong>Recipient:</strong> {selectedLog.recipient_email}</div>
              <div><strong>Status:</strong> {selectedLog.status}</div>
              <div><strong>Message ID:</strong> <span className="font-mono">{selectedLog.provider_message_id || "—"}</span></div>
              {selectedLog.last_error && (
                <div className="p-2.5 rounded-lg bg-red-50 text-red-700">
                  <strong>Failure Reason:</strong> {selectedLog.last_error}
                </div>
              )}
            </div>
            <div>
              <div className="font-bold mb-1">Webhook Delivery Events</div>
              {(selectedLog.webhookEvents || []).length === 0 ? (
                <p className="text-[#64748B]">No webhook events recorded yet.</p>
              ) : (
                <ul className="space-y-1">
                  {selectedLog.webhookEvents.map((ev: any) => (
                    <li key={ev.event_id} className="font-mono text-[11px] text-[#334155]">
                      {ev.event_type} — {(ev.occurred_at || ev.processed_at || "").slice(0, 19)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

