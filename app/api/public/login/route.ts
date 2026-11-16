import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { checkRateLimit, verifySameOriginCsrf } from "@/lib/security/csrf";
import { resolveRequestHostname } from "@/lib/tenant/hostnameResolver";
import {
  getBusinessStoreId,
  resolveLoginIdentifierToEmail,
} from "@/lib/utils/storeIdGenerator";

export const dynamic = "force-dynamic";

function getAdditionalApprovedRootDomains(): string[] {
  const raw = process.env.NEXT_PUBLIC_ADDITIONAL_ROOT_DOMAINS || "";
  if (!raw.trim()) return [];
  return raw
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * POST /api/public/login
 *
 * Authenticates a tenant workspace user using:
 * - Store Reference ID (e.g., "KBS74713") -> resolves the store's primary admin account
 * - Store Admin Mail ID / Email (including contact_email fallback for legacy .internal admins)
 * - Prefix-based Employee Login ID (e.g., "kbs10121997")
 *
 * Strictly verifies the tenant workspace from the canonical request hostname
 * and verifies credentials via Supabase Auth before returning a session, so
 * unauthenticated callers can never enumerate admin email addresses.
 */
export async function POST(request: Request) {
  try {
    const csrfCheck = verifySameOriginCsrf(request);
    if (!csrfCheck.ok) {
      return NextResponse.json(
        {
          error: csrfCheck.reason || "Forbidden: Cross-origin login request rejected.",
          code: "CSRF_ORIGIN_MISMATCH",
        },
        { status: 403 }
      );
    }

    const ip = request.headers.get("x-forwarded-for") || "unknown";
    const rate = checkRateLimit(`public_login:${ip}`, 25, 60_000);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Too many login attempts. Please wait a minute and try again.", code: "RATE_LIMITED" },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const rawIdentifier = typeof body?.identifier === "string" ? body.identifier.trim() : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!rawIdentifier || !password) {
      return NextResponse.json(
        { error: "Please enter your Store Reference ID / Mail ID and password." },
        { status: 400 }
      );
    }

    const resolution = resolveRequestHostname(request, {
      additionalApprovedRootDomains: getAdditionalApprovedRootDomains(),
    });

    if (!resolution.valid || resolution.kind !== "tenant_workspace" || !resolution.tenantSlug) {
      return NextResponse.json(
        { error: "Workspace could not be verified from this URL.", code: "TENANT_CONTEXT_REQUIRED" },
        { status: 400 }
      );
    }

    const adminSupa = supabaseAdmin();
    const { data: biz, error: bizErr } = await adminSupa
      .from("businesses")
      .select("id, name, slug, is_active, enabled_modules")
      .eq("slug", resolution.tenantSlug)
      .maybeSingle();

    if (bizErr || !biz) {
      return NextResponse.json(
        { error: "Workspace not found. Please check the shop URL and try again." },
        { status: 404 }
      );
    }

    if (biz.is_active === false) {
      return NextResponse.json(
        { error: `Workspace '${resolution.tenantSlug}' is currently suspended.` },
        { status: 403 }
      );
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
      return NextResponse.json({ error: "Auth service not configured." }, { status: 500 });
    }

    const { storeId } = getBusinessStoreId(biz);
    const upperIdentifier = rawIdentifier.toUpperCase();
    const lowerIdentifier = rawIdentifier.toLowerCase();
    const isEmailInput = rawIdentifier.includes("@");

    const candidateEmails: string[] = [];
    const pushCandidate = (candidate?: string | null) => {
      const normalized = String(candidate || "").trim().toLowerCase();
      if (normalized && !candidateEmails.includes(normalized)) {
        candidateEmails.push(normalized);
      }
    };

    let displayIdentifier = lowerIdentifier;

    if (!isEmailInput && storeId && upperIdentifier === storeId) {
      // Store Reference ID login (e.g., KBS74713): resolve store admin account(s)
      const { data: adminProfiles } = await adminSupa
        .from("profiles")
        .select("id, email, contact_email, is_super_admin, created_at")
        .eq("business_id", biz.id)
        .eq("is_admin", true)
        .order("created_at", { ascending: true });

      const orderedAdmins = [
        ...(adminProfiles || []).filter((p) => !p.is_super_admin),
        ...(adminProfiles || []).filter((p) => p.is_super_admin),
      ];

      for (const adminProf of orderedAdmins) {
        pushCandidate(adminProf.email);
      }

      // Also support any employee ID that matches the store ID pattern
      pushCandidate(resolveLoginIdentifierToEmail(rawIdentifier, resolution.tenantSlug));
      displayIdentifier = storeId;
    } else if (isEmailInput) {
      pushCandidate(lowerIdentifier);

      // Backward-compatible lookup if an existing store admin's auth email was .internal
      // and their real Store Admin Mail ID is saved in profiles.contact_email
      const { data: contactProfiles } = await adminSupa
        .from("profiles")
        .select("email, is_admin, created_at")
        .eq("business_id", biz.id)
        .eq("contact_email", lowerIdentifier)
        .order("is_admin", { ascending: false })
        .order("created_at", { ascending: true });

      for (const prof of contactProfiles || []) {
        pushCandidate(prof.email);
      }
      displayIdentifier = lowerIdentifier;
    } else {
      pushCandidate(resolveLoginIdentifierToEmail(rawIdentifier, resolution.tenantSlug));
      displayIdentifier = lowerIdentifier;
    }

    if (candidateEmails.length === 0) {
      return NextResponse.json({ error: "Invalid login credentials" }, { status: 401 });
    }

    const tempSupa = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let authenticatedSession: { access_token: string; refresh_token: string } | null = null;
    let rateLimitedError: string | null = null;

    for (const candidateEmail of candidateEmails) {
      const { data, error } = await tempSupa.auth.signInWithPassword({
        email: candidateEmail,
        password,
      });

      if (!error && data?.session?.access_token && data?.session?.refresh_token) {
        authenticatedSession = {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        };
        break;
      }

      if (error?.message?.toLowerCase().includes("rate limit")) {
        rateLimitedError = error.message;
        break;
      }
    }

    if (rateLimitedError) {
      return NextResponse.json({ error: rateLimitedError }, { status: 429 });
    }

    if (!authenticatedSession) {
      return NextResponse.json({ error: "Invalid login credentials" }, { status: 401 });
    }

    return NextResponse.json({
      ok: true,
      session: authenticatedSession,
      displayIdentifier,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "An unexpected error occurred during login." },
      { status: 500 }
    );
  }
}
