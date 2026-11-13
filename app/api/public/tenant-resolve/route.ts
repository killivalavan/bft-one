import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { checkRateLimit } from "@/lib/auth/serverAuth";
import { resolveRequestHostname } from "@/lib/tenant/hostnameResolver";

/**
 * GET /api/public/tenant-resolve
 *
 * Resolves public workspace branding strictly from the validated canonical request hostname.
 * - Never trusts query parameters (`?tenant=`) or cookies (`tenant_slug`).
 * - Returns ONLY minimal public branding fields (`id`, `name`, `slug`, `logo_url`, `plan_type`).
 * - Never exposes `enabled_modules` JSONB (`_b2b_data`, `_invoices`, `upi_id`).
 * - Returns 404 when a `<tenant-slug>.countercub.com` subdomain does not exist or has been retired.
 * - Returns 403 when a `<tenant-slug>.countercub.com` workspace is suspended (`is_active === false`).
 */
export async function GET(request: Request) {
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  if (!checkRateLimit(`tenant_resolve_${ip}`, 60, 60000)) {
    return NextResponse.json(
      { error: "Too many requests.", code: "RATE_LIMITED" },
      { status: 429 }
    );
  }

  const resolution = resolveRequestHostname(request);

  if (!resolution.valid) {
    return NextResponse.json(
      {
        error: resolution.errorMessage || "Invalid hostname.",
        code: resolution.errorCode || "INVALID_HOSTNAME",
        kind: resolution.kind,
      },
      {
        status: resolution.kind === "invalid_subdomain" ? 404 : 400,
        headers: {
          "Cache-Control": "private, no-store, no-cache, must-revalidate",
          Vary: "Host",
        },
      }
    );
  }

  if (resolution.kind !== "tenant_workspace" || !resolution.tenantSlug) {
    return NextResponse.json(
      {
        kind: resolution.kind,
        canonicalHost: resolution.canonicalHost,
        business: null,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "private, no-store, no-cache, must-revalidate",
          Vary: "Host",
        },
      }
    );
  }

  try {
    const adminSupa = supabaseAdmin();
    const { data: biz, error } = await adminSupa
      .from("businesses")
      .select("id, name, slug, logo_url, plan_type, is_active, enabled_modules")
      .eq("slug", resolution.tenantSlug)
      .maybeSingle();

    if (error || !biz) {
      // Check if slug was retired so we can return a specific TENANT_RETIRED code
      const { data: retired } = await adminSupa
        .from("retired_slugs")
        .select("slug")
        .eq("slug", resolution.tenantSlug)
        .maybeSingle();

      const errorCode = retired ? "TENANT_RETIRED" : "TENANT_NOT_FOUND";
      const errorMessage = retired
        ? `Workspace subdomain '${resolution.tenantSlug}' has been retired and is no longer active.`
        : `Workspace '${resolution.tenantSlug}' was not found.`;

      return NextResponse.json(
        {
          error: errorMessage,
          code: errorCode,
          kind: "tenant_workspace",
          tenantSlug: resolution.tenantSlug,
        },
        {
          status: 404,
          headers: {
            "Cache-Control": "private, no-store, no-cache, must-revalidate",
            Vary: "Host",
          },
        }
      );
    }

    if (biz.is_active === false) {
      return NextResponse.json(
        {
          error: `Workspace '${resolution.tenantSlug}' is currently suspended.`,
          code: "TENANT_SUSPENDED",
          kind: "tenant_workspace",
          tenantSlug: resolution.tenantSlug,
        },
        {
          status: 403,
          headers: {
            "Cache-Control": "private, no-store, no-cache, must-revalidate",
            Vary: "Host",
          },
        }
      );
    }

    // Project ONLY safe boolean module flags (never expose embedded _b2b_data, _invoices, or upi_id)
    const rawMods = biz.enabled_modules || {};
    const safeModules = {
      pos: rawMods.pos !== false,
      billing: rawMods.billing !== false,
      inventory: rawMods.inventory !== false,
      expenses: rawMods.expenses !== false,
      analytics: rawMods.analytics !== false,
      employees: rawMods.employees !== false,
      baker_mode: Boolean(rawMods.baker_mode),
    };

    return NextResponse.json(
      {
        kind: "tenant_workspace",
        canonicalHost: resolution.canonicalHost,
        business: {
          id: biz.id,
          name: biz.name,
          slug: biz.slug,
          logo_url: biz.logo_url || null,
          plan_type: biz.plan_type || "pro",
          status: "active",
          enabled_modules: safeModules,
        },
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "private, no-store, no-cache, must-revalidate",
          Vary: "Host",
        },
      }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to resolve workspace.", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
