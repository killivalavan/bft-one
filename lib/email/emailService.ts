import {
  COUNTERCUB_EMAIL_FROM,
  COUNTERCUB_EMAIL_REPLY_TO,
  getResendClient,
} from "@/lib/email/resendClient";

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

