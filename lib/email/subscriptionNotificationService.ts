import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveStoreAdminContact } from "@/lib/email/contactResolver";
import {
  checkUsageAndPriorityGate,
  computeNextRetryAt,
  isPermanentEmailFailure,
  MAX_EMAIL_RETRY_ATTEMPTS,
  sendTransactionalEmail,
  type SendTransactionalEmailParams,
  type SendTransactionalEmailResult,
} from "@/lib/email/emailService";
import {
  COUNTERCUB_EMAIL_FROM,
  COUNTERCUB_EMAIL_REPLY_TO,
} from "@/lib/email/resendClient";
import {
  buildExpiryReminderEmail,
  buildPaymentFailedEmail,
  buildPaymentSucceededEmail,
  buildPlanActivatedEmail,
  buildPlanDowngradedEmail,
  buildPlanUpgradedEmail,
  buildSubscriptionExpiredEmail,
  buildSubscriptionRenewedEmail,
} from "@/lib/email/templates/subscriptionEmails";

const PLAN_TIER_RANK: Record<string, number> = {
  free: 0,
  basic: 1,
  pro: 2,
  enterprise: 3,
};

function fmtDate(iso?: string | null): string {
  if (!iso) return "N/A";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

function fmtBillingCycle(months: number | null | undefined, price: number): string {
  if (!months) return price === 0 ? "Free / Non-Expiring" : "Ongoing";
  if (months === 1) return "Monthly (1 month)";
  if (months === 3) return "Quarterly (3 months)";
  if (months === 6) return "Half-Yearly (6 months)";
  if (months === 12) return "Yearly (12 months)";
  return `${months} months`;
}

function fmtCurrency(symbol: string, amount: number): string {
  return `${symbol}${Number(amount || 0).toLocaleString("en-IN")}`;
}

export function classifyPlanChange(
  previousPlanKey: string | null | undefined,
  previousPrice: number | null | undefined,
  newPlanKey: string,
  newPrice: number
): "activated" | "upgraded" | "downgraded" | "changed" {
  if (!previousPlanKey) return "activated";
  const prevRank = PLAN_TIER_RANK[previousPlanKey.toLowerCase()] ?? -1;
  const nextRank = PLAN_TIER_RANK[newPlanKey.toLowerCase()] ?? -1;
  if (prevRank !== -1 && nextRank !== -1 && prevRank !== nextRank) {
    return nextRank > prevRank ? "upgraded" : "downgraded";
  }
  const prevP = Number(previousPrice ?? 0);
  if (newPrice > prevP) return "upgraded";
  if (newPrice < prevP) return "downgraded";
  return "changed";
}

async function getEmailSettings(supa: SupabaseClient) {
  const { data } = await supa.from("email_settings").select("*").eq("id", 1).maybeSingle();
  return {
    from: data?.sender_email
      ? `${data.sender_name || "CounterCub Support"} <${data.sender_email}>`
      : COUNTERCUB_EMAIL_FROM,
    replyTo: data?.reply_to_email || COUNTERCUB_EMAIL_REPLY_TO,
    reminder7d: data?.reminder_7d_enabled !== false,
    reminder1d: data?.reminder_1d_enabled !== false,
    reminder0d: data?.reminder_0d_enabled !== false,
    sendHourLocal: Number(data?.send_hour_local ?? 9),
    timezone: String(data?.timezone || "Asia/Kolkata"),
  };
}

/**
 * Computes the UTC timestamp corresponding to `sendHourLocal`:00 in `Asia/Kolkata` (+05:30)
 * on the calendar day `daysBefore` prior to `expiryIso`.
 */
export function computeReminderScheduledFor(
  expiryIso: string,
  daysBefore: 7 | 1 | 0,
  sendHourLocal = 9
): string {
  const exp = new Date(expiryIso);
  // Shift to IST (+05:30) to get exact IST calendar date
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const istDate = new Date(exp.getTime() + istOffsetMs);
  istDate.setUTCDate(istDate.getUTCDate() - daysBefore);
  istDate.setUTCHours(sendHourLocal, 0, 0, 0);
  // Convert back to UTC
  return new Date(istDate.getTime() - istOffsetMs).toISOString();
}

async function idempotentSendNow(
  supa: SupabaseClient,
  params: {
    idempotencyKey: string;
    emailType: string;
    category: "subscription" | "payment";
    priority: 0 | 1 | 2 | 3;
    businessId: string;
    userId: string | null;
    recipientEmail: string;
    from: string;
    replyTo: string;
    subject: string;
    html: string;
    text: string;
    payload: Record<string, unknown>;
  }
) {
  const { data: inserted, error: insErr } = await supa
    .from("email_dispatches")
    .insert({
      idempotency_key: params.idempotencyKey,
      email_type: params.emailType,
      category: params.category,
      priority: params.priority,
      business_id: params.businessId,
      user_id: params.userId,
      recipient_email: params.recipientEmail,
      from_email: params.from,
      reply_to_email: params.replyTo,
      subject: params.subject,
      payload: params.payload,
      status: "sending",
      provider: "resend",
    })
    .select("id")
    .single();

  if (insErr) {
    if (insErr.code === "23505") {
      return { skippedDuplicate: true };
    }
    console.warn("[SubscriptionEmail] Outbox insert warning:", insErr.message);
  }

  const dispatchId = inserted?.id || null;
  const res = await sendTransactionalEmail({
    to: [params.recipientEmail],
    from: params.from,
    replyTo: params.replyTo,
    subject: params.subject,
    html: params.html,
    text: params.text,
    tags: [
      { name: "category", value: params.category },
      { name: "email_type", value: params.emailType },
      { name: "business_id", value: params.businessId },
    ],
  });

  const nowIso = new Date().toISOString();
  if (dispatchId) {
    if (res.ok) {
      await supa
        .from("email_dispatches")
        .update({
          status: "sent",
          provider_message_id: res.messageId,
          attempt_count: 1,
          sent_at: nowIso,
          last_attempted_at: nowIso,
          updated_at: nowIso,
        })
        .eq("id", dispatchId);
    } else {
      await supa
        .from("email_dispatches")
        .update({
          status: "failed",
          attempt_count: 1,
          last_error: res.error,
          last_attempted_at: nowIso,
          updated_at: nowIso,
        })
        .eq("id", dispatchId);
    }
  }

  return res;
}

/**
 * Cancels obsolete queued expiry reminders for a business and schedules fresh
 * 7-day, 1-day, and 0-day reminders for active, non-free expiring subscriptions.
 */
export const SCHEDULED_EMAIL_PROCESSING_ENABLED = false;

export async function syncExpiryRemindersForSubscription(
  supa: SupabaseClient,
  subscription: {
    id: string;
    business_id: string;
    plan_key_snapshot: string;
    plan_name_snapshot: string;
    subscription_status: string;
    expiry_date: string | null;
  },
  nowOverride?: Date,
  options?: { forceForTest?: boolean }
): Promise<{ cancelled: number; scheduled: number }> {
  const nowDate = nowOverride || new Date();
  const nowIso = nowDate.toISOString();
  const cycleKey = subscription.expiry_date
    ? `sub:${subscription.id}:${subscription.expiry_date}`
    : null;

  // 1. Cancel all queued reminders that do NOT match the current expiry_cycle_key
  let cancelQuery = supa
    .from("email_dispatches")
    .update({
      status: "cancelled",
      cancelled_at: nowIso,
      cancel_reason: "Subscription renewed, extended, changed, or switched to free plan",
      updated_at: nowIso,
    })
    .eq("business_id", subscription.business_id)
    .in("email_type", ["expiry_reminder_7d", "expiry_reminder_1d", "expiry_reminder_0d"])
    .eq("status", "queued");

  if (cycleKey) {
    cancelQuery = cancelQuery.neq("expiry_cycle_key", cycleKey);
  }

  const { data: cancelledRows } = await cancelQuery.select("id");
  const cancelledCount = cancelledRows?.length || 0;

  // Scheduled expiry reminders are deferred for the current release
  if (!SCHEDULED_EMAIL_PROCESSING_ENABLED && !options?.forceForTest) {
    return { cancelled: cancelledCount, scheduled: 0 };
  }

  // 2. Free / non-expiring or non-active plans get zero scheduled reminders
  if (
    subscription.plan_key_snapshot === "free" ||
    !subscription.expiry_date ||
    subscription.subscription_status !== "active"
  ) {
    return { cancelled: cancelledCount, scheduled: 0 };
  }

  const expTime = new Date(subscription.expiry_date).getTime();
  if (Number.isNaN(expTime) || expTime <= nowDate.getTime()) {
    return { cancelled: cancelledCount, scheduled: 0 };
  }

  const contact = await resolveStoreAdminContact(supa, subscription.business_id);
  if (!contact?.contactEmail) {
    return { cancelled: cancelledCount, scheduled: 0 };
  }

  const settings = await getEmailSettings(supa);
  const reminders: Array<{ days: 7 | 1 | 0; enabled: boolean; type: string }> = [
    { days: 7, enabled: settings.reminder7d, type: "expiry_reminder_7d" },
    { days: 1, enabled: settings.reminder1d, type: "expiry_reminder_1d" },
    { days: 0, enabled: settings.reminder0d, type: "expiry_reminder_0d" },
  ];

  let scheduledCount = 0;
  for (const r of reminders) {
    if (!r.enabled) continue;
    const scheduledFor = computeReminderScheduledFor(
      subscription.expiry_date,
      r.days,
      settings.sendHourLocal
    );
    // Only schedule reminders whose target send time is still in the future (or today)
    if (new Date(scheduledFor).getTime() < nowDate.getTime() - 12 * 60 * 60 * 1000) {
      continue;
    }

    const emailContent = buildExpiryReminderEmail({
      storeName: contact.storeName,
      planName: subscription.plan_name_snapshot,
      expiryDate: fmtDate(subscription.expiry_date),
      daysBefore: r.days,
      renewalUrl: `https://${contact.slug}.countercub.com/admin/subscription`,
    });

    const idempotencyKey = `${r.type}:${subscription.business_id}:${cycleKey}`;
    const { error: insErr } = await supa.from("email_dispatches").insert({
      idempotency_key: idempotencyKey,
      email_type: r.type,
      category: "subscription",
      priority: 1,
      business_id: subscription.business_id,
      user_id: contact.adminUserId,
      recipient_email: contact.contactEmail,
      from_email: settings.from,
      reply_to_email: settings.replyTo,
      subject: emailContent.subject,
      scheduled_for: scheduledFor,
      expiry_cycle_key: cycleKey,
      payload: {
        subscriptionId: subscription.id,
        storeName: contact.storeName,
        slug: contact.slug,
        planName: subscription.plan_name_snapshot,
        expiryDate: subscription.expiry_date,
        daysBefore: r.days,
      },
      status: "queued",
      provider: "resend",
    });

    if (!insErr) scheduledCount++;
  }

  return { cancelled: cancelledCount, scheduled: scheduledCount };
}

export async function notifyPlanLifecycleEvent(
  supa: SupabaseClient,
  params: {
    event: "activated" | "upgraded" | "downgraded" | "renewed";
    subscription: any;
    previousSubscription?: any | null;
    transactionRef?: string | null;
    eventId?: string;
  }
) {
  try {
    const contact = await resolveStoreAdminContact(supa, params.subscription.business_id);
    if (!contact?.contactEmail) return;

    const settings = await getEmailSettings(supa);
    const sub = params.subscription;
    const prev = params.previousSubscription;
    const loginUrl = `https://${contact.slug}.countercub.com/login`;
    const eventKey = params.eventId || sub.id;

    if (params.event === "activated") {
      const content = buildPlanActivatedEmail({
        storeName: contact.storeName,
        adminName: contact.adminName,
        planName: sub.plan_name_snapshot,
        planPrice: fmtCurrency(contact.currencySymbol, Number(sub.price_snapshot || 0)),
        billingCycle: fmtBillingCycle(sub.billing_duration_months, Number(sub.price_snapshot || 0)),
        productLimit:
          sub.product_limit_snapshot === null ? "Unlimited" : String(sub.product_limit_snapshot),
        employeeLimit: String(sub.employee_limit_snapshot ?? 0),
        activationDate: fmtDate(sub.start_date),
        expiryDate: sub.expiry_date ? fmtDate(sub.expiry_date) : null,
        loginUrl,
        supportEmail: settings.replyTo,
      });

      await idempotentSendNow(supa, {
        idempotencyKey: `plan_activated:${sub.business_id}:${eventKey}`,
        emailType: "plan_activated",
        category: "subscription",
        priority: 1,
        businessId: sub.business_id,
        userId: contact.adminUserId,
        recipientEmail: contact.contactEmail,
        from: settings.from,
        replyTo: settings.replyTo,
        ...content,
        payload: { subscriptionId: sub.id, planKey: sub.plan_key_snapshot },
      });
    } else if (params.event === "upgraded") {
      const diff = Number(sub.price_snapshot || 0) - Number(prev?.price_snapshot || 0);
      const content = buildPlanUpgradedEmail({
        storeName: contact.storeName,
        previousPlan: prev?.plan_name_snapshot || "Previous Plan",
        newPlan: sub.plan_name_snapshot,
        priceDifference:
          diff > 0 ? `+${fmtCurrency(contact.currencySymbol, diff)} / cycle` : null,
        productLimit:
          sub.product_limit_snapshot === null ? "Unlimited" : String(sub.product_limit_snapshot),
        employeeLimit: String(sub.employee_limit_snapshot ?? 0),
        effectiveDate: fmtDate(sub.start_date),
        expiryDate: sub.expiry_date ? fmtDate(sub.expiry_date) : null,
        loginUrl,
      });

      await idempotentSendNow(supa, {
        idempotencyKey: `plan_upgraded:${sub.business_id}:${eventKey}`,
        emailType: "plan_upgraded",
        category: "subscription",
        priority: 1,
        businessId: sub.business_id,
        userId: contact.adminUserId,
        recipientEmail: contact.contactEmail,
        from: settings.from,
        replyTo: settings.replyTo,
        ...content,
        payload: { subscriptionId: sub.id, previousPlan: prev?.plan_key_snapshot, newPlan: sub.plan_key_snapshot },
      });
    } else if (params.event === "downgraded") {
      const content = buildPlanDowngradedEmail({
        storeName: contact.storeName,
        previousPlan: prev?.plan_name_snapshot || "Previous Plan",
        newPlan: sub.plan_name_snapshot,
        productLimit:
          sub.product_limit_snapshot === null ? "Unlimited" : String(sub.product_limit_snapshot),
        employeeLimit: String(sub.employee_limit_snapshot ?? 0),
        effectiveDate: fmtDate(sub.start_date),
        limitationsNote: `Your workspace is now limited to ${
          sub.product_limit_snapshot === null ? "unlimited" : sub.product_limit_snapshot
        } active products and ${sub.employee_limit_snapshot ?? 0} employee seats.`,
        loginUrl,
      });

      await idempotentSendNow(supa, {
        idempotencyKey: `plan_downgraded:${sub.business_id}:${eventKey}`,
        emailType: "plan_downgraded",
        category: "subscription",
        priority: 1,
        businessId: sub.business_id,
        userId: contact.adminUserId,
        recipientEmail: contact.contactEmail,
        from: settings.from,
        replyTo: settings.replyTo,
        ...content,
        payload: { subscriptionId: sub.id, previousPlan: prev?.plan_key_snapshot, newPlan: sub.plan_key_snapshot },
      });
    } else if (params.event === "renewed") {
      const content = buildSubscriptionRenewedEmail({
        storeName: contact.storeName,
        planName: sub.plan_name_snapshot,
        renewalAmount: fmtCurrency(contact.currencySymbol, Number(sub.price_snapshot || 0)),
        renewalDate: fmtDate(new Date().toISOString()),
        newExpiryDate: fmtDate(sub.expiry_date),
        transactionRef: params.transactionRef || null,
        loginUrl,
      });

      await idempotentSendNow(supa, {
        idempotencyKey: `subscription_renewed:${sub.business_id}:${eventKey}:${sub.expiry_date || ""}`,
        emailType: "subscription_renewed",
        category: "subscription",
        priority: 1,
        businessId: sub.business_id,
        userId: contact.adminUserId,
        recipientEmail: contact.contactEmail,
        from: settings.from,
        replyTo: settings.replyTo,
        ...content,
        payload: { subscriptionId: sub.id, expiryDate: sub.expiry_date },
      });
    }

    await syncExpiryRemindersForSubscription(supa, sub);
  } catch (err: unknown) {
    console.error(
      "[SubscriptionEmail] Non-fatal error:",
      err instanceof Error ? err.message : "Unknown error"
    );
  }
}

export async function notifyPaymentEvent(
  supa: SupabaseClient,
  params: {
    status: "succeeded" | "failed";
    businessId: string;
    planName: string;
    amount: number;
    transactionRef: string;
    subscriptionStatus: string;
    failureSummary?: string;
    failureCycleKey?: string;
  }
) {
  const contact = await resolveStoreAdminContact(supa, params.businessId);
  if (!contact?.contactEmail) {
    return { ok: false, error: "Verified Store Admin Contact Email not found." };
  }
  const settings = await getEmailSettings(supa);
  const formattedAmount = fmtCurrency(contact.currencySymbol, params.amount);

  if (params.status === "succeeded") {
    const content = buildPaymentSucceededEmail({
      storeName: contact.storeName,
      paymentAmount: formattedAmount,
      paymentDate: fmtDate(new Date().toISOString()),
      transactionRef: params.transactionRef,
      planName: params.planName,
      subscriptionStatus: params.subscriptionStatus,
      loginUrl: `https://${contact.slug}.countercub.com/admin/subscription`,
    });

    return idempotentSendNow(supa, {
      idempotencyKey: `payment_succeeded:${params.businessId}:${params.transactionRef}`,
      emailType: "payment_succeeded",
      category: "payment",
      priority: 1,
      businessId: params.businessId,
      userId: contact.adminUserId,
      recipientEmail: contact.contactEmail,
      from: settings.from,
      replyTo: settings.replyTo,
      ...content,
      payload: { transactionRef: params.transactionRef, amount: params.amount },
    });
  }

  // Payment failed: deduplicate by cycle/day key so automatic retries don't spam
  const cycle = params.failureCycleKey || new Date().toISOString().slice(0, 10);
  const content = buildPaymentFailedEmail({
    storeName: contact.storeName,
    planName: params.planName,
    amount: formattedAmount,
    failureSummary: params.failureSummary || "Payment authorization failed.",
    retryPaymentUrl: `https://${contact.slug}.countercub.com/admin/subscription`,
    supportEmail: settings.replyTo,
  });

  return idempotentSendNow(supa, {
    idempotencyKey: `payment_failed:${params.businessId}:${cycle}`,
    emailType: "payment_failed",
    category: "payment",
    priority: 1,
    businessId: params.businessId,
    userId: contact.adminUserId,
    recipientEmail: contact.contactEmail,
    from: settings.from,
    replyTo: settings.replyTo,
    ...content,
    payload: { transactionRef: params.transactionRef, cycle },
  });
}

/**
 * Centralized daily scheduler job:
 * 1. Processes due queued expiry reminders (after verifying subscription is still active & matching expiry_cycle_key).
 * 2. Detects active non-free subscriptions that have just passed expiry_date and sends Subscription Expired email once per cycle
 *    without independently suspending or modifying the store.
 */
export interface DailySchedulerOptions {
  nowOverride?: Date;
  senderOverride?: (params: SendTransactionalEmailParams) => Promise<SendTransactionalEmailResult>;
  businessIdsFilter?: string[];
  forceForTest?: boolean;
}

export async function processDailyScheduledEmails(
  supa: SupabaseClient,
  options: DailySchedulerOptions = {}
) {
  if (!SCHEDULED_EMAIL_PROCESSING_ENABLED && !options.forceForTest) {
    return {
      remindersSent: 0,
      remindersCancelled: 0,
      expiredSent: 0,
      deferredByQuota: 0,
      disabled: true,
    };
  }

  const nowDate = options.nowOverride || new Date();
  const nowIso = nowDate.toISOString();
  const dispatchFn = options.senderOverride || sendTransactionalEmail;
  const settings = await getEmailSettings(supa);
  let remindersSent = 0;
  let remindersCancelled = 0;
  let expiredSent = 0;
  let deferredByQuota = 0;

  // 1. Process due queued expiry reminders & eligible transient retries
  let dueQuery = supa
    .from("email_dispatches")
    .select("*")
    .or(
      `and(status.eq.queued,scheduled_for.lte.${nowIso}),and(status.eq.failed,attempt_count.lt.${MAX_EMAIL_RETRY_ATTEMPTS},next_retry_at.lte.${nowIso})`
    )
    .in("email_type", ["expiry_reminder_7d", "expiry_reminder_1d", "expiry_reminder_0d"])
    .order("priority", { ascending: true })
    .limit(100);

  if (options.businessIdsFilter?.length) {
    dueQuery = dueQuery.in("business_id", options.businessIdsFilter);
  }

  const { data: dueReminders } = await dueQuery;

  for (const row of dueReminders || []) {
    // Atomic claim: prevents two concurrent workers from dispatching the same row
    const { data: claimed } = await supa
      .from("email_dispatches")
      .update({ status: "processing", updated_at: nowIso })
      .eq("id", row.id)
      .eq("status", row.status)
      .select("id")
      .maybeSingle();

    if (!claimed) {
      continue;
    }

    // Revalidate live subscription immediately before dispatch (race-condition guard)
    const { data: currentSub } = await supa
      .from("tenant_subscriptions")
      .select("id, plan_key_snapshot, plan_name_snapshot, subscription_status, expiry_date")
      .eq("business_id", row.business_id)
      .eq("is_current", true)
      .maybeSingle();

    const expectedCycleKey = currentSub?.expiry_date
      ? `sub:${currentSub.id}:${currentSub.expiry_date}`
      : null;

    if (
      !currentSub ||
      currentSub.plan_key_snapshot === "free" ||
      currentSub.subscription_status !== "active" ||
      expectedCycleKey !== row.expiry_cycle_key
    ) {
      await supa
        .from("email_dispatches")
        .update({
          status: "cancelled",
          cancelled_at: nowIso,
          cancel_reason: "Obsolete reminder cancelled before dispatch",
          updated_at: nowIso,
        })
        .eq("id", row.id);
      remindersCancelled++;
      continue;
    }

    const gate = await checkUsageAndPriorityGate(supa, (row.priority ?? 1) as 0 | 1 | 2 | 3);
    if (!gate.allowed) {
      await supa
        .from("email_dispatches")
        .update({
          status: "queued",
          last_error: gate.reason || "Deferred by usage protection",
          updated_at: nowIso,
        })
        .eq("id", row.id);
      deferredByQuota++;
      continue;
    }

    const daysBefore: 7 | 1 | 0 =
      row.email_type === "expiry_reminder_7d"
        ? 7
        : row.email_type === "expiry_reminder_1d"
          ? 1
          : 0;

    const contact = await resolveStoreAdminContact(supa, row.business_id);
    if (!contact?.contactEmail) {
      await supa
        .from("email_dispatches")
        .update({
          status: "failed",
          last_error: "No verified Store Admin Contact Email found.",
          next_retry_at: null,
          last_attempted_at: nowIso,
          updated_at: nowIso,
        })
        .eq("id", row.id);
      continue;
    }

    const emailContent = buildExpiryReminderEmail({
      storeName: contact.storeName,
      planName: currentSub.plan_name_snapshot,
      expiryDate: fmtDate(currentSub.expiry_date),
      daysBefore,
      renewalUrl: `https://${contact.slug}.countercub.com/admin/subscription`,
    });

    const res = await dispatchFn({
      to: [contact.contactEmail],
      from: settings.from,
      replyTo: settings.replyTo,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
      tags: [
        { name: "category", value: "subscription" },
        { name: "email_type", value: row.email_type },
        { name: "business_id", value: row.business_id },
      ],
    });

    const nextAttempt = (row.attempt_count || 0) + 1;
    if (res.ok) {
      await supa
        .from("email_dispatches")
        .update({
          status: "sent",
          provider_message_id: res.messageId,
          attempt_count: nextAttempt,
          last_error: null,
          next_retry_at: null,
          sent_at: nowIso,
          last_attempted_at: nowIso,
          updated_at: nowIso,
        })
        .eq("id", row.id);
      remindersSent++;
    } else {
      const permanent = isPermanentEmailFailure(res.statusCode, res.error) || nextAttempt >= MAX_EMAIL_RETRY_ATTEMPTS;
      await supa
        .from("email_dispatches")
        .update({
          status: "failed",
          attempt_count: nextAttempt,
          last_error: res.error,
          next_retry_at: permanent ? null : computeNextRetryAt(nextAttempt, nowDate.getTime()),
          last_attempted_at: nowIso,
          updated_at: nowIso,
        })
        .eq("id", row.id);
    }
  }

  // 2. Notify newly expired non-free subscriptions (do NOT modify store status)
  let expiredQuery = supa
    .from("tenant_subscriptions")
    .select("*")
    .eq("is_current", true)
    .neq("plan_key_snapshot", "free")
    .not("expiry_date", "is", null)
    .lte("expiry_date", nowIso)
    .in("subscription_status", ["active", "expired"])
    .limit(100);

  if (options.businessIdsFilter?.length) {
    expiredQuery = expiredQuery.in("business_id", options.businessIdsFilter);
  }

  const { data: expiredSubs } = await expiredQuery;

  for (const sub of expiredSubs || []) {
    const contact = await resolveStoreAdminContact(supa, sub.business_id);
    if (!contact?.contactEmail) continue;

    const content = buildSubscriptionExpiredEmail({
      storeName: contact.storeName,
      expiredPlan: sub.plan_name_snapshot,
      expiryDate: fmtDate(sub.expiry_date),
      accountStatus: sub.subscription_status === "expired" ? "Expired" : "Grace / Pending Renewal",
      gracePeriodInfo: "Contact CounterCub Support or renew from your Store Subscription page.",
      renewalUrl: `https://${contact.slug}.countercub.com/admin/subscription`,
    });

    const idempotencyKey = `subscription_expired:${sub.business_id}:sub:${sub.id}:${sub.expiry_date}`;
    const { data: inserted, error: insErr } = await supa
      .from("email_dispatches")
      .insert({
        idempotency_key: idempotencyKey,
        email_type: "subscription_expired",
        category: "subscription",
        priority: 1,
        business_id: sub.business_id,
        user_id: contact.adminUserId,
        recipient_email: contact.contactEmail,
        from_email: settings.from,
        reply_to_email: settings.replyTo,
        subject: content.subject,
        payload: { subscriptionId: sub.id, expiryDate: sub.expiry_date },
        status: "sending",
        provider: "resend",
      })
      .select("id")
      .single();

    if (insErr && insErr.code === "23505") continue;

    const res = await dispatchFn({
      to: [contact.contactEmail],
      from: settings.from,
      replyTo: settings.replyTo,
      subject: content.subject,
      html: content.html,
      text: content.text,
      tags: [
        { name: "category", value: "subscription" },
        { name: "email_type", value: "subscription_expired" },
        { name: "business_id", value: sub.business_id },
      ],
    });

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
                next_retry_at: isPermanentEmailFailure(res.statusCode, res.error)
                  ? null
                  : computeNextRetryAt(1, nowDate.getTime()),
                last_attempted_at: nowIso,
                updated_at: nowIso,
              }
        )
        .eq("id", inserted.id);
    }

    if (res.ok) expiredSent++;
  }

  return { remindersSent, remindersCancelled, expiredSent, deferredByQuota };
}

