import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { extractAccessTokenFromRequest, parseJwtPayload } from "@/lib/data/serverDal";

export const dynamic = "force-dynamic";

/**
 * Returns the authenticated user's authoritative profile and role flags.
 * Directly validates the Supabase JWT without requiring tenant matching,
 * allowing Super Admins to resolve their profile from platform admin or marketing hosts.
 */
export async function GET(request: NextRequest) {
  try {
    const token = extractAccessTokenFromRequest(request);
    if (!token) {
      return NextResponse.json({ error: "Unauthorized: Missing access token" }, { status: 401 });
    }

    const supa = supabaseAdmin();
    const { data: authData, error: authErr } = await supa.auth.getUser(token);
    if (authErr || !authData?.user) {
      return NextResponse.json({ error: "Unauthorized: Invalid session" }, { status: 401 });
    }

    const userId = authData.user.id;
    const jwtPayload = parseJwtPayload(token);
    const aal = jwtPayload?.aal === "aal2" ? "aal2" : "aal1";

    const { data: profile, error } = await supa
      .from("profiles")
      .select("id, email, full_name, is_admin, is_stock_manager, is_super_admin, business_id")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let homeBusiness: { id: string; name: string; slug: string; is_active: boolean } | null = null;
    if (profile?.business_id) {
      const { data: biz } = await supa
        .from("businesses")
        .select("id, name, slug, is_active")
        .eq("id", profile.business_id)
        .maybeSingle();
      if (biz) {
        homeBusiness = {
          id: biz.id,
          name: biz.name,
          slug: biz.slug,
          is_active: biz.is_active !== false,
        };
      }
    }

    return NextResponse.json({
      user: {
        id: userId,
        email: authData.user.email || profile?.email || "",
        aal,
      },
      profile: profile || null,
      homeBusiness,
      flags: {
        isAdmin: Boolean(profile?.is_admin),
        isStockManager: Boolean(profile?.is_stock_manager),
        isSuperAdmin: Boolean(profile?.is_super_admin),
        businessId: profile?.business_id || null,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
