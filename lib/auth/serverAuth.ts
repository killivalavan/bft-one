import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export interface AuthenticatedUser {
  id: string;
  email: string;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isStockManager: boolean;
  businessId: string;
}

export interface AuthSuccess {
  user: AuthenticatedUser;
  supa: ReturnType<typeof supabaseAdmin>;
}

export interface AuthFailure {
  errorResponse: NextResponse;
}

// In-memory rate limiter for traffic control on sensitive endpoints
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

export function checkRateLimit(key: string, limit = 60, windowMs = 60000): boolean {
  const now = Date.now();
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
 * Validates request authentication and resolves the caller's tenant context.
 * Supports:
 * - Authorization: Bearer <token>
 * - Cookie: sb-access-token or custom auth token
 */
export async function authenticateRequest(
  request: Request,
  options: { requireAdmin?: boolean; requireSuperAdmin?: boolean } = {}
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
    token = authHeader.substring(7).trim();
  }

  // Fallback to cookie if present
  if (!token) {
    const cookieHeader = request.headers.get("cookie") || "";
    const match = cookieHeader.match(/sb-access-token=([^;]+)/) ||
      cookieHeader.match(/sb-[a-z]+-auth-token=([^;]+)/);
    if (match) {
      try {
        const parsed = JSON.parse(decodeURIComponent(match[1]));
        token = Array.isArray(parsed) ? parsed[0] : (parsed.access_token || parsed);
      } catch {
        token = match[1];
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

  // 3. Resolve profile, role flags, and business_id
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

  // Fallback default business if not yet backfilled in DB
  const defaultBftId = "a0000000-0000-0000-0000-000000000001";
  const businessId = profile.business_id || defaultBftId;
  const isAdmin = !!profile.is_admin;
  const emailLower = userEmail.toLowerCase();
  const isSuperAdmin =
    emailLower === "admin@seyalpro.com" ||
    (!!profile.is_super_admin && !profile.business_id);
  const isStockManager = !!profile.is_stock_manager;

  // 4. Role Authorization Checks
  if (options.requireSuperAdmin && !isSuperAdmin) {
    return {
      errorResponse: NextResponse.json(
        { error: "Forbidden: Super Admin access required." },
        { status: 403 }
      ),
    };
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
    },
    supa,
  };
}
