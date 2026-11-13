import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/serverAuth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedBusinessId = searchParams.get("businessId");

    // If a platform-wide or specific businessId query is requested on the Super Admin portal,
    // require verified Super Admin access; otherwise use user-scoped RLS for the tenant admin.
    const auth = await authenticateRequest(
      request,
      requestedBusinessId ? { requireSuperAdmin: true } : { requireAdmin: true }
    );
    if ("errorResponse" in auth) {
      return auth.errorResponse;
    }

    const { user: caller, supa } = auth;
    const limit = Math.min(Number(searchParams.get("limit")) || 50, 200);

    let query = supa
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (requestedBusinessId && caller.isSuperAdmin) {
      query = query.eq("business_id", requestedBusinessId);
    } else {
      query = query.eq("business_id", caller.businessId);
    }

    const { data: logs, error } = await query;

    if (error) {
      // If table not yet created in Supabase SQL editor, return empty list gracefully
      return NextResponse.json({
        logs: [],
        warning: "Audit logs table not found or migration pending.",
      });
    }

    return NextResponse.json({ logs: logs || [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}
