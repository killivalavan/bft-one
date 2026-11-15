import { Resend } from "resend";

export const COUNTERCUB_EMAIL_FROM = "CounterCub Support <support@countercub.com>";
export const COUNTERCUB_EMAIL_REPLY_TO = "support@countercub.com";

let _resendClient: Resend | null = null;

/**
 * Server-only Resend client singleton.
 * Reads RESEND_API_KEY exclusively from process.env and must never be imported
 * or executed in browser bundles.
 */
export function getResendClient(): Resend {
  if (typeof window !== "undefined") {
    throw new Error("Resend client cannot be initialized in a browser environment.");
  }

  if (_resendClient) {
    return _resendClient;
  }

  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Email service is not configured: missing RESEND_API_KEY.");
  }

  _resendClient = new Resend(apiKey);
  return _resendClient;
}

