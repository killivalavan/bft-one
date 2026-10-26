import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export interface AuthenticatedUser {
  id: string;
  email: string;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isStockManager: boolean;
  businessId: string;
  aal?: "aal1" | "aal2";
}

export interface AuthSuccess {
  user: AuthenticatedUser;
  supa: ReturnType<typeof supabaseAdmin>;
}

export interface AuthFailure {
  errorResponse: NextResponse;
}

export interface AuthenticateRequestOptions {
  requireAdmin?: boolean;
  requireSuperAdmin?: boolean;
  requireAAL2?: boolean;
  requireRecentAuthMinutes?: number;
}

// In-memory rate limiter for traffic control on sensitive endpoints with automatic eviction
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

export function checkRateLimit(key: string, limit = 60, windowMs = 60000): boolean {
  const now = Date.now();

  // Periodic eviction to prevent unbounded memory growth
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

function parseJwtPayload(token: string): Record<string, any> | null {
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
 * Validates request authentication and resolves the caller's tenant context.
 * Supports:
 * - Authorization: Bearer <token>
 * - Cookie: sb-access-token, sb-<project>-auth-token, or chunked auth tokens
 */
export async function authenticateRequest(
  request: Request,
  options: AuthenticateRequestOptions = {}
): Promise<AuthSuccess | AuthFailure> {
  const ip = request.headers.get("x-forwarded-for") || "unknown";

  // Traffic control check
  if (!checkRateLimit(`ip_${ip}`, 120, 60000)) {
    return {
      errorResponse: NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      ),
    };
  }

  const supa = supabaseAdmin();

  // 1. Extract Bearer token
  const authHeader = request.headers.get("authorization");
  let token = "";
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    const candidate = authHeader.substring(7).trim();
    if (candidate && candidate !== "null" && candidate !== "undefined") {
      token = candidate;
    }
  }

  // Fallback to cookie if present
  if (!token) {
    const cookieHeader = request.headers.get("cookie") || "";
    
    // Check for chunked supabase cookies first (sb-*-auth-token.0, sb-*-auth-token.1)
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
        token = Array.isArray(parsed) ? parsed[0] : (parsed.access_token || parsed);
      } catch {
        token = combined;
      }
    }

    // Standard unchunked cookies
    if (!token) {
      const match =
        cookieHeader.match(/sb-access-token=([^;]+)/) ||
        cookieHeader.match(/sb-[a-zA-Z0-9_-]+-auth-token=([^;]+)/);

      if (match) {
        try {
          const decoded = decodeURIComponent(match[1]);
          const parsed = JSON.parse(decoded);
          token = Array.isArray(parsed) ? parsed[0] : (parsed.access_token || parsed);
        } catch {
          token = match[1];
        }
      }
    }
  }

  if (!token) {
    return {
      errorResponse: NextResponse.json(
        { error: "Authentication required. Missing token." },
        { status: 401 }
      ),
    };
  }

  // 2. Verify token with Supabase Auth
  const { data: authData, error: authErr } = await supa.auth.getUser(token);
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
  const aal = (jwtPayload?.aal as "aal1" | "aal2") || "aal1";
  const amr = Array.isArray(jwtPayload?.amr) ? jwtPayload.amr : [];

  // 3. Resolve profile, role flags, and business_id from authoritative DB record
  const { data: profile, error: profErr } = await supa
    .from("profiles")
    .select("is_admin, is_stock_manager, is_super_admin, business_id")
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

  const isAdmin = !!profile.is_admin;
  // Super Admin status derives SOLELY from the authoritative database record
  const isSuperAdmin = !!profile.is_super_admin;
  const isStockManager = !!profile.is_stock_manager;

  // STRICT MULTI-TENANT BOUNDARY:
  // Non-super-admins MUST be explicitly bound to their store's business_id.
  // Never default an unassigned user to another store.
  if (!isSuperAdmin && !profile.business_id) {
    return {
      errorResponse: NextResponse.json(
        { error: "Forbidden: No business workspace is assigned to this account." },
        { status: 403 }
      ),
    };
  }

  const businessId = profile.business_id || "";

  // 4. Role Authorization Checks
  if (options.requireSuperAdmin) {
    if (!isSuperAdmin) {
      return {
        errorResponse: NextResponse.json(
          { error: "Forbidden: Super Admin access required." },
          { status: 403 }
        ),
      };
    }

    // Enforce TOTP MFA AAL2 assurance by default for Super Admin
    const shouldRequireAAL2 = options.requireAAL2 !== false;
    if (shouldRequireAAL2 && aal !== "aal2") {
      return {
        errorResponse: NextResponse.json(
          {
            error: "Forbidden: Super Admin access requires MFA Authenticator Assurance Level 2 (AAL2).",
            mfaRequired: true,
          },
          { status: 403 }
        ),
      };
    }

    // Recent authentication verification for high-impact actions
    if (options.requireRecentAuthMinutes && options.requireRecentAuthMinutes > 0) {
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
  }

  if (options.requireAdmin && !isAdmin && !isSuperAdmin) {
    return {
      errorResponse: NextResponse.json(
        { error: "Forbidden: Admin access required." },
        { status: 403 }
      ),
    };
  }

  return {
    user: {
      id: userId,
      email: userEmail,
      isAdmin,
      isSuperAdmin,
      isStockManager,
      businessId,
      aal,
    },
    supa,
  };
}
