import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/serverAuth";
import { checkRateLimit } from "@/lib/security/csrf";
import { sendTransactionalEmail } from "@/lib/email/emailService";
import {
  COUNTERCUB_EMAIL_FROM,
  COUNTERCUB_EMAIL_REPLY_TO,
} from "@/lib/email/resendClient";
import { buildSuperAdminTestEmail } from "@/lib/email/templates/testEmail";
import { extractClientMetadata, logAuditEvent } from "@/lib/services/auditLogger";

export const dynamic = "force-dynamic";

const TEST_EMAIL_MAX_REQUESTS = 5;
const TEST_EMAIL_WINDOW_MS = 10 * 60_000; // 10 minutes

export async function POST(request: Request) {
  try {
    // 1. Authenticate Super Admin (requires is_super_admin, AAL2 MFA, and same-origin CSRF)
    const auth = await authenticateRequest(request, { requireSuperAdmin: true });
    if ("errorResponse" in auth) {
      return auth.errorResponse;
    }

    const { supa, user: caller } = auth;

    // 2. Per-Super-Admin sliding-window rate limiting
    const rate = checkRateLimit(
      `super_admin_test_email:${caller.id}`,
      TEST_EMAIL_MAX_REQUESTS,
      TEST_EMAIL_WINDOW_MS
    );
    if (!rate.allowed) {
      const retryAfterSec = Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000));
      return NextResponse.json(
        {
          error: "Too many test email requests. Please wait before trying again.",
          retryAfterSeconds: retryAfterSec,
        },
        {
          status: 429,
          headers: { "Retry-After": String(retryAfterSec) },
        }
      );
    }

    // 3. Resolve the Super Admin's own verified email strictly from authenticated DB records.
    //    Any recipient field in the request body is intentionally ignored.
    const [{ data: profile, error: profErr }, { data: authUserResp, error: authErr }] =
      await Promise.all([
        supa
          .from("profiles")
          .select("id, email, is_super_admin")
          .eq("id", caller.id)
          .maybeSingle(),
        supa.auth.admin.getUserById(caller.id),
      ]);

    if (profErr || !profile || !profile.is_super_admin) {
      return NextResponse.json(
        { error: "Forbidden: Super Admin database record not verified." },
        { status: 403 }
      );
    }

    const authUser = authUserResp?.user;
    if (authErr || !authUser) {
      return NextResponse.json(
        { error: "Unable to resolve authenticated Super Admin account." },
        { status: 400 }
      );
    }

    const verifiedAuthEmail = authUser.email_confirmed_at
      ? (authUser.email || "").trim().toLowerCase()
      : "";
    const profileEmail = (profile.email || "").trim().toLowerCase();

    if (!verifiedAuthEmail) {
      return NextResponse.json(
        { error: "Super Admin email address is not verified in authentication records." },
        { status: 400 }
      );
    }

    if (profileEmail && profileEmail !== verifiedAuthEmail) {
      return NextResponse.json(
        { error: "Super Admin profile email does not match verified authentication email." },
        { status: 400 }
      );
    }

    const recipientEmail = verifiedAuthEmail;
    const timestampIso = new Date().toISOString();
    const environment =
      process.env.VERCEL_ENV || process.env.NODE_ENV || "production";

    // 4. Build and send the CounterCub test email
    const { subject, html, text } = buildSuperAdminTestEmail({
      recipientEmail,
      timestampIso,
      environment,
    });

    const result = await sendTransactionalEmail({
      to: [recipientEmail],
      from: COUNTERCUB_EMAIL_FROM,
      replyTo: COUNTERCUB_EMAIL_REPLY_TO,
      subject,
      html,
      text,
      tags: [
        { name: "category", value: "super_admin_test" },
        { name: "environment", value: environment },
      ],
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.statusCode }
      );
    }

    // 5. Log Resend message ID without exposing credentials
    console.info("[SuperAdminTestEmail] Dispatched:", {
      messageId: result.messageId,
      actorId: caller.id,
      environment,
    });

    const clientMeta = extractClientMetadata(request);
    await logAuditEvent({
      businessId: null,
      actorId: caller.id,
      actorEmail: recipientEmail,
      action: "SUPER_ADMIN_TEST_EMAIL_SENT",
      targetType: "email",
      targetId: result.messageId,
      details: {
        provider: "resend",
        messageId: result.messageId,
        recipientEmail,
        from: result.from,
        replyTo: result.replyTo,
        environment,
      },
      ...clientMeta,
    });

    return NextResponse.json({
      ok: true,
      provider: "resend",
      messageId: result.messageId,
      recipient: recipientEmail,
      from: result.from,
      replyTo: result.replyTo,
      dispatchedAt: timestampIso,
    });
  } catch (err: unknown) {
    console.error(
      "[SuperAdminTestEmail] Unexpected error:",
      err instanceof Error ? err.message : "Unknown error"
    );
    return NextResponse.json(
      { error: "Failed to process test email request." },
      { status: 500 }
    );
  }
}

