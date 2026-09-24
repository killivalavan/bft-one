import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/serverAuth";
import { supabaseAdmin } from "@/lib/supabaseServer";

export async function GET(request: Request) {
  try {
    const auth = await authenticateRequest(request, { requireAdmin: true });
    if ("errorResponse" in auth) {
      return auth.errorResponse;
    }

    const caller = auth.user;
    const supa = supabaseAdmin();
    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get("limit")) || 50, 200);

    let query = supa
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    // If Store Admin (not Super Admin), filter strictly to their business
    if (!caller.isSuperAdmin) {
      query = query.eq("business_id", caller.businessId);
    } else if (searchParams.get("businessId")) {
      query = query.eq("business_id", searchParams.get("businessId")!);
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
