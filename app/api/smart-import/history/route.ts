/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/serverAuth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    if ("errorResponse" in auth) {
      return auth.errorResponse;
    }

    const { user: caller, supa } = auth;
    const { searchParams } = new URL(req.url);
    const requestedBizId = searchParams.get("business_id");

    // Strict store isolation
    if (
      requestedBizId &&
      requestedBizId !== "default" &&
      requestedBizId !== caller.businessId
    ) {
      return NextResponse.json(
        { error: "Forbidden: Cannot view import history belonging to another store." },
        { status: 403 }
      );
    }

    const businessId = caller.businessId;

    if (!businessId) {
      return NextResponse.json({ ok: true, jobs: [], total: 0 });
    }

    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = Math.min(50, Math.max(5, parseInt(searchParams.get("pageSize") || "15", 10)));
    const offset = (page - 1) * pageSize;

    // 1. Try primary relational data_import_jobs table scoped to businessId
    const { data: tableJobs, error: tableError, count } = await supa
      .from("data_import_jobs")
      .select("*", { count: "exact" })
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (!tableError && Array.isArray(tableJobs) && tableJobs.length > 0) {
      return NextResponse.json({
        ok: true,
        source: "table",
        jobs: tableJobs,
        total: count ?? tableJobs.length,
        page,
        pageSize,
      });
    }

    // 2. Fallback to businesses.enabled_modules._smart_imports for this store
    const { data: biz } = await supa
      .from("businesses")
      .select("enabled_modules")
      .eq("id", businessId)
      .maybeSingle();

    const fallbackJobs: any[] = Array.isArray(biz?.enabled_modules?._smart_imports)
      ? biz.enabled_modules._smart_imports
      : [];

    const paged = fallbackJobs.slice(offset, offset + pageSize);

    return NextResponse.json({
      ok: true,
      source: "modules_fallback",
      jobs: paged,
      total: fallbackJobs.length,
      page,
      pageSize,
    });
  } catch (err: any) {
    console.error("GET /api/smart-import/history error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to fetch import history" },
      { status: 500 }
    );
  }
}

