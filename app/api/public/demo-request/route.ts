import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { checkRateLimit, verifySameOriginCsrf } from "@/lib/security/csrf";
import { resolveRequestHostname } from "@/lib/tenant/hostnameResolver";
import {
  checkUsageAndPriorityGate,
  sendTransactionalEmail,
} from "@/lib/email/emailService";
import { COUNTERCUB_EMAIL_REPLY_TO } from "@/lib/email/resendClient";
import { buildDemoRequestEmail } from "@/lib/email/templates/demoRequestEmail";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 4096;
const PER_IP_MAX_REQUESTS = 3;
const GLOBAL_MAX_REQUESTS = 20;
const RATE_WINDOW_MS = 15 * 60_000; // 15 minutes

const ALLOWED_PLANS = new Set(["free", "basic", "pro", "business"]);
const ALLOWED_CURRENCIES = new Set(["INR", "USD", "AED", "GBP", "EUR"]);
const ALLOWED_BUSINESS_TYPES = new Map<string, string>([
  ["cafes", "Cafes, Tea Shops & Restaurants"],
  ["pharmacy", "Pharmacies & Medical Stores"],
  ["supermarket", "Supermarkets, Kirana & Grocery"],
  ["retail", "Apparel, Electronics & Retail"],
  ["bakery", "Bakeries, Sweet Shops & Kitchens"],
  ["b2b", "B2B Wholesale & Distributors"],
]);

const PHONE_REGEX = /^[0-9+\-() ]{7,25}$/;
const EMAIL_REGEX = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,20}$/;

function sanitizeField(raw: unknown, maxLen: number): string {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/[\r\n\0-\x1F\x7F]+/g, " ")
    .trim()
    .slice(0, maxLen);
}

function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first.slice(0, 64);
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp.slice(0, 64);
  return "unknown";
}

export async function POST(request: Request) {
  try {
    // 1. Only permit on the canonical marketing host (countercub.com / www.countercub.com / localhost)
    const hostResolution = resolveRequestHostname(request);
    if (!hostResolution.valid || hostResolution.kind !== "marketing") {
      return NextResponse.json(
        {
          ok: false,
          error: "Demo requests are only accepted from the CounterCub public website.",
          code: "INVALID_HOST",
        },
        { status: 403 }
      );
    }

    // 2. Require explicit same-origin browser metadata (Origin or Referer) + verifySameOriginCsrf
    const hasOriginOrReferer = Boolean(
      request.headers.get("origin")?.trim() || request.headers.get("referer")?.trim()
    );
    const csrfCheck = verifySameOriginCsrf(request);
    if (!hasOriginOrReferer || !csrfCheck.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: csrfCheck.reason || "Forbidden: Cross-origin demo submission blocked.",
          code: "CSRF_ORIGIN_MISMATCH",
        },
        { status: 403 }
      );
    }

    // 3. Enforce JSON content-type & payload byte cap before parsing
    const contentType = (request.headers.get("content-type") || "").toLowerCase();
    if (!contentType.includes("application/json")) {
      return NextResponse.json(
        { ok: false, error: "Invalid request content type." },
        { status: 415 }
      );
    }

    const contentLengthHeader = Number(request.headers.get("content-length") || "0");
    if (Number.isFinite(contentLengthHeader) && contentLengthHeader > MAX_BODY_BYTES) {
      return NextResponse.json(
        { ok: false, error: "Request payload too large." },
        { status: 413 }
      );
    }

    const rawBody = await request.text();
    if (rawBody.length > MAX_BODY_BYTES) {
      return NextResponse.json(
        { ok: false, error: "Request payload too large." },
        { status: 413 }
      );
    }

    let body: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(rawBody);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return NextResponse.json(
          { ok: false, error: "Invalid request payload." },
          { status: 400 }
        );
      }
      body = parsed as Record<string, unknown>;
    } catch {
      return NextResponse.json(
        { ok: false, error: "Malformed JSON payload." },
        { status: 400 }
      );
    }

    // 4. Honeypot anti-bot check (silent success so bots do not retry or probe)
    const honeypot = sanitizeField(body.website, 120);
    if (honeypot.length > 0) {
      return NextResponse.json({ ok: true, delivered: true }, { status: 200 });
    }

    // 5. Dual sliding-window rate limiting (per-IP + global burst protection)
    const clientIp = getClientIp(request);
    const ipLimit = checkRateLimit(
      `public_demo_ip:${clientIp}`,
      PER_IP_MAX_REQUESTS,
      RATE_WINDOW_MS
    );
    if (!ipLimit.allowed) {
      const retryAfterSec = Math.max(
        1,
        Math.ceil((ipLimit.resetAt - Date.now()) / 1000)
      );
      return NextResponse.json(
        {
          ok: false,
          error:
            "Too many demo requests from this connection. Please wait a few minutes or email support@countercub.com.",
          code: "RATE_LIMITED",
        },
        {
          status: 429,
          headers: { "Retry-After": String(retryAfterSec) },
        }
      );
    }

    const globalLimit = checkRateLimit(
      "public_demo_global",
      GLOBAL_MAX_REQUESTS,
      RATE_WINDOW_MS
    );
    if (!globalLimit.allowed) {
      const retryAfterSec = Math.max(
        1,
        Math.ceil((globalLimit.resetAt - Date.now()) / 1000)
      );
      return NextResponse.json(
        {
          ok: false,
          error:
            "Demo booking service is busy right now. Please try again shortly or email support@countercub.com.",
          code: "RATE_LIMITED",
        },
        {
          status: 429,
          headers: { "Retry-After": String(retryAfterSec) },
        }
      );
    }

    // 6. Strict input validation & allowlist normalization
    const name = sanitizeField(body.name, 100);
    const phone = sanitizeField(body.phone, 30);
    const email = sanitizeField(body.email, 120).toLowerCase();
    const storeName = sanitizeField(body.storeName, 120);
    const city = sanitizeField(body.city, 100);
    const industryKey = sanitizeField(body.industryId, 30).toLowerCase();
    const rawPlan = sanitizeField(body.plan, 24).toLowerCase();
    const rawCurrency = sanitizeField(body.currency, 8).toUpperCase();

    if (name.length < 2) {
      return NextResponse.json(
        { ok: false, error: "Please enter your full name." },
        { status: 400 }
      );
    }

    if (!PHONE_REGEX.test(phone)) {
      return NextResponse.json(
        { ok: false, error: "Please enter a valid phone or WhatsApp number." },
        { status: 400 }
      );
    }

    if (storeName.length < 2) {
      return NextResponse.json(
        { ok: false, error: "Please enter your store or business name." },
        { status: 400 }
      );
    }

    if (city.length < 2) {
      return NextResponse.json(
        { ok: false, error: "Please enter your city and country." },
        { status: 400 }
      );
    }

    if (!email || !EMAIL_REGEX.test(email)) {
      return NextResponse.json(
        { ok: false, error: "Please enter a valid contact email address." },
        { status: 400 }
      );
    }

    const businessType =
      ALLOWED_BUSINESS_TYPES.get(industryKey) || "Cafes, Tea Shops & Restaurants";
    const planKey = ALLOWED_PLANS.has(rawPlan) ? rawPlan : "free";
    const planLabel = planKey.charAt(0).toUpperCase() + planKey.slice(1);
    const currency = ALLOWED_CURRENCIES.has(rawCurrency) ? rawCurrency : "INR";

    // 7. Priority-3 (P3) quota gate so public demo requests never starve P0/P1 auth & billing emails
    try {
      const supa = supabaseAdmin();
      const gate = await checkUsageAndPriorityGate(supa, 3);
      if (!gate.allowed) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Automated demo email capacity is currently reserved. Please send directly to support@countercub.com.",
            code: "EMAIL_QUOTA_RESERVED",
          },
          { status: 503 }
        );
      }
    } catch {
      // If Supabase admin env vars are absent in minimal dev environments, continue to Resend dispatch
    }

    // 8. Build sanitized template and dispatch strictly to hardcoded support@countercub.com
    const submittedAtIso = new Date().toISOString();
    const emailPayload = buildDemoRequestEmail({
      name,
      phone,
      email: email || undefined,
      storeName,
      city: city || undefined,
      businessType,
      plan: planLabel,
      currency,
      submittedAtIso,
    });

    const result = await sendTransactionalEmail({
      to: COUNTERCUB_EMAIL_REPLY_TO,
      replyTo: email || COUNTERCUB_EMAIL_REPLY_TO,
      subject: emailPayload.subject,
      html: emailPayload.html,
      text: emailPayload.text,
      tags: [
        { name: "category", value: "demo_request" },
        { name: "plan", value: planKey },
      ],
    });

    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Unable to deliver automatically right now. Please use the direct email button below.",
          code: "EMAIL_SEND_FAILED",
        },
        { status: result.statusCode === 503 ? 503 : 502 }
      );
    }

    return NextResponse.json(
      { ok: true, delivered: true },
      { status: 200 }
    );
  } catch (err) {
    console.error("[PublicDemoRequest] Unexpected error:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      {
        ok: false,
        error: "Unable to submit request right now. Please email support@countercub.com.",
      },
      { status: 500 }
    );
  }
}
