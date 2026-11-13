import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/serverAuth";
import {
  isValidUuid,
  MAX_IMPERSONATION_TTL_MS,
  MIN_IMPERSONATION_REASON_LENGTH,
  type SupportImpersonationGrant,
} from "@/lib/auth/authorization";
import {
  registerImpersonationGrantInMemory,
  resolveImpersonationGrantFromRequest,
  revokeImpersonationGrantInMemory,
} from "@/lib/data/serverDal";
import { logAuditEvent } from "@/lib/services/auditLogger";

/**
 * CounterCub — Audited Support Impersonation Lifecycle API
 *
 * Implements Section 4 (Cross-tenant support access requirements):
 * - Authorized Super Admin identity
 * - MFA (AAL2) and step-up authentication
 * - Explicit target tenant (`target_business_id`)
 * - Mandatory reason for access (>= 10 characters)
 * - Short-lived authorization grant (max 30 minutes)
 * - Immutable audit logging (`IMPERSONATION_STARTED` / `IMPERSONATION_REVOKED`)
 * - Automatic expiration and revocation
 */

function getImpersonationCookieDomain(request: Request): string | null {
  const rawHost = (
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    ""
  )
    .split(",")[0]
    .trim()
    .toLowerCase()
    .split(":")[0];

  if (!rawHost || rawHost === "localhost" || rawHost.endsWith(".localhost") || rawHost === "127.0.0.1") {
    return null;
  }
  if (rawHost === "countercub.com" || rawHost.endsWith(".countercub.com")) {
    return ".countercub.com";
  }
  if (rawHost === "seyalpro.com" || rawHost.endsWith(".seyalpro.com")) {
    return ".seyalpro.com";
  }
  return null;
}

function buildImpersonationCookieHeader(
  request: Request,
  sessionId: string,
  maxAgeSec: number
): string {
  const isProd = process.env.NODE_ENV === "production";
  const cookieDomain = getImpersonationCookieDomain(request);
  return [
    `cc_impersonation_session=${encodeURIComponent(sessionId)}`,
    "Path=/",
    ...(cookieDomain ? [`Domain=${cookieDomain}`] : []),
    `Max-Age=${maxAgeSec}`,
    "HttpOnly",
    "SameSite=Lax",
    ...(isProd ? ["Secure"] : []),
  ].join("; ");
}

export async function GET(request: Request) {
  const auth = await authenticateRequest(request, {
    requireSuperAdmin: true,
    requireAAL2: false,
  });
  if ("errorResponse" in auth) return auth.errorResponse;

  const grant = await resolveImpersonationGrantFromRequest(
    request,
    auth.user.id
  );

  if (!grant || grant.revokedAt || Date.parse(grant.expiresAt) <= Date.now()) {
    return NextResponse.json({ active: false, session: null });
  }

  return NextResponse.json({
    active: true,
    session: grant,
  });
}

export async function POST(request: Request) {
  const auth = await authenticateRequest(request, {
    requireSuperAdmin: true,
    requireAAL2: true,
    requireRecentAuthMinutes: 30,
  });
  if ("errorResponse" in auth) return auth.errorResponse;

  const { user, supa } = auth;

  try {
    const body = await request.json().catch(() => ({}));
    const targetBusinessId = String(body.target_business_id || body.targetBusinessId || "").trim();
    const reason = String(body.reason || "").trim();
    const requestedMinutes = Number(body.duration_minutes || body.durationMinutes || 15);

    if (!isValidUuid(targetBusinessId)) {
      return NextResponse.json(
        {
          error: "A valid target_business_id UUID is required.",
          code: "INVALID_TARGET_BUSINESS",
        },
        { status: 400 }
      );
    }

    if (reason.length < MIN_IMPERSONATION_REASON_LENGTH) {
      return NextResponse.json(
        {
          error: `Support access reason must be at least ${MIN_IMPERSONATION_REASON_LENGTH} characters long.`,
          code: "REASON_TOO_SHORT",
        },
        { status: 400 }
      );
    }

    const durationMs = Math.min(
      Math.max(5, requestedMinutes) * 60 * 1000,
      MAX_IMPERSONATION_TTL_MS
    );

    // Verify target business exists
    const { data: targetBiz, error: bizErr } = await supa
      .from("businesses")
      .select("id, name, slug")
      .eq("id", targetBusinessId)
      .maybeSingle();

    if (bizErr || !targetBiz) {
      return NextResponse.json(
        {
          error: "Target business workspace does not exist.",
          code: "TENANT_NOT_FOUND",
        },
        { status: 404 }
      );
    }

    // Auto-revoke any prior active support impersonation session for this Super Admin before starting a new one
    const priorGrant = await resolveImpersonationGrantFromRequest(request, user.id);
    if (priorGrant && !priorGrant.revokedAt) {
      revokeImpersonationGrantInMemory(priorGrant.sessionId);
      await logAuditEvent({
        businessId: priorGrant.targetBusinessId,
        actorId: user.id,
        actorEmail: user.email,
        action: "SUPPORT_IMPERSONATION_REVOKED",
        targetType: "business",
        targetId: priorGrant.targetBusinessId,
        details: {
          session_id: priorGrant.sessionId,
          reason: "switched_to_another_store",
          next_target_business_id: targetBiz.id,
        },
        request,
      });
    }
    try {
      await supa
        .from("support_impersonation_sessions")
        .update({ revoked_at: new Date().toISOString() })
        .eq("super_admin_id", user.id)
        .is("revoked_at", null);
    } catch {}

    const sessionId = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + durationMs).toISOString();

    const grant: SupportImpersonationGrant = {
      sessionId,
      superAdminId: user.id,
      superAdminEmail: user.email,
      targetBusinessId: targetBiz.id,
      targetBusinessSlug: targetBiz.slug,
      reason,
      mfaVerified: user.aal === "aal2",
      createdAt,
      expiresAt,
      revokedAt: null,
    };

    // Persist in PostgreSQL `support_impersonation_sessions` if table exists
    try {
      await supa.from("support_impersonation_sessions").insert({
        id: sessionId,
        super_admin_id: user.id,
        super_admin_email: user.email,
        target_business_id: targetBiz.id,
        reason,
        mfa_aal: user.aal || "aal2",
        created_at: createdAt,
        expires_at: expiresAt,
      });
    } catch {
      // Fallback handled by in-memory registry prior to Phase 2 SQL migration execution
    }

    registerImpersonationGrantInMemory(grant);

    await logAuditEvent({
      businessId: targetBiz.id,
      actorId: user.id,
      actorEmail: user.email,
      action: "SUPPORT_IMPERSONATION_STARTED",
      targetType: "business",
      targetId: targetBiz.id,
      details: {
        session_id: sessionId,
        target_business_name: targetBiz.name,
        target_business_slug: targetBiz.slug,
        reason,
        expires_at: expiresAt,
        mfa_aal: user.aal,
      },
      request,
    });

    const maxAgeSec = Math.floor(durationMs / 1000);
    const cookieFlags = buildImpersonationCookieHeader(request, sessionId, maxAgeSec);

    return NextResponse.json(
      {
        ok: true,
        session: grant,
        targetBusiness: {
          id: targetBiz.id,
          name: targetBiz.name,
          slug: targetBiz.slug,
        },
      },
      {
        status: 201,
        headers: {
          "Set-Cookie": cookieFlags,
          "Cache-Control": "private, no-store",
        },
      }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to initiate support session." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  const auth = await authenticateRequest(request, {
    requireSuperAdmin: true,
    requireAAL2: false,
  });
  if ("errorResponse" in auth) return auth.errorResponse;

  try {
    const body = await request.json().catch(() => ({}));
    const sessionId = typeof body?.session_id === "string" ? body.session_id.trim() : "";
    if (!sessionId || !isValidUuid(sessionId)) {
      return NextResponse.json({ error: "Valid session_id is required." }, { status: 400 });
    }

    const grantReq = new Request(request.url, {
      headers: { "x-impersonation-session-id": sessionId },
    });
    const grant = await resolveImpersonationGrantFromRequest(grantReq, auth.user.id);

    if (!grant || grant.revokedAt || Date.parse(grant.expiresAt) <= Date.now()) {
      return NextResponse.json(
        { error: "Support impersonation session is invalid or expired." },
        { status: 403 }
      );
    }

    const remainingSec = Math.max(
      1,
      Math.floor((Date.parse(grant.expiresAt) - Date.now()) / 1000)
    );
    const cookieFlags = buildImpersonationCookieHeader(
      request,
      grant.sessionId,
      remainingSec
    );

    return NextResponse.json(
      { ok: true, session: grant },
      {
        status: 200,
        headers: {
          "Set-Cookie": cookieFlags,
          "Cache-Control": "private, no-store",
        },
      }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to bind support session cookie." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const auth = await authenticateRequest(request, {
    requireSuperAdmin: true,
    requireAAL2: false,
  });
  if ("errorResponse" in auth) return auth.errorResponse;

  const { user, supa } = auth;
  const activeGrant = await resolveImpersonationGrantFromRequest(
    request,
    user.id
  );

  if (activeGrant) {
    revokeImpersonationGrantInMemory(activeGrant.sessionId);

    try {
      await supa
        .from("support_impersonation_sessions")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", activeGrant.sessionId)
        .eq("super_admin_id", user.id);
    } catch {}

    await logAuditEvent({
      businessId: activeGrant.targetBusinessId,
      actorId: user.id,
      actorEmail: user.email,
      action: "SUPPORT_IMPERSONATION_REVOKED",
      targetType: "business",
      targetId: activeGrant.targetBusinessId,
      details: {
        session_id: activeGrant.sessionId,
      },
      request,
    });
  }

  const isProd = process.env.NODE_ENV === "production";
  const cookieDomain = getImpersonationCookieDomain(request);
  const clearCookie = [
    "cc_impersonation_session=",
    "Path=/",
    ...(cookieDomain ? [`Domain=${cookieDomain}`] : []),
    "Max-Age=0",
    "HttpOnly",
    "SameSite=Lax",
    ...(isProd ? ["Secure"] : []),
  ].join("; ");

  return NextResponse.json(
    { ok: true, revoked: Boolean(activeGrant) },
    {
      status: 200,
      headers: {
        "Set-Cookie": clearCookie,
        "Cache-Control": "private, no-store",
      },
    }
  );
}

