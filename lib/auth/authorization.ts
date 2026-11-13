/**
 * CounterCub — Centralized Identity & Authorization Architecture
 *
 * Implements Section 4 (Identity and Authorization Architecture):
 * Strictly separates:
 * 1. User identity (Supabase Auth JWT + AAL level)
 * 2. Tenant membership (`profiles.business_id` + account status)
 * 3. Tenant roles (`tenant_admin`, `stock_manager`, `staff`)
 * 4. Tenant permissions (fine-grained capability matrix)
 * 5. Platform administrator privileges (`is_super_admin`, valid only for platform routes)
 * 6. Temporary support/impersonation privileges (short-lived, audited, reason-bound grants)
 *
 * Non-negotiable rule:
 * A generic `is_super_admin` flag NEVER silently authorizes cross-tenant operations
 * through ordinary tenant APIs without an active, non-expired SupportImpersonationGrant.
 */

import type { HostnameResolutionResult } from "../tenant/hostnameResolver.ts";

export const MAX_IMPERSONATION_TTL_MS = 30 * 60 * 1000; // 30 minutes maximum
export const MIN_IMPERSONATION_REASON_LENGTH = 10;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_REGEX.test(value.trim());
}

export type AuthenticatorAssuranceLevel = "aal1" | "aal2";

export interface UserIdentity {
  userId: string;
  email: string;
  aal: AuthenticatorAssuranceLevel;
}

export type TenantRole = "tenant_admin" | "stock_manager" | "staff";

export type TenantPermission =
  | "pos:operate"
  | "orders:read"
  | "orders:write"
  | "orders:cancel"
  | "inventory:read"
  | "inventory:write"
  | "expenses:read"
  | "expenses:write"
  | "employees:read"
  | "employees:manage"
  | "b2b:read"
  | "b2b:write"
  | "invoices:read"
  | "invoices:write"
  | "imports:manage"
  | "settings:manage"
  | "audit:read"
  | "support:create"
  | "notifications:read"
  | "notifications:write";

export type PlatformPermission =
  | "platform:businesses:read"
  | "platform:businesses:write"
  | "platform:businesses:delete"
  | "platform:impersonate"
  | "platform:audit:read"
  | "platform:support:manage";

export interface TenantMembership {
  businessId: string;
  role: TenantRole;
  permissions: ReadonlySet<TenantPermission>;
  isTenantAdmin: boolean;
  isStockManager: boolean;
  accountStatus: "active" | "suspended" | "disabled";
}

export interface PlatformAdminPrivilege {
  isPlatformSuperAdmin: boolean;
  permissions: ReadonlySet<PlatformPermission>;
}

export interface SupportImpersonationGrant {
  sessionId: string;
  superAdminId: string;
  superAdminEmail: string;
  targetBusinessId: string;
  targetBusinessSlug?: string | null;
  reason: string;
  mfaVerified: boolean;
  createdAt: string;
  expiresAt: string;
  revokedAt?: string | null;
}

const STAFF_PERMISSIONS: ReadonlySet<TenantPermission> = new Set([
  "pos:operate",
  "orders:read",
  "orders:write",
  "inventory:read",
  "expenses:read",
  "expenses:write",
  "employees:read",
  "b2b:read",
  "b2b:write",
  "invoices:read",
  "invoices:write",
  "support:create",
  "notifications:read",
  "notifications:write",
]);

const STOCK_MANAGER_PERMISSIONS: ReadonlySet<TenantPermission> = new Set([
  ...STAFF_PERMISSIONS,
  "inventory:write",
]);

const TENANT_ADMIN_PERMISSIONS: ReadonlySet<TenantPermission> = new Set([
  ...STOCK_MANAGER_PERMISSIONS,
  "orders:cancel",
  "employees:manage",
  "imports:manage",
  "settings:manage",
  "audit:read",
]);

const PLATFORM_SUPER_ADMIN_PERMISSIONS: ReadonlySet<PlatformPermission> =
  new Set([
    "platform:businesses:read",
    "platform:businesses:write",
    "platform:businesses:delete",
    "platform:impersonate",
    "platform:audit:read",
    "platform:support:manage",
  ]);

export function deriveTenantRole(profile: {
  is_admin?: boolean | null;
  is_stock_manager?: boolean | null;
}): TenantRole {
  if (profile.is_admin) return "tenant_admin";
  if (profile.is_stock_manager) return "stock_manager";
  return "staff";
}

export function getPermissionsForRole(
  role: TenantRole
): ReadonlySet<TenantPermission> {
  switch (role) {
    case "tenant_admin":
      return TENANT_ADMIN_PERMISSIONS;
    case "stock_manager":
      return STOCK_MANAGER_PERMISSIONS;
    case "staff":
    default:
      return STAFF_PERMISSIONS;
  }
}

export function hasTenantPermission(
  membership: TenantMembership | null | undefined,
  permission: TenantPermission
): boolean {
  if (!membership || membership.accountStatus !== "active") return false;
  return membership.permissions.has(permission);
}

export function derivePlatformPrivilege(profile: {
  is_super_admin?: boolean | null;
}): PlatformAdminPrivilege {
  // Strictly derived from verified database column `is_super_admin`, never from hardcoded emails.
  const isSuper = Boolean(profile.is_super_admin);
  return {
    isPlatformSuperAdmin: isSuper,
    permissions: isSuper ? PLATFORM_SUPER_ADMIN_PERMISSIONS : new Set(),
  };
}

export interface ImpersonationValidationResult {
  valid: boolean;
  errorCode?:
    | "NOT_SUPER_ADMIN"
    | "MISSING_GRANT"
    | "IDENTITY_MISMATCH"
    | "INVALID_TARGET_TENANT"
    | "REASON_TOO_SHORT"
    | "MFA_REQUIRED"
    | "GRANT_REVOKED"
    | "GRANT_EXPIRED"
    | "TTL_EXCEEDED"
    | "TARGET_MISMATCH";
  errorMessage?: string;
}

/**
 * Validates that a temporary support/impersonation grant satisfies all Section 4 security invariants.
 */
export function validateImpersonationGrant(
  grant: SupportImpersonationGrant | null | undefined,
  callerIdentity: UserIdentity,
  isPlatformSuperAdmin: boolean,
  expectedTargetBusinessId?: string | null,
  requireMfaStepUp = false
): ImpersonationValidationResult {
  if (!isPlatformSuperAdmin) {
    return {
      valid: false,
      errorCode: "NOT_SUPER_ADMIN",
      errorMessage: "Only authorized Platform Super Admins may use support impersonation.",
    };
  }

  if (!grant) {
    return {
      valid: false,
      errorCode: "MISSING_GRANT",
      errorMessage:
        "Cross-tenant support access requires an active, audited impersonation session.",
    };
  }

  if (grant.superAdminId !== callerIdentity.userId) {
    return {
      valid: false,
      errorCode: "IDENTITY_MISMATCH",
      errorMessage: "Impersonation grant does not belong to the current administrator.",
    };
  }

  if (!isValidUuid(grant.targetBusinessId)) {
    return {
      valid: false,
      errorCode: "INVALID_TARGET_TENANT",
      errorMessage: "Impersonation grant has an invalid target business ID.",
    };
  }

  if (
    typeof grant.reason !== "string" ||
    grant.reason.trim().length < MIN_IMPERSONATION_REASON_LENGTH
  ) {
    return {
      valid: false,
      errorCode: "REASON_TOO_SHORT",
      errorMessage: `Impersonation grant requires an audit reason of at least ${MIN_IMPERSONATION_REASON_LENGTH} characters.`,
    };
  }

  if (requireMfaStepUp && !grant.mfaVerified && callerIdentity.aal !== "aal2") {
    return {
      valid: false,
      errorCode: "MFA_REQUIRED",
      errorMessage:
        "MFA / step-up authentication is required before initiating cross-tenant support access.",
    };
  }

  if (grant.revokedAt) {
    return {
      valid: false,
      errorCode: "GRANT_REVOKED",
      errorMessage: "Impersonation session has been revoked.",
    };
  }

  const createdMs = Date.parse(grant.createdAt);
  const expiresMs = Date.parse(grant.expiresAt);
  const nowMs = Date.now();

  if (Number.isNaN(createdMs) || Number.isNaN(expiresMs) || expiresMs <= nowMs) {
    return {
      valid: false,
      errorCode: "GRANT_EXPIRED",
      errorMessage: "Impersonation session has expired.",
    };
  }

  if (expiresMs - createdMs > MAX_IMPERSONATION_TTL_MS + 5000) {
    return {
      valid: false,
      errorCode: "TTL_EXCEEDED",
      errorMessage: "Impersonation grant exceeds maximum allowed duration (30 minutes).",
    };
  }

  if (
    expectedTargetBusinessId &&
    grant.targetBusinessId !== expectedTargetBusinessId
  ) {
    return {
      valid: false,
      errorCode: "TARGET_MISMATCH",
      errorMessage:
        "Impersonation grant target business does not match the requested tenant workspace.",
    };
  }

  return { valid: true };
}

export interface ProfileRecord {
  id: string;
  email?: string | null;
  business_id: string | null;
  is_admin?: boolean | null;
  is_stock_manager?: boolean | null;
  is_super_admin?: boolean | null;
  status?: string | null;
}

export interface ResolvedBusinessInfo {
  id: string;
  slug: string;
  name?: string;
  status?: string | null;
}

export interface AuthorizeTenantContextParams {
  identity: UserIdentity;
  profile: ProfileRecord;
  hostnameResolution?: HostnameResolutionResult | null;
  hostnameBusiness?: ResolvedBusinessInfo | null;
  requestedBusinessId?: string | null;
  impersonationGrant?: SupportImpersonationGrant | null;
  requiredPermission?: TenantPermission;
  requireAdmin?: boolean;
  requireStockManager?: boolean;
}

export type AuthorizationFailureCode =
  | "ACCOUNT_SUSPENDED"
  | "TENANT_NOT_FOUND"
  | "TENANT_SUSPENDED"
  | "UNASSIGNED_TENANT"
  | "TENANT_HOSTNAME_MISMATCH"
  | "CROSS_TENANT_ACCESS_DENIED"
  | "IMPERSONATION_GRANT_REQUIRED"
  | "INSUFFICIENT_ROLE"
  | "INSUFFICIENT_PERMISSION";

export interface AuthorizedTenantContextResult {
  authorized: boolean;
  status: number;
  errorCode?: AuthorizationFailureCode;
  errorMessage?: string;
  identity?: UserIdentity;
  businessId?: string;
  membership?: TenantMembership;
  platformPrivilege?: PlatformAdminPrivilege;
  isImpersonating?: boolean;
  impersonationGrant?: SupportImpersonationGrant | null;
}

/**
 * Evaluates user identity, tenant membership, canonical hostname context, role permissions,
 * and explicit support impersonation grants to produce a verified tenant authorization context.
 */
export function authorizeTenantContext(
  params: AuthorizeTenantContextParams
): AuthorizedTenantContextResult {
  const {
    identity,
    profile,
    hostnameResolution,
    hostnameBusiness,
    requestedBusinessId,
    impersonationGrant,
    requiredPermission,
    requireAdmin,
    requireStockManager,
  } = params;

  // 1. Account suspension / revocation check
  const rawAccountStatus = (profile.status || "active").toLowerCase();
  if (rawAccountStatus === "suspended" || rawAccountStatus === "disabled" || rawAccountStatus === "revoked") {
    return {
      authorized: false,
      status: 403,
      errorCode: "ACCOUNT_SUSPENDED",
      errorMessage: "Forbidden: Your user account is suspended or disabled.",
    };
  }

  // 2. Hostname workspace existence & status check (if request arrived on <slug>.countercub.com)
  if (hostnameResolution?.kind === "tenant_workspace") {
    if (!hostnameBusiness || !isValidUuid(hostnameBusiness.id)) {
      return {
        authorized: false,
        status: 404,
        errorCode: "TENANT_NOT_FOUND",
        errorMessage: `Workspace '${hostnameResolution.tenantSlug}' does not exist.`,
      };
    }

    const bizStatus = (hostnameBusiness.status || "active").toLowerCase();
    if (bizStatus === "suspended" || bizStatus === "archived" || bizStatus === "disabled") {
      return {
        authorized: false,
        status: 403,
        errorCode: "TENANT_SUSPENDED",
        errorMessage: "Forbidden: This business workspace is currently suspended.",
      };
    }
  }

  const platformPrivilege = derivePlatformPrivilege(profile);
  const profileBusinessId = isValidUuid(profile.business_id)
    ? profile.business_id.trim()
    : null;
  const cleanRequestedBizId =
    requestedBusinessId && isValidUuid(requestedBusinessId)
      ? requestedBusinessId.trim()
      : null;

  let resolvedBusinessId: string | null = null;
  let isImpersonating = false;

  // 3. Determine whether access is via normal tenant membership or audited support impersonation
  const targetCrossTenantId =
    hostnameBusiness?.id || cleanRequestedBizId || null;

  const isAccessingOtherTenant =
    targetCrossTenantId !== null && targetCrossTenantId !== profileBusinessId;

  if (isAccessingOtherTenant || (!profileBusinessId && platformPrivilege.isPlatformSuperAdmin)) {
    // Normal users can NEVER access another tenant
    if (!platformPrivilege.isPlatformSuperAdmin) {
      return {
        authorized: false,
        status: 403,
        errorCode:
          hostnameBusiness && hostnameBusiness.id !== profileBusinessId
            ? "TENANT_HOSTNAME_MISMATCH"
            : "CROSS_TENANT_ACCESS_DENIED",
        errorMessage:
          "Forbidden: Cross-tenant access denied. You do not belong to this workspace.",
      };
    }

    // Super Admins on ordinary tenant APIs MUST have a valid, non-expired SupportImpersonationGrant
    const grantCheck = validateImpersonationGrant(
      impersonationGrant,
      identity,
      platformPrivilege.isPlatformSuperAdmin,
      targetCrossTenantId
    );

    if (!grantCheck.valid || !impersonationGrant) {
      return {
        authorized: false,
        status: 403,
        errorCode: "IMPERSONATION_GRANT_REQUIRED",
        errorMessage:
          grantCheck.errorMessage ||
          "Forbidden: Platform Super Admins must initiate an audited support impersonation session before accessing tenant data.",
      };
    }

    resolvedBusinessId = impersonationGrant.targetBusinessId;
    isImpersonating = true;
  } else {
    // Normal membership path
    if (!profileBusinessId) {
      return {
        authorized: false,
        status: 403,
        errorCode: "UNASSIGNED_TENANT",
        errorMessage: "Forbidden: User account has no assigned business workspace.",
      };
    }

    // Verify hostname business matches profile business if on a tenant subdomain
    if (hostnameBusiness && hostnameBusiness.id !== profileBusinessId) {
      return {
        authorized: false,
        status: 403,
        errorCode: "TENANT_HOSTNAME_MISMATCH",
        errorMessage:
          "Forbidden: Authenticated user does not belong to the workspace specified by the hostname.",
      };
    }

    // Verify any explicitly requested business_id matches profile business
    if (cleanRequestedBizId && cleanRequestedBizId !== profileBusinessId) {
      return {
        authorized: false,
        status: 403,
        errorCode: "CROSS_TENANT_ACCESS_DENIED",
        errorMessage:
          "Forbidden: Requested business_id does not match your assigned workspace.",
      };
    }

    resolvedBusinessId = profileBusinessId;
  }

  // 4. Construct TenantMembership & evaluate role/permissions
  const role: TenantRole = isImpersonating
    ? "tenant_admin"
    : deriveTenantRole(profile);
  const permissions = getPermissionsForRole(role);

  const membership: TenantMembership = {
    businessId: resolvedBusinessId,
    role,
    permissions,
    isTenantAdmin: role === "tenant_admin",
    isStockManager: role === "tenant_admin" || role === "stock_manager",
    accountStatus: "active",
  };

  if (requireAdmin && !membership.isTenantAdmin) {
    return {
      authorized: false,
      status: 403,
      errorCode: "INSUFFICIENT_ROLE",
      errorMessage: "Forbidden: Store Administrator privileges are required.",
    };
  }

  if (requireStockManager && !membership.isStockManager) {
    return {
      authorized: false,
      status: 403,
      errorCode: "INSUFFICIENT_ROLE",
      errorMessage:
        "Forbidden: Store Administrator or Stock Manager privileges are required.",
    };
  }

  if (requiredPermission && !hasTenantPermission(membership, requiredPermission)) {
    return {
      authorized: false,
      status: 403,
      errorCode: "INSUFFICIENT_PERMISSION",
      errorMessage: `Forbidden: Missing required permission '${requiredPermission}'.`,
    };
  }

  return {
    authorized: true,
    status: 200,
    identity,
    businessId: resolvedBusinessId,
    membership,
    platformPrivilege,
    isImpersonating,
    impersonationGrant: isImpersonating ? impersonationGrant : null,
  };
}
