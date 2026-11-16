import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/serverAuth";
import { checkRateLimit } from "@/lib/security/csrf";
import {
  buildManualAlertEmailContent,
  listSubscriptionAlerts,
  sendManualSubscriptionAlert,
  type ManualAlertTemplateType,
} from "@/lib/email/subscriptionAlertService";

export const dynamic = "force-dynamic";

const VALID_TEMPLATES = new Set<ManualAlertTemplateType>([
  "reminder_7d",
  "reminder_3d",
  "reminder_1d",
  "expired_notice",
]);

export async function GET(request: Request) {
  try {
    const auth = await authenticateRequest(request, { requireSuperAdmin: true });
    if ("errorResponse" in auth) return auth.errorResponse;

    const data = await listSubscriptionAlerts(auth.supa);
    return NextResponse.json(data);
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await authenticateRequest(request, { requireSuperAdmin: true });
    if ("errorResponse" in auth) return auth.errorResponse;

    const { supa, user: caller } = auth;
    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || "").trim();
    const businessId = String(body?.businessId || "").trim();
    const templateType = String(body?.templateType || "").trim() as ManualAlertTemplateType;

    if (!businessId || !VALID_TEMPLATES.has(templateType)) {
      return NextResponse.json(
        { error: "Valid businessId and templateType are required." },
        { status: 400 }
      );
    }

    if (action === "preview") {
      const built = await buildManualAlertEmailContent(supa, businessId, templateType);
      if ("error" in built) {
        return NextResponse.json({ error: built.error }, { status: 400 });
      }
      return NextResponse.json({
        ok: true,
        recipientEmail: built.contact.contactEmail,
        adminName: built.contact.adminName,
        storeName: built.contact.storeName,
        subject: built.emailContent.subject,
        html: built.emailContent.html,
        text: built.emailContent.text,
        alreadySentForCurrentExpiry: built.alreadySentForCurrentExpiry,
      });
    }

    if (action === "send") {
      const rate = checkRateLimit(`manual_sub_alert:${caller.id}`, 20, 10 * 60_000);
      if (!rate.allowed) {
        const retryAfterSec = Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000));
        return NextResponse.json(
          { error: "Rate limit exceeded. Please wait before sending more alerts." },
          { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
        );
      }

      const result = await sendManualSubscriptionAlert(supa, {
        businessId,
        templateType,
        idempotencyNonce: String(body?.idempotencyNonce || "").trim(),
        confirmResend: Boolean(body?.confirmResend),
        actor: { id: caller.id, email: caller.email },
        request,
      });

      return NextResponse.json(result, { status: result.ok ? 200 : result.status });
    }

    return NextResponse.json({ error: "Unsupported action. Use 'preview' or 'send'." }, { status: 400 });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

