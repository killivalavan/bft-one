/**
 * CounterCub — Zero-Trust Wildcard Domain & Canonical Hostname Routing Engine
 *
 * Implements Section 3 (Tenant Identity and Hostname Architecture) and Section 9 (Wildcard Domains):
 * - Canonical domains:
 *   1. `countercub.com` & `www.countercub.com` — public marketing website
 *   2. `app.countercub.com` (`www.app.countercub.com` -> 308 redirect) — platform administration
 *   3. `<tenant-slug>.countercub.com` — customer workspace (`*.countercub.com`)
 * - Strips all client-supplied internal tenant headers at the edge boundary
 * - Never reads `?tenant=` query parameters or `tenant_slug` cookies for tenant resolution
 * - Expires any stale `tenant_slug` cookie so root-domain or workspace requests never inherit stale context
 * - Rejects unknown/reserved subdomains (`/tenant-not-found` 404) and untrusted/malformed hosts (`400`)
 */

import {
  CANONICAL_ROOT_DOMAIN,
  resolveRequestHostname,
  sanitizeAndSetVerifiedTenantHeaders,
  type HostnameResolutionOptions,
  type HostnameResolutionResult,
} from "./hostnameResolver.ts";

export type WildcardRouteAction =
  | "next"
  | "redirect"
  | "rewrite"
  | "json_error";

export interface WildcardRouteInput {
  url: URL | string;
  headers: Headers;
  hasLegacyTenantCookie?: boolean;
  options?: HostnameResolutionOptions;
}

export interface WildcardRouteDecision {
  action: WildcardRouteAction;
  status: number;
  location?: string;
  rewritePathname?: string;
  jsonBody?: {
    error: string;
    code: string;
    kind?: string;
  };
  sanitizedRequestHeaders: Headers;
  responseHeaders: Record<string, string>;
  deleteLegacyTenantCookie: boolean;
  resolution: HostnameResolutionResult;
}

function getAdditionalApprovedRootDomains(): string[] {
  const raw = process.env.NEXT_PUBLIC_ADDITIONAL_ROOT_DOMAINS || "";
  if (!raw.trim()) return [];
  return raw
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}

function buildSecurityResponseHeaders(
  pathname: string,
  hostKind?: string,
  canonicalHost?: string | null,
  verifiedTenantSlug?: string | null
): Record<string, string> {
  const headers: Record<string, string> = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    Vary: "Host, Authorization, Cookie",
  };

  if (hostKind) {
    headers["x-verified-host-kind"] = hostKind;
  }
  if (canonicalHost) {
    headers["x-verified-canonical-host"] = canonicalHost;
  }
  if (verifiedTenantSlug) {
    headers["x-verified-tenant-slug"] = verifiedTenantSlug;
    headers["x-tenant-slug"] = verifiedTenantSlug;
  }

  if (pathname.startsWith("/api/")) {
    headers["Cache-Control"] =
      "private, no-store, no-cache, max-age=0, must-revalidate";
    headers["Pragma"] = "no-cache";
  }

  return headers;
}

/** Internal route that renders the public landing page (marketing host `/` is rewritten here). */
export const MARKETING_LANDING_PATH = "/site";

/** Static files, Next.js internals and the shared not-found page pass through on every host. */
function isStaticOrPublicPath(pathname: string): boolean {
  if (pathname.startsWith("/_next/")) return true;
  if (pathname === "/tenant-not-found") return true;
  const lastSegment = pathname.split("/").pop() || "";
  return /\.[a-z0-9]+$/i.test(lastSegment);
}

function isPathOrChild(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

/** Origin of the platform admin host for the current environment (dev keeps the port). */
function getPlatformAdminOrigin(
  resolution: HostnameResolutionResult,
  parsedUrl: URL
): string {
  if (resolution.isLocalhost) {
    const port = parsedUrl.port ? `:${parsedUrl.port}` : "";
    return `http://app.localhost${port}`;
  }
  return `https://app.${CANONICAL_ROOT_DOMAIN}`;
}

function hasCookieInHeader(headers: Headers, cookieName: string): boolean {
  const rawCookie = headers.get("cookie") || "";
  if (!rawCookie) return false;
  return rawCookie
    .split(";")
    .some((part) => part.trim().startsWith(`${cookieName}=`));
}

/**
 * Evaluates a request against CounterCub's zero-trust wildcard domain routing rules.
 */
export function evaluateWildcardTenantRoute(
  input: WildcardRouteInput
): WildcardRouteDecision {
  const parsedUrl =
    typeof input.url === "string"
      ? new URL(input.url)
      : new URL(input.url.toString());

  const deleteLegacyTenantCookie =
    Boolean(input.hasLegacyTenantCookie) ||
    hasCookieInHeader(input.headers, "tenant_slug");

  // 1. Resolve canonical hostname (strictly from validated Host / X-Forwarded-Host; never cookies or query params)
  const resolution = resolveRequestHostname(input.headers, {
    allowLocalhost: input.options?.allowLocalhost,
    additionalApprovedRootDomains:
      input.options?.additionalApprovedRootDomains ??
      getAdditionalApprovedRootDomains(),
  });

  // 2. Sanitize incoming request headers: strip all client-supplied internal tenant headers
  // and inject only server-verified tenant context.
  const sanitizedRequestHeaders = sanitizeAndSetVerifiedTenantHeaders(
    input.headers,
    resolution
  );

  // 0. Backwards compatibility redirect: /baker/* -> /b2b/*
  if (
    parsedUrl.pathname === "/baker" ||
    parsedUrl.pathname.startsWith("/baker/")
  ) {
    const redirectUrl = new URL(parsedUrl.toString());
    redirectUrl.pathname = parsedUrl.pathname.replace(/^\/baker/, "/b2b");
    redirectUrl.searchParams.delete("tenant");
    return {
      action: "redirect",
      status: 307,
      location: redirectUrl.toString(),
      sanitizedRequestHeaders,
      responseHeaders: buildSecurityResponseHeaders(
        parsedUrl.pathname,
        resolution.valid ? resolution.kind : undefined,
        resolution.canonicalHost,
        resolution.kind === "tenant_workspace" ? resolution.tenantSlug : null
      ),
      deleteLegacyTenantCookie,
      resolution,
    };
  }

  // 3. Reject invalid, untrusted, malformed, or reserved hostnames (fail closed)
  if (!resolution.valid) {
    if (parsedUrl.pathname.startsWith("/api/")) {
      const status = resolution.kind === "invalid_subdomain" ? 404 : 400;
      return {
        action: "json_error",
        status,
        jsonBody: {
          error:
            resolution.errorMessage ||
            "Request hostname is not an approved CounterCub domain.",
          code: resolution.errorCode || "INVALID_HOSTNAME",
          kind: resolution.kind,
        },
        sanitizedRequestHeaders,
        responseHeaders: buildSecurityResponseHeaders(
          parsedUrl.pathname,
          resolution.kind,
          null,
          null
        ),
        deleteLegacyTenantCookie,
        resolution,
      };
    }

    // Invalid or reserved subdomain (e.g. admin.countercub.com, api.countercub.com, a.b.countercub.com):
    // Rewrite page navigation to /tenant-not-found with 404 status so it never resolves to another workspace.
    if (resolution.kind === "invalid_subdomain") {
      return {
        action: "rewrite",
        status: 404,
        rewritePathname: "/tenant-not-found",
        sanitizedRequestHeaders,
        responseHeaders: buildSecurityResponseHeaders(
          parsedUrl.pathname,
          resolution.kind,
          null,
          null
        ),
        deleteLegacyTenantCookie,
        resolution,
      };
    }

    // Untrusted external Host header or malformed Host header
    return {
      action: "json_error",
      status: 400,
      jsonBody: {
        error:
          resolution.errorMessage || "Invalid or untrusted Host header.",
        code: resolution.errorCode || "UNTRUSTED_DOMAIN",
        kind: resolution.kind,
      },
      sanitizedRequestHeaders,
      responseHeaders: buildSecurityResponseHeaders(
        parsedUrl.pathname,
        resolution.kind,
        null,
        null
      ),
      deleteLegacyTenantCookie,
      resolution,
    };
  }

  // 4. Canonical Domain Redirects (308 Permanent Redirect):
  // - www.app.countercub.com -> https://app.countercub.com
  // - seyalpro.com / www.seyalpro.com / seyalpro.in -> https://countercub.com
  // - <slug>.seyalpro.com / <slug>.seyalpro.in -> https://<slug>.countercub.com
  // - www.localhost:3000 -> http://localhost:3000
  if (resolution.isCanonicalRedirectRequired && resolution.redirectTargetHost) {
    const protocol = resolution.isLocalhost ? "http" : "https";
    const cleanSearchParams = new URLSearchParams(parsedUrl.searchParams);
    // Strip deprecated ?tenant= query parameter on canonical redirect
    cleanSearchParams.delete("tenant");
    const searchString = cleanSearchParams.toString();
    const targetUrl = `${protocol}://${resolution.redirectTargetHost}${
      parsedUrl.pathname
    }${searchString ? `?${searchString}` : ""}`;

    return {
      action: "redirect",
      status: 308,
      location: targetUrl,
      sanitizedRequestHeaders,
      responseHeaders: buildSecurityResponseHeaders(
        parsedUrl.pathname,
        resolution.kind,
        resolution.canonicalHost,
        resolution.tenantSlug
      ),
      deleteLegacyTenantCookie,
      resolution,
    };
  }

  // 5. Host-Kind Route Boundary Enforcement
  const pathname = parsedUrl.pathname;
  const boundaryHeaders = () =>
    buildSecurityResponseHeaders(
      pathname,
      resolution.kind,
      resolution.canonicalHost,
      resolution.kind === "tenant_workspace" ? resolution.tenantSlug : null
    );
  const redirectTo = (location: string, status = 307): WildcardRouteDecision => ({
    action: "redirect",
    status,
    location,
    sanitizedRequestHeaders,
    responseHeaders: boundaryHeaders(),
    deleteLegacyTenantCookie,
    resolution,
  });
  const redirectToPath = (targetPath: string): WildcardRouteDecision => {
    const target = new URL(parsedUrl.toString());
    target.pathname = targetPath;
    target.search = "";
    return redirectTo(target.toString());
  };
  const cleanSearch = () => {
    const params = new URLSearchParams(parsedUrl.searchParams);
    params.delete("tenant");
    const s = params.toString();
    return s ? `?${s}` : "";
  };

  if (resolution.kind === "platform_admin") {
    // app.countercub.com / app.localhost serves the Super Admin portal directly at `/`
    if (pathname === "/") {
      return {
        action: "rewrite",
        status: 200,
        rewritePathname: "/super-admin",
        sanitizedRequestHeaders,
        responseHeaders: boundaryHeaders(),
        deleteLegacyTenantCookie,
        resolution,
      };
    }
    if (pathname === "/super-admin-login") {
      return {
        action: "rewrite",
        status: 200,
        rewritePathname: "/super-admin/login",
        sanitizedRequestHeaders,
        responseHeaders: boundaryHeaders(),
        deleteLegacyTenantCookie,
        resolution,
      };
    }
    if (pathname === "/login" || pathname === "/super-admin/login") {
      return redirectToPath("/super-admin-login");
    }
    if (pathname === "/super-admin") {
      return redirectToPath("/");
    }
    if (
      !isPathOrChild(pathname, "/super-admin") &&
      pathname !== "/reset-password" &&
      pathname !== "/set-password" &&
      !pathname.startsWith("/api/") &&
      !isStaticOrPublicPath(pathname)
    ) {
      // Shop pages (/billing, /admin, /site, ...) never render on the platform admin host.
      return redirectToPath("/");
    }
  } else if (resolution.kind === "marketing") {
    // countercub.com / www.countercub.com / localhost serves only the public landing page.
    if (isPathOrChild(pathname, "/super-admin") || pathname === "/super-admin-login") {
      const targetPath = pathname.startsWith("/super-admin-login")
        ? "/super-admin-login"
        : "/";
      return redirectTo(
        `${getPlatformAdminOrigin(resolution, parsedUrl)}${targetPath}${cleanSearch()}`,
        resolution.isLocalhost ? 307 : 308
      );
    }

    if (pathname.startsWith("/api/")) {
      if (pathname === "/api/health" || pathname.startsWith("/api/public/")) {
        // fall through to "next"
      } else {
        return {
          action: "json_error",
          status: 404,
          jsonBody: {
            error: "This API is not available on the public website host.",
            code: "NOT_AVAILABLE_ON_MARKETING_HOST",
            kind: resolution.kind,
          },
          sanitizedRequestHeaders,
          responseHeaders: boundaryHeaders(),
          deleteLegacyTenantCookie,
          resolution,
        };
      }
    } else if (pathname === "/") {
      return {
        action: "rewrite",
        status: 200,
        rewritePathname: MARKETING_LANDING_PATH,
        sanitizedRequestHeaders,
        responseHeaders: boundaryHeaders(),
        deleteLegacyTenantCookie,
        resolution,
      };
    } else if (
      !isPathOrChild(pathname, MARKETING_LANDING_PATH) &&
      !isStaticOrPublicPath(pathname)
    ) {
      // /login, /billing, /admin, ... are shop pages: send visitors back to the landing page.
      return redirectToPath("/");
    }
  } else if (resolution.kind === "tenant_workspace") {
    // The landing page is never served on shop hosts.
    if (isPathOrChild(pathname, MARKETING_LANDING_PATH)) {
      return redirectToPath("/");
    }

    // Customer tenant subdomains (<tenant-slug>.countercub.com) must never serve the Super Admin portal
    // or Super Admin management APIs (except /api/super-admin/impersonation for checking/ending support sessions)
    const isSuperAdminPage =
      parsedUrl.pathname === "/super-admin" ||
      parsedUrl.pathname.startsWith("/super-admin/") ||
      parsedUrl.pathname === "/super-admin-login";
    const isSuperAdminManagementApi =
      parsedUrl.pathname.startsWith("/api/super-admin/") &&
      !parsedUrl.pathname.startsWith("/api/super-admin/impersonation");

    if (isSuperAdminManagementApi) {
      return {
        action: "json_error",
        status: 403,
        jsonBody: {
          error:
            "Platform administration APIs are restricted to app.countercub.com.",
          code: "SUPER_ADMIN_HOST_REQUIRED",
        },
        sanitizedRequestHeaders,
        responseHeaders: buildSecurityResponseHeaders(
          parsedUrl.pathname,
          resolution.kind,
          resolution.canonicalHost,
          resolution.tenantSlug
        ),
        deleteLegacyTenantCookie,
        resolution,
      };
    }

    if (isSuperAdminPage) {
      const protocol = resolution.isLocalhost ? "http" : "https";
      const portSuffix =
        resolution.isLocalhost && parsedUrl.port ? `:${parsedUrl.port}` : "";
      const adminHost = resolution.isLocalhost
        ? `app.localhost${portSuffix}`
        : `app.${CANONICAL_ROOT_DOMAIN}`;

      return {
        action: "redirect",
        status: 307,
        location: `${protocol}://${adminHost}${parsedUrl.pathname}`,
        sanitizedRequestHeaders,
        responseHeaders: buildSecurityResponseHeaders(
          parsedUrl.pathname,
          resolution.kind,
          resolution.canonicalHost,
          resolution.tenantSlug
        ),
        deleteLegacyTenantCookie,
        resolution,
      };
    }
  }

  // 6. Forward request with sanitized, server-verified headers
  return {
    action: "next",
    status: 200,
    sanitizedRequestHeaders,
    responseHeaders: buildSecurityResponseHeaders(
      parsedUrl.pathname,
      resolution.kind,
      resolution.canonicalHost,
      resolution.kind === "tenant_workspace" ? resolution.tenantSlug : null
    ),
    deleteLegacyTenantCookie,
    resolution,
  };
}

