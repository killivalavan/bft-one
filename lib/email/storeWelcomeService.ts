import type { SupabaseClient } from "@supabase/supabase-js";
import { sendTransactionalEmail } from "@/lib/email/emailService";
import {
  COUNTERCUB_EMAIL_FROM,
  COUNTERCUB_EMAIL_REPLY_TO,
} from "@/lib/email/resendClient";
import { buildStoreAdminWelcomeEmail } from "@/lib/email/templates/storeAdminWelcomeEmail";
import { extractClientMetadata, logAuditEvent } from "@/lib/services/auditLogger";
import { getBusinessStoreId } from "@/lib/utils/storeIdGenerator";

export interface StoreWelcomePayload {
  businessId: string;
  userId: string;
  storeName: string;
  slug: string;
  storeId?: string;
  storePrefix?: string;
  adminLoginId: string;
  authEmail: string;
  contactEmail: string;
  planName: string;
  planAmount: number;
  currencySymbol: string;
  billingDurationMonths: number | null;
  productLimit: number | null;
  employeeLimit: number;
  activationDateIso: string;
  expiryDateIso: string | null;
}

export interface StoreWelcomeDispatchResult {
  status: "sent" | "failed" | "skipped_duplicate";
  dispatchId: string | null;
  messageId: string | null;
  recipientEmail: string;
  error?: string;
}

function formatBillingCycle(months: number | null, planAmount: number): string {
  if (months === null || months === undefined) {
    return planAmount === 0 ? "Free / No Expiry" : "Ongoing";
  }
  if (months === 1) return "Monthly (1 month)";
  if (months === 3) return "Quarterly (3 months)";
  if (months === 6) return "Half-Yearly (6 months)";
  if (months === 12) return "Yearly (12 months)";
  return `${months} months`;
}

function formatDateLabel(iso: string): string {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso;
  return dt.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function resolveTenantOrigin(slug: string, request?: Request): string {
  const host = (request?.headers.get("x-forwarded-host") || request?.headers.get("host") || "").toLowerCase();
  if (host.includes("localhost") || host.includes("127.0.0.1")) {
    const portMatch = /:(\d+)/.exec(host);
    const port = portMatch ? `:${portMatch[1]}` : ":3000";
    return `http://${slug}.localhost${port}`;
  }
  return `https://${slug}.countercub.com`;
}

async function generatePasswordSetupLink(
  supa: SupabaseClient,
  authEmail: string,
  slug: string,
  request?: Request
): Promise<string> {
  const baseResetUrl = `${resolveTenantOrigin(slug, request)}/set-password`;
  try {
    const { data, error } = await supa.auth.admin.generateLink({
      type: "recovery",
      email: authEmail,
      options: { redirectTo: baseResetUrl },
    });
    const hashedToken = data?.properties?.hashed_token;
    if (!error && hashedToken) {
      return `${baseResetUrl}?token_hash=${encodeURIComponent(hashedToken)}&type=recovery`;
    }
    if (!error && data?.properties?.action_link) {
      return data.properties.action_link;
    }
    console.warn(
      "[StoreWelcomeEmail] generateLink fallback:",
      error?.message || "Missing hashed_token"
    );
  } catch (err: unknown) {
    console.warn(
      "[StoreWelcomeEmail] generateLink exception:",
      err instanceof Error ? err.message : "Unknown error"
    );
  }
  return baseResetUrl;
}

async function executeWelcomeSend(
  supa: SupabaseClient,
  dispatchId: string | null,
  attemptNumber: number,
  payload: StoreWelcomePayload,
  actor: { id: string; email: string },
  request?: Request
): Promise<StoreWelcomeDispatchResult> {
  const loginUrl = `${resolveTenantOrigin(payload.slug, request)}/login`;
  const passwordSetupUrl = await generatePasswordSetupLink(
    supa,
    payload.authEmail,
    payload.slug,
    request
  );

  const planAmountFormatted =
    payload.planAmount === 0
      ? `${payload.currencySymbol}0 (Free)`
      : `${payload.currencySymbol}${payload.planAmount.toLocaleString("en-IN")}`;

  let resolvedStoreId = payload.storeId?.trim() || "";
  if (!resolvedStoreId && payload.businessId) {
    const { data: bizRow } = await supa
      .from("businesses")
      .select("id, name, slug, enabled_modules")
      .eq("id", payload.businessId)
      .maybeSingle();
    if (bizRow) {
      resolvedStoreId = getBusinessStoreId(bizRow).storeId;
    }
  }

  const { subject, html, text } = buildStoreAdminWelcomeEmail({
    storeName: payload.storeName,
    slug: payload.slug,
    storeId: resolvedStoreId || undefined,
    adminLoginId: payload.adminLoginId,
    contactEmail: payload.contactEmail,
    planName: payload.planName,
    planAmountFormatted,
    billingCycle: formatBillingCycle(payload.billingDurationMonths, payload.planAmount),
    productLimitLabel:
      payload.productLimit === null ? "Unlimited" : String(payload.productLimit),
    employeeLimitLabel: String(payload.employeeLimit),
    activationDateLabel: formatDateLabel(payload.activationDateIso),
    expiryDateLabel: payload.expiryDateIso ? formatDateLabel(payload.expiryDateIso) : null,
    loginUrl,
    passwordSetupUrl,
  });

  const sendRes = await sendTransactionalEmail({
    to: [payload.contactEmail],
    from: COUNTERCUB_EMAIL_FROM,
    replyTo: COUNTERCUB_EMAIL_REPLY_TO,
    subject,
    html,
    text,
    tags: [
      { name: "category", value: "store_admin_welcome" },
      { name: "business_id", value: payload.businessId },
    ],
  });

  const nowIso = new Date().toISOString();
  const clientMeta = request ? extractClientMetadata(request) : {};

  if (!sendRes.ok) {
    if (dispatchId) {
      await supa
        .from("email_dispatches")
        .update({
          status: "failed",
          attempt_count: attemptNumber,
          last_error: sendRes.error,
          last_attempted_at: nowIso,
          updated_at: nowIso,
        })
        .eq("id", dispatchId);
    }

    await logAuditEvent({
      businessId: payload.businessId,
      actorId: actor.id,
      actorEmail: actor.email,
      action: "STORE_WELCOME_EMAIL_FAILED",
      targetType: "email",
      targetId: dispatchId || payload.businessId,
      details: {
        recipientEmail: payload.contactEmail,
        adminLoginId: payload.adminLoginId,
        error: sendRes.error,
        attemptCount: attemptNumber,
      },
      ...clientMeta,
    });

    return {
      status: "failed",
      dispatchId,
      messageId: null,
      recipientEmail: payload.contactEmail,
      error: sendRes.error,
    };
  }

  if (dispatchId) {
    await supa
      .from("email_dispatches")
      .update({
        status: "sent",
        provider_message_id: sendRes.messageId,
        attempt_count: attemptNumber,
        last_error: null,
        last_attempted_at: nowIso,
        sent_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", dispatchId);
  }

  await logAuditEvent({
    businessId: payload.businessId,
    actorId: actor.id,
    actorEmail: actor.email,
    action: "STORE_WELCOME_EMAIL_SENT",
    targetType: "email",
    targetId: sendRes.messageId,
    details: {
      provider: "resend",
      dispatchId,
      messageId: sendRes.messageId,
      recipientEmail: payload.contactEmail,
      adminLoginId: payload.adminLoginId,
      attemptCount: attemptNumber,
    },
    ...clientMeta,
  });

  return {
    status: "sent",
    dispatchId,
    messageId: sendRes.messageId,
    recipientEmail: payload.contactEmail,
  };
}

/**
 * Idempotently queues and dispatches the Store Admin welcome email after onboarding.
 * Never throws: any provider or outbox error is recorded for safe retry without rolling back store creation.
 */
export async function dispatchStoreWelcomeEmail(
  supa: SupabaseClient,
  payload: StoreWelcomePayload,
  actor: { id: string; email: string },
  request?: Request
): Promise<StoreWelcomeDispatchResult> {
  const idempotencyKey = `store_welcome:${payload.businessId}:${payload.userId}`;
  const subject = `Welcome to CounterCub — ${payload.storeName} is Ready`;

  let dispatchId: string | null = null;
  let attemptNumber = 1;

  try {
    const { data: inserted, error: insErr } = await supa
      .from("email_dispatches")
      .insert({
        idempotency_key: idempotencyKey,
        email_type: "store_admin_welcome",
        business_id: payload.businessId,
        user_id: payload.userId,
        recipient_email: payload.contactEmail,
        from_email: COUNTERCUB_EMAIL_FROM,
        reply_to_email: COUNTERCUB_EMAIL_REPLY_TO,
        subject,
        payload,
        status: "sending",
        provider: "resend",
      })
      .select("id, attempt_count")
      .single();

    if (insErr) {
      if (insErr.code === "23505") {
        const { data: existing } = await supa
          .from("email_dispatches")
          .select("id, status, provider_message_id, attempt_count")
          .eq("idempotency_key", idempotencyKey)
          .maybeSingle();

        if (existing?.status === "sent") {
          return {
            status: "skipped_duplicate",
            dispatchId: existing.id,
            messageId: existing.provider_message_id || null,
            recipientEmail: payload.contactEmail,
          };
        }
        dispatchId = existing?.id || null;
        attemptNumber = (existing?.attempt_count || 0) + 1;
      } else {
        console.warn("[StoreWelcomeEmail] Outbox insert warning:", insErr.message);
      }
    } else if (inserted) {
      dispatchId = inserted.id;
    }

    return await executeWelcomeSend(supa, dispatchId, attemptNumber, payload, actor, request);
  } catch (err: unknown) {
    const safeErr =
      err instanceof Error ? err.message : "Failed to dispatch store welcome email.";
    console.error("[StoreWelcomeEmail] Non-fatal dispatch error:", safeErr);
    return {
      status: "failed",
      dispatchId,
      messageId: null,
      recipientEmail: payload.contactEmail,
      error: safeErr,
    };
  }
}

/**
 * Safely retries a queued or failed Store Admin welcome email from email_dispatches.
 */
export async function retryStoreWelcomeEmail(
  supa: SupabaseClient,
  params: { dispatchId?: string; businessId?: string },
  actor: { id: string; email: string },
  request?: Request
): Promise<StoreWelcomeDispatchResult | null> {
  let query = supa
    .from("email_dispatches")
    .select("*")
    .eq("email_type", "store_admin_welcome");

  if (params.dispatchId) {
    query = query.eq("id", params.dispatchId);
  } else if (params.businessId) {
    query = query.eq("business_id", params.businessId).order("created_at", { ascending: false }).limit(1);
  } else {
    return null;
  }

  const { data: row, error } = await query.maybeSingle();
  if (error || !row) {
    return null;
  }

  if (row.status === "sent") {
    return {
      status: "skipped_duplicate",
      dispatchId: row.id,
      messageId: row.provider_message_id || null,
      recipientEmail: row.recipient_email,
    };
  }

  const payload = row.payload as StoreWelcomePayload;
  const nextAttempt = (Number(row.attempt_count) || 0) + 1;

  await supa
    .from("email_dispatches")
    .update({ status: "sending", updated_at: new Date().toISOString() })
    .eq("id", row.id);

  return executeWelcomeSend(supa, row.id, nextAttempt, payload, actor, request);
}

