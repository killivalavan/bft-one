/**
 * CounterCub — CSRF Origin Verification & API Rate Limiting
 * ============================================================================
 * Protects mutating API endpoints (POST, PUT, PATCH, DELETE) from cross-site
 * and cross-subdomain request forgery, and provides deterministic sliding-window
 * rate limiting for sensitive endpoints.
 */

import { resolveCanonicalHostname, resolveRequestHostname } from "../tenant/hostnameResolver.ts";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export interface CsrfCheckResult {
  ok: boolean;
  reason?: string;
}

/**
 * Verifies that a mutating HTTP request originates from the same canonical
 * host and is not a cross-site or cross-tenant-subdomain forgery.
 */
export function verifySameOriginCsrf(request: Request): CsrfCheckResult {
  const method = (request.method || "GET").toUpperCase();
  if (SAFE_METHODS.has(method)) {
    return { ok: true };
  }

  // Block explicit browser cross-site fetch metadata immediately
  const secFetchSite = request.headers.get("sec-fetch-site")?.toLowerCase().trim();
  if (secFetchSite === "cross-site") {
    return {
      ok: false,
      reason: "Cross-site mutating request blocked by Sec-Fetch-Site policy.",
    };
  }

  const originHeader = request.headers.get("origin")?.trim();
  const refererHeader = request.headers.get("referer")?.trim();
  const rawSource = originHeader || refererHeader;

  // Non-browser / CLI / test calls that do not send Origin or Referer
  if (!rawSource) {
    return { ok: true };
  }

  let sourceUrl: URL;
  try {
    sourceUrl = new URL(rawSource);
  } catch {
    return {
      ok: false,
      reason: "Malformed Origin or Referer header on mutating request.",
    };
  }

  const sourceResolution = resolveCanonicalHostname(sourceUrl.host);
  if (!sourceResolution.valid) {
    return {
      ok: false,
      reason: `Untrusted request origin: ${sourceUrl.host}`,
    };
  }

  const targetResolution = resolveRequestHostname(request);
  if (targetResolution.valid) {
    const sourceHost = sourceResolution.canonicalHost || sourceResolution.normalizedHost;
    const targetHost = targetResolution.canonicalHost || targetResolution.normalizedHost;
    // Enforce strict same-hostname match so tenant-a.countercub.com cannot POST to tenant-b.countercub.com
    if (sourceHost !== targetHost) {
      return {
        ok: false,
        reason: `Cross-subdomain origin mismatch: origin '${sourceHost}' cannot mutate '${targetHost}'.`,
      };
    }
  }

  return { ok: true };
}

interface RateLimitBucket {
  timestamps: number[];
}

const rateLimitStore = new Map<string, RateLimitBucket>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Sliding-window rate limiter keyed by caller identifier + endpoint.
 */
export function checkRateLimit(
  key: string,
  maxRequests: number = 30,
  windowMs: number = 60_000,
  nowMs: number = Date.now()
): RateLimitResult {
  const cutoff = nowMs - windowMs;
  const bucket = rateLimitStore.get(key) || { timestamps: [] };
  bucket.timestamps = bucket.timestamps.filter((t) => t > cutoff);

  if (bucket.timestamps.length >= maxRequests) {
    const oldest = bucket.timestamps[0] || nowMs;
    return {
      allowed: false,
      remaining: 0,
      resetAt: oldest + windowMs,
    };
  }

  bucket.timestamps.push(nowMs);
  rateLimitStore.set(key, bucket);

  // Periodic cleanup to avoid unbounded memory growth
  if (rateLimitStore.size > 5000) {
    for (const [k, v] of rateLimitStore.entries()) {
      if (v.timestamps.every((t) => t <= cutoff)) {
        rateLimitStore.delete(k);
      }
    }
  }

  return {
    allowed: true,
    remaining: Math.max(0, maxRequests - bucket.timestamps.length),
    resetAt: nowMs + windowMs,
  };
}
