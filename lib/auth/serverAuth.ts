import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { createUserScopedServerClient } from "@/lib/supabaseUserServer";
import {
  authorizeTenantContext,
  type TenantPermission,
} from "@/lib/auth/authorization";
import {
  extractAccessTokenFromRequest,
  parseJwtPayload,
  resolveBusinessByHostname,
  resolveImpersonationGrantFromRequest,
} from "@/lib/data/serverDal";
import { verifySameOriginCsrf } from "@/lib/security/csrf";

export interface AuthenticatedUser {
  id: string;
  email: string;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isStockManager: boolean;
  businessId: string;
  aal?: "aal1" | "aal2";
  isImpersonating?: boolean;
  impersonationSessionId?: string | null;
}

export interface AuthSuccess {
  user: AuthenticatedUser;
  /**
   * For ordinary tenant routes (`!options.requireSuperAdmin`), `supa` is a
   * user-scoped Supabase client bound to the caller's JWT that enforces PostgreSQL RLS.
   * `supabaseAdmin()` (service-role) is returned ONLY when `options.requireSuperAdmin === true`.
   */
  supa: SupabaseClient;
}

export interface AuthFailure {
  errorResponse: NextResponse;
}

export interface AuthenticateRequestOptions {
  requireAdmin?: boolean;
  requireStockManager?: boolean;
  requiredPermission?: TenantPermission;
  requireSuperAdmin?: boolean;
  requireAAL2?: boolean;
  requireRecentAuthMinutes?: number;
  requestedBusinessId?: string | null;
}

// In-memory rate limiter for traffic control on sensitive endpoints with automatic eviction
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

export function checkRateLimit(
  key: string,
  limit = 60,
  windowMs = 60000
): boolean {
  const now = Date.now();

  if (rateLimitMap.size > 200) {
    for (const [k, v] of rateLimitMap.entries()) {
      if (now > v.resetTime) {
        rateLimitMap.delete(k);
      }
    }
  }

  const record = rateLimitMap.get(key);

  if (!record || now > record.resetTime) {
    rateLimitMap.set(key, { count: 1, resetTime: now + windowMs });
    return true;
  }

  if (record.count >= limit) {
    return false;
  }

  record.count += 1;
  return true;
}

/**
 * Validates request authentication, canonical hostname tenant context,
 * independent tenant membership, role permissions, and returns a user-scoped
 * RLS Supabase client for ordinary tenant operations.
 */
export async function authenticateRequest(
  request: Request,
  options: AuthenticateRequestOptions = {}
): Promise<AuthSuccess | AuthFailure> {
  const ip = request.headers.get("x-forwarded-for") || "unknown";

  if (!checkRateLimit(`ip_${ip}`, 120, 60000)) {
    return {
      errorResponse: NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      ),
    };
  }

  // 0. CSRF & Same-Origin Verification on Mutating Requests
  const csrfCheck = verifySameOriginCsrf(request);
  if (!csrfCheck.ok) {
    return {
      errorResponse: NextResponse.json(
        {
          error: csrfCheck.reason || "Forbidden: Cross-origin mutating request rejected.",
          code: "CSRF_ORIGIN_MISMATCH",
        },
        { status: 403 }
      ),
    };
  }

  // 1. Extract Bearer or Cookie token
  const token = extractAccessTokenFromRequest(request);
  if (!token) {
    return {
      errorResponse: NextResponse.json(
        { error: "Authentication required. Missing token." },
        { status: 401 }
      ),
    };
  }

  const adminSupa = supabaseAdmin();

  // 2. Verify token with Supabase Auth
  const { data: authData, error: authErr } = await adminSupa.auth.getUser(token);
  if (authErr || !authData?.user) {
    return {
      errorResponse: NextResponse.json(
        { error: "Invalid or expired session. Please sign in again." },
        { status: 401 }
      ),
    };
  }

  const userId = authData.user.id;
  const userEmail = authData.user.email || "";

  // Extract JWT claims for MFA Assurance Level (AAL)
  const jwtPayload = parseJwtPayload(token);
  const aal: "aal1" | "aal2" = jwtPayload?.aal === "aal2" ? "aal2" : "aal1";
  const amr = Array.isArray(jwtPayload?.amr) ? jwtPayload.amr : [];

  // 3. Resolve profile, role flags, and business_id from authoritative DB record
  const { data: profile, error: profErr } = await adminSupa
    .from("profiles")
    .select("id, email, is_admin, is_stock_manager, is_super_admin, business_id")
    .eq("id", userId)
    .maybeSingle();

  if (profErr || !profile) {
    return {
      errorResponse: NextResponse.json(
        { error: "User profile not found." },
        { status: 403 }
      ),
    };
  }

  const isAdmin = Boolean(profile.is_admin);
  // Super Admin status derives SOLELY from the authoritative database record (never hardcoded email)
  const isSuperAdmin = Boolean(profile.is_super_admin);
  const isStockManager = Boolean(profile.is_stock_manager);

  // 4. Platform Super Admin Route Path (`options.requireSuperAdmin === true`)
  if (options.requireSuperAdmin) {
    if (!isSuperAdmin) {
      return {
        errorResponse: NextResponse.json(
          { error: "Forbidden: Super Admin access required." },
          { status: 403 }
        ),
      };
    }

    const shouldRequireAAL2 = options.requireAAL2 !== false;
    if (shouldRequireAAL2 && aal !== "aal2") {
      return {
        errorResponse: NextResponse.json(
          {
            error:
              "Forbidden: Super Admin access requires MFA Authenticator Assurance Level 2 (AAL2).",
            mfaRequired: true,
          },
          { status: 403 }
        ),
      };
    }

    if (
      options.requireRecentAuthMinutes &&
      options.requireRecentAuthMinutes > 0
    ) {
      const nowSec = Math.floor(Date.now() / 1000);
      const maxAgeSec = options.requireRecentAuthMinutes * 60;
      const latestAuthTime = amr.reduce((latest: number, entry: any) => {
        const ts = Number(entry?.timestamp || 0);
        return ts > latest ? ts : latest;
      }, Number(jwtPayload?.iat || 0));

      if (latestAuthTime > 0 && nowSec - latestAuthTime > maxAgeSec) {
        return {
          errorResponse: NextResponse.json(
            {
              error: `Security Requirement: Recent re-authentication required (${options.requireRecentAuthMinutes} minutes limit exceeded).`,
              reauthRequired: true,
            },
            { status: 403 }
          ),
        };
      }
    }

    return {
      user: {
        id: userId,
        email: userEmail,
        isAdmin,
        isSuperAdmin,
        isStockManager,
        businessId: profile.business_id || "",
        aal,
        isImpersonating: false,
        impersonationSessionId: null,
      },
      supa: adminSupa,
    };
  }

  // 5. Ordinary Tenant Route Path:
  //    - Resolve canonical hostname & business (if on `<slug>.countercub.com`)
  //    - Check active support impersonation grant if caller is Super Admin
  //    - Verify independent tenant membership & permissions
  //    - Return user-scoped RLS Supabase client (NEVER service-role!)
  const { hostnameResolution, hostnameBusiness } =
    await resolveBusinessByHostname(request);

  if (
    !hostnameResolution.valid &&
    hostnameResolution.errorCode !== "EMPTY_HOSTNAME"
  ) {
    return {
      errorResponse: NextResponse.json(
        {
          error:
            hostnameResolution.errorMessage || "Invalid or untrusted hostname.",
          code: hostnameResolution.errorCode,
        },
        { status: 400 }
      ),
    };
  }

  const impersonationGrant = isSuperAdmin
    ? await resolveImpersonationGrantFromRequest(request, userId)
    : null;

  const authz = authorizeTenantContext({
    identity: {
      userId,
      email: userEmail,
      aal,
    },
    profile,
    hostnameResolution,
    hostnameBusiness,
    requestedBusinessId: options.requestedBusinessId,
    impersonationGrant,
    requiredPermission: options.requiredPermission,
    requireAdmin: options.requireAdmin,
    requireStockManager: options.requireStockManager,
  });

  if (!authz.authorized || !authz.businessId || !authz.membership) {
    return {
      errorResponse: NextResponse.json(
        {
          error: authz.errorMessage || "Forbidden",
          code: authz.errorCode,
        },
        { status: authz.status }
      ),
    };
  }

  const userScopedSupa = createUserScopedServerClient(token, {
    impersonationSessionId: authz.impersonationGrant?.sessionId || null,
  });

  return {
    user: {
      id: userId,
      email: userEmail,
      isAdmin: authz.membership.isTenantAdmin,
      isSuperAdmin,
      isStockManager: authz.membership.isStockManager,
      businessId: authz.businessId,
      aal,
      isImpersonating: Boolean(authz.isImpersonating),
      impersonationSessionId: authz.impersonationGrant?.sessionId || null,
    },
    supa: userScopedSupa,
  };
}
