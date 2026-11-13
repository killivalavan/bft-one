/**
 * CounterCub — Centralized Canonical Hostname Parser & Tenant Resolver
 *
 * Implements Section 3 (Tenant Identity and Hostname Architecture):
 * - Canonical domains:
 *   1. `countercub.com` — public marketing website
 *   2. `www.countercub.com` — canonical public website alias
 *   3. `app.countercub.com` (and `www.app.countercub.com` -> redirect) — platform administration
 *   4. `<tenant-slug>.countercub.com` — customer workspace
 * - Validates the complete hostname against approved domains
 * - Normalizes case and trailing dots
 * - Rejects unexpected domains, malformed hostnames, and unexpected ports
 * - Never trusts arbitrary Host, X-Forwarded-Host, X-Tenant-Slug, cookies, or query parameters
 * - Strips externally supplied internal tenant headers at the trusted boundary
 * - Treats hostname resolution strictly as tenant identification, NEVER authorization
 */

import { validateTenantSlug, type SlugValidationErrorCode } from "../utils/slugValidator.ts";

export const CANONICAL_ROOT_DOMAIN = "countercub.com";
export const LEGACY_REDIRECT_DOMAINS: ReadonlySet<string> = new Set([
  "seyalpro.com",
  "seyalpro.in",
]);

export const INTERNAL_TENANT_HEADERS = [
  "x-tenant-slug",
  "x-verified-tenant-slug",
  "x-verified-host-kind",
  "x-verified-canonical-host",
  "x-tenant-id",
  "x-tenant-context",
] as const;

export type HostKind =
  | "marketing"
  | "platform_admin"
  | "tenant_workspace"
  | "invalid_subdomain"
  | "untrusted_host"
  | "malformed_host";

export type HostResolutionErrorCode =
  | "EMPTY_HOSTNAME"
  | "MALFORMED_HOSTNAME"
  | "UNEXPECTED_PORT"
  | "UNTRUSTED_DOMAIN"
  | "MULTI_LEVEL_SUBDOMAIN_FORBIDDEN"
  | "RESERVED_SUBDOMAIN"
  | "INVALID_TENANT_SLUG";

export interface HostnameResolutionOptions {
  /**
   * Allow `localhost` / `*.localhost` with development ports (e.g., 3000).
   * Defaults to `process.env.NODE_ENV !== "production"`.
   */
  allowLocalhost?: boolean;
  /**
   * Optional additional approved root domain for staging/preview if explicitly configured.
   */
  additionalApprovedRootDomains?: string[];
}

export interface HostnameResolutionResult {
  valid: boolean;
  kind: HostKind;
  rawInput: string;
  normalizedHost: string;
  canonicalHost: string | null;
  tenantSlug: string | null;
  isCanonicalRedirectRequired: boolean;
  redirectTargetHost: string | null;
  isLocalhost: boolean;
  errorCode?: HostResolutionErrorCode;
  slugErrorCode?: SlugValidationErrorCode;
  errorMessage?: string;
}

const ALLOWED_PRODUCTION_PORTS = new Set(["", "80", "443"]);
const ALLOWED_DEV_PORTS = new Set(["", "80", "443", "3000", "3001", "4000", "5173", "8080"]);

/**
 * Valid DNS hostname characters check (after port removal and trailing dot normalization).
 */
const HOSTNAME_CHARS_REGEX = /^[a-z0-9.-]+$/;

/**
 * Parses and validates a raw hostname string against CounterCub's canonical domain architecture.
 */
export function resolveCanonicalHostname(
  rawHostInput: unknown,
  options?: HostnameResolutionOptions
): HostnameResolutionResult {
  const allowLocalhost =
    options?.allowLocalhost ?? process.env.NODE_ENV !== "production";

  if (typeof rawHostInput !== "string" || !rawHostInput.trim()) {
    return {
      valid: false,
      kind: "malformed_host",
      rawInput: String(rawHostInput ?? ""),
      normalizedHost: "",
      canonicalHost: null,
      tenantSlug: null,
      isCanonicalRedirectRequired: false,
      redirectTargetHost: null,
      isLocalhost: false,
      errorCode: "EMPTY_HOSTNAME",
      errorMessage: "Hostname is required.",
    };
  }

  const trimmed = rawHostInput.trim();

  // Reject multiple comma-separated hosts, whitespace, slashes, @ signs, or control characters
  if (
    trimmed.includes(",") ||
    /[\s/@\\?#]/.test(trimmed) ||
    // eslint-disable-next-line no-control-regex
    /[\x00-\x1f\x7f]/.test(trimmed) ||
    trimmed.startsWith("[") // IPv6 literal not allowed as canonical host
  ) {
    return {
      valid: false,
      kind: "malformed_host",
      rawInput: rawHostInput,
      normalizedHost: "",
      canonicalHost: null,
      tenantSlug: null,
      isCanonicalRedirectRequired: false,
      redirectTargetHost: null,
      isLocalhost: false,
      errorCode: "MALFORMED_HOSTNAME",
      errorMessage: "Malformed hostname header.",
    };
  }

  // Separate host and optional port
  const colonParts = trimmed.split(":");
  if (colonParts.length > 2) {
    return {
      valid: false,
      kind: "malformed_host",
      rawInput: rawHostInput,
      normalizedHost: "",
      canonicalHost: null,
      tenantSlug: null,
      isCanonicalRedirectRequired: false,
      redirectTargetHost: null,
      isLocalhost: false,
      errorCode: "MALFORMED_HOSTNAME",
      errorMessage: "Invalid port separator in hostname.",
    };
  }

  const hostPartRaw = colonParts[0];
  const portPart = colonParts.length === 2 ? colonParts[1] : "";

  if (colonParts.length === 2 && (!/^\d{1,5}$/.test(portPart) || Number(portPart) > 65535 || Number(portPart) < 1)) {
    return {
      valid: false,
      kind: "malformed_host",
      rawInput: rawHostInput,
      normalizedHost: "",
      canonicalHost: null,
      tenantSlug: null,
      isCanonicalRedirectRequired: false,
      redirectTargetHost: null,
      isLocalhost: false,
      errorCode: "UNEXPECTED_PORT",
      errorMessage: "Malformed port number.",
    };
  }

  // Normalize case and strip a single trailing DNS root dot (e.g. "countercub.com." -> "countercub.com")
  let normalizedHost = hostPartRaw.toLowerCase();
  if (normalizedHost.endsWith(".")) {
    normalizedHost = normalizedHost.slice(0, -1);
  }

  // Reject remaining trailing dots, leading dots, consecutive dots, or invalid characters
  if (
    !normalizedHost ||
    normalizedHost.length > 253 ||
    normalizedHost.startsWith(".") ||
    normalizedHost.endsWith(".") ||
    normalizedHost.includes("..") ||
    !HOSTNAME_CHARS_REGEX.test(normalizedHost)
  ) {
    return {
      valid: false,
      kind: "malformed_host",
      rawInput: rawHostInput,
      normalizedHost,
      canonicalHost: null,
      tenantSlug: null,
      isCanonicalRedirectRequired: false,
      redirectTargetHost: null,
      isLocalhost: false,
      errorCode: "MALFORMED_HOSTNAME",
      errorMessage: "Hostname contains invalid DNS characters or structure.",
    };
  }

  // Check localhost / local development domains
  const isLocalhostDomain =
    normalizedHost === "localhost" ||
    normalizedHost === "127.0.0.1" ||
    normalizedHost.endsWith(".localhost");

  if (isLocalhostDomain) {
    if (!allowLocalhost) {
      return {
        valid: false,
        kind: "untrusted_host",
        rawInput: rawHostInput,
        normalizedHost,
        canonicalHost: null,
        tenantSlug: null,
        isCanonicalRedirectRequired: false,
        redirectTargetHost: null,
        isLocalhost: true,
        errorCode: "UNTRUSTED_DOMAIN",
        errorMessage: "Localhost hostnames are rejected in production.",
      };
    }

    if (!ALLOWED_DEV_PORTS.has(portPart)) {
      return {
        valid: false,
        kind: "malformed_host",
        rawInput: rawHostInput,
        normalizedHost,
        canonicalHost: null,
        tenantSlug: null,
        isCanonicalRedirectRequired: false,
        redirectTargetHost: null,
        isLocalhost: true,
        errorCode: "UNEXPECTED_PORT",
        errorMessage: `Unexpected port '${portPart}' on localhost.`,
      };
    }

    const hostWithPort = portPart && portPart !== "80" && portPart !== "443"
      ? `${normalizedHost}:${portPart}`
      : normalizedHost;

    if (normalizedHost === "localhost" || normalizedHost === "127.0.0.1") {
      return {
        valid: true,
        kind: "marketing",
        rawInput: rawHostInput,
        normalizedHost,
        canonicalHost: hostWithPort,
        tenantSlug: null,
        isCanonicalRedirectRequired: false,
        redirectTargetHost: null,
        isLocalhost: true,
      };
    }

    // Subdomain on .localhost (e.g., app.localhost or <tenant-slug>.localhost)
    const localPrefix = normalizedHost.slice(0, -".localhost".length);
    if (localPrefix === "www") {
      const target = portPart ? `localhost:${portPart}` : "localhost";
      return {
        valid: true,
        kind: "marketing",
        rawInput: rawHostInput,
        normalizedHost,
        canonicalHost: target,
        tenantSlug: null,
        isCanonicalRedirectRequired: true,
        redirectTargetHost: target,
        isLocalhost: true,
      };
    }

    if (localPrefix === "app" || localPrefix === "www.app") {
      const target = portPart ? `app.localhost:${portPart}` : "app.localhost";
      return {
        valid: true,
        kind: "platform_admin",
        rawInput: rawHostInput,
        normalizedHost,
        canonicalHost: target,
        tenantSlug: null,
        isCanonicalRedirectRequired: localPrefix === "www.app",
        redirectTargetHost: localPrefix === "www.app" ? target : null,
        isLocalhost: true,
      };
    }

    if (localPrefix.includes(".")) {
      return {
        valid: false,
        kind: "invalid_subdomain",
        rawInput: rawHostInput,
        normalizedHost,
        canonicalHost: null,
        tenantSlug: null,
        isCanonicalRedirectRequired: false,
        redirectTargetHost: null,
        isLocalhost: true,
        errorCode: "MULTI_LEVEL_SUBDOMAIN_FORBIDDEN",
        errorMessage: "Multi-level tenant subdomains are not permitted.",
      };
    }

    const slugCheck = validateTenantSlug(localPrefix);
    if (!slugCheck.valid) {
      return {
        valid: false,
        kind: "invalid_subdomain",
        rawInput: rawHostInput,
        normalizedHost,
        canonicalHost: null,
        tenantSlug: null,
        isCanonicalRedirectRequired: false,
        redirectTargetHost: null,
        isLocalhost: true,
        errorCode:
          slugCheck.code === "SLUG_RESERVED"
            ? "RESERVED_SUBDOMAIN"
            : "INVALID_TENANT_SLUG",
        slugErrorCode: slugCheck.code,
        errorMessage: slugCheck.error,
      };
    }

    return {
      valid: true,
      kind: "tenant_workspace",
      rawInput: rawHostInput,
      normalizedHost,
      canonicalHost: hostWithPort,
      tenantSlug: slugCheck.normalizedSlug,
      isCanonicalRedirectRequired: false,
      redirectTargetHost: null,
      isLocalhost: true,
    };
  }

  // Production port check: only empty port, 80, or 443 are permitted
  if (!ALLOWED_PRODUCTION_PORTS.has(portPart)) {
    return {
      valid: false,
      kind: "malformed_host",
      rawInput: rawHostInput,
      normalizedHost,
      canonicalHost: null,
      tenantSlug: null,
      isCanonicalRedirectRequired: false,
      redirectTargetHost: null,
      isLocalhost: false,
      errorCode: "UNEXPECTED_PORT",
      errorMessage: `Unexpected port '${portPart}' on production hostname.`,
    };
  }

  // Approved root domains check
  const approvedRoots = new Set<string>([
    CANONICAL_ROOT_DOMAIN,
    ...(options?.additionalApprovedRootDomains || []).map((d) =>
      d.toLowerCase().trim()
    ),
  ]);

  let matchedRoot: string | null = null;
  let isLegacyDomain = false;

  for (const root of approvedRoots) {
    if (normalizedHost === root || normalizedHost.endsWith(`.${root}`)) {
      matchedRoot = root;
      break;
    }
  }

  if (!matchedRoot) {
    for (const legacyRoot of LEGACY_REDIRECT_DOMAINS) {
      if (normalizedHost === legacyRoot || normalizedHost.endsWith(`.${legacyRoot}`)) {
        matchedRoot = legacyRoot;
        isLegacyDomain = true;
        break;
      }
    }
  }

  if (!matchedRoot) {
    return {
      valid: false,
      kind: "untrusted_host",
      rawInput: rawHostInput,
      normalizedHost,
      canonicalHost: null,
      tenantSlug: null,
      isCanonicalRedirectRequired: false,
      redirectTargetHost: null,
      isLocalhost: false,
      errorCode: "UNTRUSTED_DOMAIN",
      errorMessage: `Hostname '${normalizedHost}' does not belong to an approved CounterCub domain.`,
    };
  }

  // Case 1: Exact root domain (e.g. `countercub.com`)
  if (normalizedHost === matchedRoot) {
    const canonicalHost = CANONICAL_ROOT_DOMAIN;
    return {
      valid: true,
      kind: "marketing",
      rawInput: rawHostInput,
      normalizedHost,
      canonicalHost,
      tenantSlug: null,
      isCanonicalRedirectRequired: isLegacyDomain,
      redirectTargetHost: isLegacyDomain ? canonicalHost : null,
      isLocalhost: false,
    };
  }

  // Extract subdomain prefix before `.${matchedRoot}`
  const subPrefix = normalizedHost.slice(0, -(matchedRoot.length + 1));

  // Case 2: `www.countercub.com` — canonical public website alias
  if (subPrefix === "www") {
    const canonicalHost = `www.${CANONICAL_ROOT_DOMAIN}`;
    return {
      valid: true,
      kind: "marketing",
      rawInput: rawHostInput,
      normalizedHost,
      canonicalHost: CANONICAL_ROOT_DOMAIN,
      tenantSlug: null,
      isCanonicalRedirectRequired: isLegacyDomain,
      redirectTargetHost: isLegacyDomain ? CANONICAL_ROOT_DOMAIN : null,
      isLocalhost: false,
    };
  }

  // Case 3: `app.countercub.com` or `www.app.countercub.com` — platform administration
  if (subPrefix === "app" || subPrefix === "www.app") {
    const canonicalAdminHost = `app.${CANONICAL_ROOT_DOMAIN}`;
    const needsRedirect = subPrefix === "www.app" || isLegacyDomain;
    return {
      valid: true,
      kind: "platform_admin",
      rawInput: rawHostInput,
      normalizedHost,
      canonicalHost: canonicalAdminHost,
      tenantSlug: null,
      isCanonicalRedirectRequired: needsRedirect,
      redirectTargetHost: needsRedirect ? canonicalAdminHost : null,
      isLocalhost: false,
    };
  }

  // Reject any other multi-label subdomain (e.g. `a.b.countercub.com`)
  if (subPrefix.includes(".")) {
    return {
      valid: false,
      kind: "invalid_subdomain",
      rawInput: rawHostInput,
      normalizedHost,
      canonicalHost: null,
      tenantSlug: null,
      isCanonicalRedirectRequired: false,
      redirectTargetHost: null,
      isLocalhost: false,
      errorCode: "MULTI_LEVEL_SUBDOMAIN_FORBIDDEN",
      errorMessage: "Multi-level subdomains are not allowed.",
    };
  }

  // Case 4: `<tenant-slug>.countercub.com` — validate tenant slug
  const slugValidation = validateTenantSlug(subPrefix);
  if (!slugValidation.valid) {
    return {
      valid: false,
      kind: "invalid_subdomain",
      rawInput: rawHostInput,
      normalizedHost,
      canonicalHost: null,
      tenantSlug: null,
      isCanonicalRedirectRequired: false,
      redirectTargetHost: null,
      isLocalhost: false,
      errorCode:
        slugValidation.code === "SLUG_RESERVED"
          ? "RESERVED_SUBDOMAIN"
          : "INVALID_TENANT_SLUG",
      slugErrorCode: slugValidation.code,
      errorMessage: slugValidation.error,
    };
  }

  const canonicalTenantHost = `${slugValidation.normalizedSlug}.${CANONICAL_ROOT_DOMAIN}`;
  return {
    valid: true,
    kind: "tenant_workspace",
    rawInput: rawHostInput,
    normalizedHost,
    canonicalHost: canonicalTenantHost,
    tenantSlug: slugValidation.normalizedSlug,
    isCanonicalRedirectRequired: isLegacyDomain,
    redirectTargetHost: isLegacyDomain ? canonicalTenantHost : null,
    isLocalhost: false,
  };
}

/**
 * Resolves the canonical hostname from a Next.js Request / Headers object.
 * Never trusts an unvalidated `X-Forwarded-Host` header over `Host`.
 * If `X-Forwarded-Host` is present (e.g. behind Vercel's edge proxy), it is only
 * accepted if it passes strict canonical domain validation; otherwise `Host` is used.
 */
export function resolveRequestHostname(
  requestOrHeaders: { headers: Headers } | Headers,
  options?: HostnameResolutionOptions
): HostnameResolutionResult {
  const headers =
    requestOrHeaders instanceof Headers
      ? requestOrHeaders
      : requestOrHeaders.headers;

  const hostHeader = headers.get("host") || "";
  const forwardedHost = headers.get("x-forwarded-host") || "";

  // First evaluate the standard Host header
  const primaryResult = resolveCanonicalHostname(hostHeader, options);

  // Only consider x-forwarded-host if it resolves to a valid canonical domain
  if (forwardedHost) {
    const forwardedResult = resolveCanonicalHostname(forwardedHost, options);
    if (forwardedResult.valid && !forwardedResult.isLocalhost) {
      return forwardedResult;
    }
    // If x-forwarded-host is explicitly set to a malformed/untrusted value while Host is empty, fail closed
    if (!hostHeader) {
      return forwardedResult;
    }
  }

  return primaryResult;
}

/**
 * Strips all client-supplied internal tenant headers at the trusted middleware boundary
 * and injects only server-verified hostname resolution headers for downstream handlers.
 */
export function sanitizeAndSetVerifiedTenantHeaders(
  incomingHeaders: Headers,
  resolution: HostnameResolutionResult
): Headers {
  const sanitized = new Headers(incomingHeaders);

  // 1. Unconditionally strip any client-supplied internal tenant headers
  for (const headerName of INTERNAL_TENANT_HEADERS) {
    sanitized.delete(headerName);
  }

  // 2. Inject only server-verified context when hostname resolution succeeded
  if (resolution.valid) {
    sanitized.set("x-verified-host-kind", resolution.kind);
    if (resolution.canonicalHost) {
      sanitized.set("x-verified-canonical-host", resolution.canonicalHost);
    }
    if (resolution.kind === "tenant_workspace" && resolution.tenantSlug) {
      sanitized.set("x-verified-tenant-slug", resolution.tenantSlug);
      sanitized.set("x-tenant-slug", resolution.tenantSlug);
    }
  }

  return sanitized;
}
