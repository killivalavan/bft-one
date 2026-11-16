import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/serverAuth";
import { checkRateLimit } from "@/lib/security/csrf";
import { retryStoreWelcomeEmail } from "@/lib/email/storeWelcomeService";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const auth = await authenticateRequest(request, { requireSuperAdmin: true });
    if ("errorResponse" in auth) {
      return auth.errorResponse;
    }

    const { supa, user: caller } = auth;

    const rate = checkRateLimit(`super_admin_email_retry:${caller.id}`, 10, 10 * 60_000);
    if (!rate.allowed) {
      const retryAfterSec = Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000));
      return NextResponse.json(
        { error: "Too many retry requests. Please wait before trying again." },
        { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
      );
    }

    const body = await request.json().catch(() => ({}));
    const dispatchId = typeof body?.dispatchId === "string" ? body.dispatchId.trim() : undefined;
    const businessId = typeof body?.businessId === "string" ? body.businessId.trim() : undefined;

    if (!dispatchId && !businessId) {
      return NextResponse.json(
        { error: "dispatchId or businessId is required." },
        { status: 400 }
      );
    }

    const result = await retryStoreWelcomeEmail(
      supa,
      { dispatchId, businessId },
      { id: caller.id, email: caller.email },
      request
    );

    if (!result) {
      return NextResponse.json(
        { error: "No matching welcome email dispatch record found." },
        { status: 404 }
      );
    }

    if (result.status === "failed") {
      return NextResponse.json(
        {
          ok: false,
          status: result.status,
          dispatchId: result.dispatchId,
          recipient: result.recipientEmail,
          error: result.error || "Email delivery failed.",
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      status: result.status,
      dispatchId: result.dispatchId,
      messageId: result.messageId,
      recipient: result.recipientEmail,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

