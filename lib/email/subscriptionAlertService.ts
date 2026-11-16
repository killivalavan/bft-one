import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveStoreAdminContact } from "@/lib/email/contactResolver";
import { sendTransactionalEmail } from "@/lib/email/emailService";
import {
  COUNTERCUB_EMAIL_FROM,
  COUNTERCUB_EMAIL_REPLY_TO,
} from "@/lib/email/resendClient";
import {
  buildExpiryReminderEmail,
  buildSubscriptionExpiredEmail,
} from "@/lib/email/templates/subscriptionEmails";
import { extractClientMetadata, logAuditEvent } from "@/lib/services/auditLogger";

export type ManualAlertTemplateType =
  | "reminder_7d"
  | "reminder_3d"
  | "reminder_1d"
  | "expired_notice";

export type AlertBucket =
  | "expired"
  | "expiring_1d"
  | "expiring_3d"
  | "expiring_7d"
  | "upcoming";

export interface AlertEmailHistoryItem {
  id: string;
  emailType: string;
  recipientEmail: string;
  subject: string;
  status: string;
  providerMessageId: string | null;
  sentAt: string | null;
  createdAt: string;
  sentByAdmin: string | null;
  lastError: string | null;
}

export interface SubscriptionAlertRecord {
  businessId: string;
  subscriptionId: string;
  storeName: string;
  slug: string;
  adminName: string;
  contactEmail: string | null;
  planName: string;
  planKey: string;
  amount: number;
  currencySymbol: string;
  expiryDate: string;
  daysRemaining: number;
  subscriptionStatus: string;
  bucket: AlertBucket;
  lastReminderDate: string | null;
  lastEmailStatus: string | null;
  lastMessageId: string | null;
  emailHistory: AlertEmailHistoryItem[];
}

const ALERT_EMAIL_TYPES = [
  "manual_reminder_7d",
  "manual_reminder_3d",
  "manual_reminder_1d",
  "manual_expired_notice",
  "expiry_reminder_7d",
  "expiry_reminder_1d",
  "expiry_reminder_0d",
  "subscription_expired",
];

function templateToEmailType(t: ManualAlertTemplateType): string {
  switch (t) {
    case "reminder_7d":
      return "manual_reminder_7d";
    case "reminder_3d":
      return "manual_reminder_3d";
    case "reminder_1d":
      return "manual_reminder_1d";
    case "expired_notice":
      return "manual_expired_notice";
  }
}

/**
 * Computes exact integer calendar days remaining in Asia/Kolkata (+05:30).
 */
export function computeAsiaKolkataDaysRemaining(
  expiryIso: string,
  nowDate: Date = new Date()
): number {
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const expIst = new Date(new Date(expiryIso).getTime() + istOffsetMs);
  const nowIst = new Date(nowDate.getTime() + istOffsetMs);

  const expDayMs = Date.UTC(
    expIst.getUTCFullYear(),
    expIst.getUTCMonth(),
    expIst.getUTCDate()
  );
  const nowDayMs = Date.UTC(
    nowIst.getUTCFullYear(),
    nowIst.getUTCMonth(),
    nowIst.getUTCDate()
  );

  return Math.round((expDayMs - nowDayMs) / (24 * 60 * 60 * 1000));
}

function fmtDateIst(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

function classifyAlertBucket(daysRemaining: number, status: string): AlertBucket {
  if (daysRemaining < 0 || status === "expired") return "expired";
  if (daysRemaining <= 1) return "expiring_1d";
  if (daysRemaining <= 3) return "expiring_3d";
  if (daysRemaining <= 7) return "expiring_7d";
  return "upcoming";
}

export async function listSubscriptionAlerts(
  supa: SupabaseClient,
  nowOverride?: Date
): Promise<{
  summary: {
    expiringWithin7Days: number;
    expiringWithin1Day: number;
    alreadyExpired: number;
    remindersAlreadySent: number;
  };
  alerts: SubscriptionAlertRecord[];
}> {
  const now = nowOverride || new Date();

  const [{ data: subs }, { data: dispatches }] = await Promise.all([
    supa
      .from("tenant_subscriptions")
      .select("*, businesses(id, name, slug, currency_symbol, is_active)")
      .eq("is_current", true)
      .neq("plan_key_snapshot", "free")
      .not("expiry_date", "is", null),
    supa
      .from("email_dispatches")
      .select("id, business_id, email_type, recipient_email, subject, status, provider_message_id, sent_at, created_at, last_error, payload")
      .in("email_type", ALERT_EMAIL_TYPES)
      .order("created_at", { ascending: false })
      .limit(1000),
  ]);

  const historyByBiz = new Map<string, AlertEmailHistoryItem[]>();
  for (const d of dispatches || []) {
    if (!d.business_id) continue;
    const item: AlertEmailHistoryItem = {
      id: d.id,
      emailType: d.email_type,
      recipientEmail: d.recipient_email,
      subject: d.subject,
      status: d.status,
      providerMessageId: d.provider_message_id || null,
      sentAt: d.sent_at || null,
      createdAt: d.created_at,
      sentByAdmin: (d.payload as any)?.sentByEmail || null,
      lastError: d.last_error || null,
    };
    const arr = historyByBiz.get(d.business_id) || [];
    arr.push(item);
    historyByBiz.set(d.business_id, arr);
  }

  const alerts: SubscriptionAlertRecord[] = [];
  for (const sub of subs || []) {
    const biz = sub.businesses;
    if (!biz) continue;
    // Exclude cancelled or non-expired inactive subscriptions
    if (sub.subscription_status === "cancelled") continue;
    if (!biz.is_active && sub.subscription_status !== "expired") continue;
    if (!sub.expiry_date) continue;

    const daysRemaining = computeAsiaKolkataDaysRemaining(sub.expiry_date, now);
    const bucket = classifyAlertBucket(daysRemaining, sub.subscription_status);
    const contact = await resolveStoreAdminContact(supa, sub.business_id);
    const history = historyByBiz.get(sub.business_id) || [];
    const latest = history[0] || null;

    alerts.push({
      businessId: sub.business_id,
      subscriptionId: sub.id,
      storeName: biz.name || biz.slug,
      slug: biz.slug,
      adminName: contact?.adminName || "Store Admin",
      contactEmail: contact?.contactEmail || null,
      planName: sub.plan_name_snapshot,
      planKey: sub.plan_key_snapshot,
      amount: Number(sub.price_snapshot ?? 0),
      currencySymbol: biz.currency_symbol || "₹",
      expiryDate: sub.expiry_date,
      daysRemaining,
      subscriptionStatus: sub.subscription_status,
      bucket,
      lastReminderDate: latest?.sentAt || latest?.createdAt || null,
      lastEmailStatus: latest?.status || null,
      lastMessageId: latest?.providerMessageId || null,
      emailHistory: history,
    });
  }

  // Sort most urgent first (lowest daysRemaining)
  alerts.sort((a, b) => a.daysRemaining - b.daysRemaining);

  const expiringWithin7Days = alerts.filter(
    (a) => a.daysRemaining >= 0 && a.daysRemaining <= 7
  ).length;
  const expiringWithin1Day = alerts.filter(
    (a) => a.daysRemaining >= 0 && a.daysRemaining <= 1
  ).length;
  const alreadyExpired = alerts.filter((a) => a.bucket === "expired").length;
  const remindersAlreadySent = alerts.filter((a) =>
    a.emailHistory.some((h) => h.status === "sent" || h.status === "delivered")
  ).length;

  return {
    summary: {
      expiringWithin7Days,
      expiringWithin1Day,
      alreadyExpired,
      remindersAlreadySent,
    },
    alerts,
  };
}

export async function buildManualAlertEmailContent(
  supa: SupabaseClient,
  businessId: string,
  templateType: ManualAlertTemplateType,
  nowOverride?: Date
) {
  const { data: sub } = await supa
    .from("tenant_subscriptions")
    .select("*")
    .eq("business_id", businessId)
    .eq("is_current", true)
    .maybeSingle();

  if (!sub || sub.plan_key_snapshot === "free" || !sub.expiry_date) {
    return { error: "Store does not have an eligible expiring subscription." as const };
  }

  const contact = await resolveStoreAdminContact(supa, businessId);
  if (!contact?.contactEmail) {
    return { error: "Verified Store Admin Contact Email not found for this store." as const };
  }

  const planAmount = `${contact.currencySymbol}${Number(sub.price_snapshot ?? 0).toLocaleString("en-IN")}`;
  const expiryLabel = fmtDateIst(sub.expiry_date);
  const renewalUrl = `https://${contact.slug}.countercub.com/admin/subscription`;
  const loginUrl = `https://${contact.slug}.countercub.com/login`;

  const emailContent =
    templateType === "expired_notice"
      ? buildSubscriptionExpiredEmail({
          storeName: contact.storeName,
          expiredPlan: sub.plan_name_snapshot,
          planAmount,
          expiryDate: expiryLabel,
          accountStatus: sub.subscription_status === "expired" ? "Expired" : "Pending Renewal",
          gracePeriodInfo: "Submit a renewal request from your Store Subscription page.",
          renewalUrl,
          loginUrl,
          supportEmail: COUNTERCUB_EMAIL_REPLY_TO,
        })
      : buildExpiryReminderEmail({
          storeName: contact.storeName,
          planName: sub.plan_name_snapshot,
          planAmount,
          expiryDate: expiryLabel,
          daysBefore: templateType === "reminder_7d" ? 7 : templateType === "reminder_3d" ? 3 : 1,
          renewalUrl,
          loginUrl,
          supportEmail: COUNTERCUB_EMAIL_REPLY_TO,
        });

  const normalizedExpiryIso = new Date(sub.expiry_date).toISOString();
  const cycleKey = `sub:${sub.id}:${normalizedExpiryIso}`;
  const emailType = templateToEmailType(templateType);
  const { data: priorSent } = await supa
    .from("email_dispatches")
    .select("id, sent_at, provider_message_id")
    .eq("business_id", businessId)
    .eq("email_type", emailType)
    .eq("expiry_cycle_key", cycleKey)
    .in("status", ["sent", "delivered"])
    .limit(1);

  return {
    sub,
    contact,
    emailType,
    emailContent,
    daysRemaining: computeAsiaKolkataDaysRemaining(sub.expiry_date, nowOverride),
    alreadySentForCurrentExpiry: Boolean(priorSent && priorSent.length > 0),
  };
}

export async function sendManualSubscriptionAlert(
  supa: SupabaseClient,
  params: {
    businessId: string;
    templateType: ManualAlertTemplateType;
    idempotencyNonce: string;
    confirmResend?: boolean;
    actor: { id: string; email: string };
    request?: Request;
  }
) {
  const built = await buildManualAlertEmailContent(supa, params.businessId, params.templateType);
  if ("error" in built) {
    return { ok: false as const, status: 400, error: built.error };
  }

  const { sub, contact, emailType, emailContent, daysRemaining, alreadySentForCurrentExpiry } = built;
  const recipientEmail = contact.contactEmail!;

  if (alreadySentForCurrentExpiry && !params.confirmResend) {
    return {
      ok: false as const,
      status: 409,
      requiresResendConfirmation: true,
      error: "A reminder of this type was already sent for the current expiry date. Confirm intentional resend to proceed.",
    };
  }

  const cycleKey = `sub:${sub.id}:${new Date(sub.expiry_date).toISOString()}`;
  const nonce = (params.idempotencyNonce || "").trim() || `${sub.id}:${sub.expiry_date}`;
  const idempotencyKey = `manual_alert:${params.businessId}:${emailType}:${cycleKey}:${nonce}`;

  const { data: inserted, error: insErr } = await supa
    .from("email_dispatches")
    .insert({
      idempotency_key: idempotencyKey,
      email_type: emailType,
      category: "subscription",
      priority: 1,
      business_id: params.businessId,
      user_id: contact.adminUserId,
      recipient_email: recipientEmail,
      from_email: COUNTERCUB_EMAIL_FROM,
      reply_to_email: COUNTERCUB_EMAIL_REPLY_TO,
      subject: emailContent.subject,
      expiry_cycle_key: cycleKey,
      payload: {
        subscriptionId: sub.id,
        expiryDate: sub.expiry_date,
        daysRemaining,
        sentById: params.actor.id,
        sentByEmail: params.actor.email,
        manualResend: Boolean(params.confirmResend),
      },
      status: "sending",
      provider: "resend",
    })
    .select("id")
    .single();

  if (insErr && insErr.code === "23505") {
    const { data: existing } = await supa
      .from("email_dispatches")
      .select("id, status, provider_message_id")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    return {
      ok: true as const,
      deduplicated: true,
      dispatchId: existing?.id || null,
      messageId: existing?.provider_message_id || null,
      recipientEmail,
    };
  }

  const res = await sendTransactionalEmail({
    to: [recipientEmail],
    from: COUNTERCUB_EMAIL_FROM,
    replyTo: COUNTERCUB_EMAIL_REPLY_TO,
    subject: emailContent.subject,
    html: emailContent.html,
    text: emailContent.text,
    tags: [
      { name: "category", value: "subscription" },
      { name: "email_type", value: emailType },
      { name: "business_id", value: params.businessId },
    ],
  });

  const nowIso = new Date().toISOString();
  const clientMeta = params.request ? extractClientMetadata(params.request) : {};

  if (inserted?.id) {
    await supa
      .from("email_dispatches")
      .update(
        res.ok
          ? {
              status: "sent",
              provider_message_id: res.messageId,
              attempt_count: 1,
              sent_at: nowIso,
              last_attempted_at: nowIso,
              updated_at: nowIso,
            }
          : {
              status: "failed",
              attempt_count: 1,
              last_error: res.error,
              last_attempted_at: nowIso,
              updated_at: nowIso,
            }
      )
      .eq("id", inserted.id);
  }

  await logAuditEvent({
    businessId: params.businessId,
    actorId: params.actor.id,
    actorEmail: params.actor.email,
    action: res.ok ? "MANUAL_SUBSCRIPTION_ALERT_SENT" : "MANUAL_SUBSCRIPTION_ALERT_FAILED",
    targetType: "email_dispatch",
    targetId: res.ok ? res.messageId : inserted?.id || params.businessId,
    details: {
      emailType,
      recipientEmail,
      subscriptionId: sub.id,
      expiryDate: sub.expiry_date,
      messageId: res.ok ? res.messageId : null,
      error: res.ok ? null : res.error,
      manualResend: Boolean(params.confirmResend),
    },
    ...clientMeta,
  });

  if (!res.ok) {
    return {
      ok: false as const,
      status: res.statusCode,
      dispatchId: inserted?.id || null,
      error: res.error,
    };
  }

  return {
    ok: true as const,
    dispatchId: inserted?.id || null,
    messageId: res.messageId,
    recipientEmail,
  };
}

