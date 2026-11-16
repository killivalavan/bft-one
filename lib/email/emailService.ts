import type { SupabaseClient } from "@supabase/supabase-js";
import {
  COUNTERCUB_EMAIL_FROM,
  COUNTERCUB_EMAIL_REPLY_TO,
  getResendClient,
} from "@/lib/email/resendClient";

export type EmailPriority = 0 | 1 | 2 | 3;

export const MAX_EMAIL_RETRY_ATTEMPTS = 3;

export function isPermanentEmailFailure(statusCode: number, errorMessage?: string): boolean {
  if ([400, 401, 403, 404, 422].includes(statusCode)) return true;
  const msg = (errorMessage || "").toLowerCase();
  return (
    msg.includes("invalid") ||
    msg.includes("bounce") ||
    msg.includes("complain") ||
    msg.includes("suppress") ||
    msg.includes("not verified")
  );
}

export function computeNextRetryAt(attemptCount: number, nowMs = Date.now()): string {
  // Exponential backoff: 5m, 15m, 45m
  const delayMinutes = Math.min(60, 5 * Math.pow(3, Math.max(0, attemptCount - 1)));
  return new Date(nowMs + delayMinutes * 60_000).toISOString();
}

export async function checkUsageAndPriorityGate(
  supa: SupabaseClient,
  priority: EmailPriority
): Promise<{
  allowed: boolean;
  reason?: string;
  usagePctMonth: number;
  sentToday: number;
  sentMonth: number;
  effectiveDailyLimit: number;
  effectiveMonthlyLimit: number;
}> {
  const now = new Date();
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

  const [{ data: settings }, { count: todayCount }, { count: monthCount }] = await Promise.all([
    supa.from("email_settings").select("*").eq("id", 1).maybeSingle(),
    supa
      .from("email_dispatches")
      .select("id", { count: "exact", head: true })
      .gte("sent_at", startOfToday)
      .in("status", ["sent", "delivered"]),
    supa
      .from("email_dispatches")
      .select("id", { count: "exact", head: true })
      .gte("sent_at", startOfMonth)
      .in("status", ["sent", "delivered"]),
  ]);

  const effectiveDailyLimit = Math.min(
    Number(settings?.app_daily_limit ?? 80),
    Number(settings?.provider_daily_limit ?? 100)
  );
  const effectiveMonthlyLimit = Math.min(
    Number(settings?.app_monthly_limit ?? 2400),
    Number(settings?.provider_monthly_limit ?? 3000)
  );
  const reserve = Number(settings?.critical_reserve_count ?? 10);
  const sentToday = todayCount || 0;
  const sentMonth = monthCount || 0;
  const usagePctMonth = effectiveMonthlyLimit > 0 ? (sentMonth / effectiveMonthlyLimit) * 100 : 0;

  // P0 (Security/Auth) and P1 (Critical Transactional) are only blocked at hard provider/app ceiling
  if (sentToday >= effectiveDailyLimit || sentMonth >= effectiveMonthlyLimit) {
    if (priority === 0) {
      return {
        allowed: true,
        usagePctMonth,
        sentToday,
        sentMonth,
        effectiveDailyLimit,
        effectiveMonthlyLimit,
      };
    }
    return {
      allowed: false,
      reason: "Configured daily or monthly email sending limit reached.",
      usagePctMonth,
      sentToday,
      sentMonth,
      effectiveDailyLimit,
      effectiveMonthlyLimit,
    };
  }

  // Reserve capacity for P0/P1 when remaining daily/monthly quota <= critical_reserve_count
  if (
    priority >= 2 &&
    (effectiveDailyLimit - sentToday <= reserve || effectiveMonthlyLimit - sentMonth <= reserve)
  ) {
    return {
      allowed: false,
      reason: "Remaining email capacity is reserved for P0/P1 critical transactional notifications.",
      usagePctMonth,
      sentToday,
      sentMonth,
      effectiveDailyLimit,
      effectiveMonthlyLimit,
    };
  }

  return {
    allowed: true,
    usagePctMonth,
    sentToday,
    sentMonth,
    effectiveDailyLimit,
    effectiveMonthlyLimit,
  };
}

export interface EmailTag {
  name: string;
  value: string;
}

export interface SendTransactionalEmailParams {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  from?: string;
  replyTo?: string;
  tags?: EmailTag[];
}

export type SendTransactionalEmailResult =
  | {
      ok: true;
      messageId: string;
      from: string;
      replyTo: string;
    }
  | {
      ok: false;
      error: string;
      statusCode: number;
    };

function sanitizeProviderError(rawMessage: unknown): string {
  const msg = typeof rawMessage === "string" ? rawMessage : "Email provider request failed.";
  // Strip any accidental bearer/key-like tokens before surfacing or logging
  return msg.replace(/re_[A-Za-z0-9_]+/g, "[REDACTED_KEY]").slice(0, 300);
}

/**
 * Reusable server-side transactional email dispatcher for CounterCub.
 * Designed as the shared transport layer for the centralized Email Centre.
 */
export async function sendTransactionalEmail(
  params: SendTransactionalEmailParams
): Promise<SendTransactionalEmailResult> {
  const from = params.from || COUNTERCUB_EMAIL_FROM;
  const replyTo = params.replyTo || COUNTERCUB_EMAIL_REPLY_TO;

  let resend;
  try {
    resend = getResendClient();
  } catch (err: unknown) {
    const safeMsg = sanitizeProviderError(err instanceof Error ? err.message : err);
    console.error("[EmailService] Client initialization error:", safeMsg);
    return {
      ok: false,
      error: safeMsg,
      statusCode: 503,
    };
  }

  try {
    const { data, error } = await resend.emails.send({
      from,
      to: params.to,
      replyTo,
      subject: params.subject,
      html: params.html,
      text: params.text,
      tags: params.tags,
    });

    if (error || !data?.id) {
      const safeError = sanitizeProviderError(error?.message || "Email provider rejected the request.");
      const statusCode =
        typeof (error as { statusCode?: number } | null)?.statusCode === "number"
          ? (error as { statusCode: number }).statusCode
          : 502;

      console.error("[EmailService] Provider error:", {
        statusCode,
        error: safeError,
        tags: params.tags,
      });

      return {
        ok: false,
        error: "Unable to dispatch email via provider.",
        statusCode: statusCode >= 400 && statusCode < 600 ? statusCode : 502,
      };
    }

    console.info("[EmailService] Email dispatched:", {
      messageId: data.id,
      from,
      replyTo,
      tags: params.tags,
    });

    return {
      ok: true,
      messageId: data.id,
      from,
      replyTo,
    };
  } catch (err: unknown) {
    const safeMsg = sanitizeProviderError(err instanceof Error ? err.message : err);
    console.error("[EmailService] Unexpected transport failure:", safeMsg);
    return {
      ok: false,
      error: "Email service temporarily unavailable.",
      statusCode: 502,
    };
  }
}

