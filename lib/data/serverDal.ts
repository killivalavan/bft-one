/**
 * CounterCub — Centralized Server-Side Data Access Layer (DAL)
 *
 * Implements Section 6 (Server-side Data Access Layer):
 * Every sensitive operation must:
 * 1. Authenticate the user via Supabase Auth.
 * 2. Resolve the requested tenant from verified canonical hostname context.
 * 3. Verify tenant membership independently of hostname resolution.
 * 4. Verify role and permission.
 * 5. Execute a tenant-scoped database operation using the authenticated user's
 *    Supabase session + PostgreSQL RLS (never `supabaseAdmin()` for normal tenant CRUD).
 * 6. Return only necessary DTO fields.
 */

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { createUserScopedServerClient } from "@/lib/supabaseUserServer";
import {
  resolveRequestHostname,
  type HostnameResolutionResult,
} from "@/lib/tenant/hostnameResolver";
import {
  authorizeTenantContext,
  derivePlatformPrivilege,
  isValidUuid,
  MAX_IMPERSONATION_TTL_MS,
  MIN_IMPERSONATION_REASON_LENGTH,
  type AuthenticatorAssuranceLevel,
  type ResolvedBusinessInfo,
  type SupportImpersonationGrant,
  type TenantMembership,
  type TenantPermission,
  type UserIdentity,
} from "@/lib/auth/authorization";

// In-memory fallback registry for active support impersonation grants
// (used alongside `public.support_impersonation_sessions` DB table)
const activeImpersonationGrants = new Map<string, SupportImpersonationGrant>();

export function registerImpersonationGrantInMemory(
  grant: SupportImpersonationGrant
): void {
  activeImpersonationGrants.set(grant.sessionId, grant);
}

export function revokeImpersonationGrantInMemory(sessionId: string): boolean {
  const existing = activeImpersonationGrants.get(sessionId);
  if (!existing) return false;
  existing.revokedAt = new Date().toISOString();
  activeImpersonationGrants.set(sessionId, existing);
  return true;
}

export function getImpersonationGrantFromMemory(
  sessionId: string
): SupportImpersonationGrant | null {
  return activeImpersonationGrants.get(sessionId) || null;
}

export function parseJwtPayload(token: string): Record<string, any> | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const jsonStr = Buffer.from(base64, "base64").toString("utf8");
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

/**
 * Extracts the Supabase access token from `Authorization: Bearer <token>` or Supabase auth cookies.
 */
export function extractAccessTokenFromRequest(request: Request): string {
  const authHeader = request.headers.get("authorization");
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    const candidate = authHeader.substring(7).trim();
    if (candidate && candidate !== "null" && candidate !== "undefined") {
      return candidate;
    }
  }

  const cookieHeader = request.headers.get("cookie") || "";
  if (!cookieHeader) return "";

  const chunkRegex = /sb-[a-zA-Z0-9_-]+-auth-token\.(\d+)=([^;]+)/g;
  const chunks: { index: number; value: string }[] = [];
  let chunkMatch: RegExpExecArray | null;
  while ((chunkMatch = chunkRegex.exec(cookieHeader)) !== null) {
    chunks.push({ index: parseInt(chunkMatch[1], 10), value: chunkMatch[2] });
  }

  if (chunks.length > 0) {
    chunks.sort((a, b) => a.index - b.index);
    const combined = chunks.map((c) => c.value).join("");
    try {
      const decoded = decodeURIComponent(combined);
      const parsed = JSON.parse(decoded);
      return Array.isArray(parsed) ? parsed[0] : parsed.access_token || parsed;
    } catch {
      return combined;
    }
  }

  const match =
    cookieHeader.match(/sb-access-token=([^;]+)/) ||
    cookieHeader.match(/sb-[a-zA-Z0-9_-]+-auth-token=([^;]+)/);

  if (match) {
    try {
      const decoded = decodeURIComponent(match[1]);
      const parsed = JSON.parse(decoded);
      return Array.isArray(parsed) ? parsed[0] : parsed.access_token || parsed;
    } catch {
      return match[1];
    }
  }

  return "";
}

/**
 * Resolves the business workspace associated with a verified `<tenant-slug>.countercub.com` hostname.
 */
export async function resolveBusinessByHostname(
  request: Request
): Promise<{
  hostnameResolution: HostnameResolutionResult;
  hostnameBusiness: ResolvedBusinessInfo | null;
}> {
  const hostnameResolution = resolveRequestHostname(request);

  if (
    !hostnameResolution.valid ||
    hostnameResolution.kind !== "tenant_workspace" ||
    !hostnameResolution.tenantSlug
  ) {
    return { hostnameResolution, hostnameBusiness: null };
  }

  const adminSupa = supabaseAdmin();
  const { data: biz } = await adminSupa
    .from("businesses")
    .select("id, slug, name")
    .eq("slug", hostnameResolution.tenantSlug)
    .maybeSingle();

  if (!biz) {
    return { hostnameResolution, hostnameBusiness: null };
  }

  return {
    hostnameResolution,
    hostnameBusiness: {
      id: biz.id,
      slug: biz.slug,
      name: biz.name,
      status: "active",
    },
  };
}

/**
 * Resolves an active SupportImpersonationGrant from request headers/cookies and verifies it
 * against `public.support_impersonation_sessions` (or in-memory fallback).
 */
export async function resolveImpersonationGrantFromRequest(
  request: Request,
  callerId: string
): Promise<SupportImpersonationGrant | null> {
  let sessionId =
    request.headers.get("x-impersonation-session-id")?.trim() || "";

  if (!sessionId) {
    const cookieHeader = request.headers.get("cookie") || "";
    const match = cookieHeader.match(/cc_impersonation_session=([^;]+)/);
    if (match?.[1]) {
      sessionId = decodeURIComponent(match[1]).trim();
    }
  }

  if (!sessionId || !isValidUuid(sessionId)) {
    return null;
  }

  // 1. Check PostgreSQL `support_impersonation_sessions` table first
  try {
    const adminSupa = supabaseAdmin();
    const { data: row, error } = await adminSupa
      .from("support_impersonation_sessions")
      .select(
        "id, super_admin_id, super_admin_email, target_business_id, reason, mfa_aal, created_at, expires_at, revoked_at"
      )
      .eq("id", sessionId)
      .eq("super_admin_id", callerId)
      .maybeSingle();

    if (!error && row) {
      return {
        sessionId: row.id,
        superAdminId: row.super_admin_id,
        superAdminEmail: row.super_admin_email || "",
        targetBusinessId: row.target_business_id,
        reason: row.reason,
        mfaVerified: row.mfa_aal === "aal2",
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        revokedAt: row.revoked_at,
      };
    }
  } catch {
    // Table may not exist yet prior to Phase 2 SQL migration execution
  }

  // 2. Check in-memory active grant store
  const memGrant = getImpersonationGrantFromMemory(sessionId);
  if (memGrant && memGrant.superAdminId === callerId) {
    return memGrant;
  }

  return null;
}

export interface TenantDalOptions {
  requiredPermission?: TenantPermission;
  requireAdmin?: boolean;
  requireStockManager?: boolean;
  requestedBusinessId?: string | null;
}

export interface TenantDalSuccess {
  ok: true;
  identity: UserIdentity;
  businessId: string;
  membership: TenantMembership;
  isImpersonating: boolean;
  impersonationGrant: SupportImpersonationGrant | null;
  hostnameResolution: HostnameResolutionResult;
  /**
   * User-scoped Supabase client bound to the caller's JWT (`authenticated` role).
   * Enforces PostgreSQL Row Level Security (RLS) on every query.
   */
  supa: SupabaseClient;
}

export interface TenantDalFailure {
  ok: false;
  errorResponse: NextResponse;
}

/**
 * Authoritative Server DAL entrypoint for all tenant-scoped API operations.
 * Uses the caller's authenticated Supabase session + RLS (never service-role for normal tenant CRUD).
 */
export async function requireTenantContext(
  request: Request,
  options: TenantDalOptions = {}
): Promise<TenantDalSuccess | TenantDalFailure> {
  const token = extractAccessTokenFromRequest(request);
  if (!token) {
    return {
      ok: false,
      errorResponse: NextResponse.json(
        { error: "Authentication required. Missing token.", code: "UNAUTHENTICATED" },
        { status: 401 }
      ),
    };
  }

  const adminSupa = supabaseAdmin();
  const { data: authData, error: authErr } = await adminSupa.auth.getUser(token);
  if (authErr || !authData?.user) {
    return {
      ok: false,
      errorResponse: NextResponse.json(
        {
          error: "Invalid or expired session. Please sign in again.",
          code: "INVALID_SESSION",
        },
        { status: 401 }
      ),
    };
  }

  const jwtPayload = parseJwtPayload(token);
  const aal: AuthenticatorAssuranceLevel =
    jwtPayload?.aal === "aal2" ? "aal2" : "aal1";

  const identity: UserIdentity = {
    userId: authData.user.id,
    email: authData.user.email || "",
    aal,
  };

  // Fetch authoritative user profile record
  const { data: profile, error: profErr } = await adminSupa
    .from("profiles")
    .select("id, email, is_admin, is_stock_manager, is_super_admin, business_id")
    .eq("id", identity.userId)
    .maybeSingle();

  if (profErr || !profile) {
    return {
      ok: false,
      errorResponse: NextResponse.json(
        { error: "User profile not found.", code: "PROFILE_NOT_FOUND" },
        { status: 403 }
      ),
    };
  }

  // Resolve canonical hostname & business (if request arrived on <tenant-slug>.countercub.com)
  const { hostnameResolution, hostnameBusiness } =
    await resolveBusinessByHostname(request);

  if (
    !hostnameResolution.valid &&
    hostnameResolution.errorCode !== "EMPTY_HOSTNAME"
  ) {
    return {
      ok: false,
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

  // If caller is Super Admin, check for an explicit, audited support impersonation session
  const impersonationGrant = profile.is_super_admin
    ? await resolveImpersonationGrantFromRequest(request, identity.userId)
    : null;

  const authz = authorizeTenantContext({
    identity,
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
      ok: false,
      errorResponse: NextResponse.json(
        {
          error: authz.errorMessage || "Forbidden",
          code: authz.errorCode || "FORBIDDEN",
        },
        { status: authz.status }
      ),
    };
  }

  // Create user-scoped Supabase client enforcing PostgreSQL RLS
  const userScopedSupa = createUserScopedServerClient(token, {
    impersonationSessionId: authz.impersonationGrant?.sessionId || null,
  });

  return {
    ok: true,
    identity,
    businessId: authz.businessId,
    membership: authz.membership,
    isImpersonating: Boolean(authz.isImpersonating),
    impersonationGrant: authz.impersonationGrant || null,
    hostnameResolution,
    supa: userScopedSupa,
  };
}

/**
 * Projects a database record into a strict DTO containing only explicitly allowed fields.
 */
export function projectDto<T extends Record<string, any>, K extends keyof T>(
  record: T,
  allowedKeys: readonly K[]
): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const key of allowedKeys) {
    if (key in record) {
      out[key] = record[key];
    }
  }
  return out;
}

export { MAX_IMPERSONATION_TTL_MS, MIN_IMPERSONATION_REASON_LENGTH };

