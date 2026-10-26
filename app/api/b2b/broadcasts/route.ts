import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/serverAuth";

export async function GET(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    if ("errorResponse" in auth) {
      return auth.errorResponse;
    }

    const { user: caller, supa } = auth;
    const { searchParams } = new URL(req.url);
    const requestedBizId = searchParams.get("business_id");

    const businessId = requestedBizId && requestedBizId !== "default"
      ? requestedBizId
      : caller.businessId;

    if (!caller.isSuperAdmin && businessId !== caller.businessId) {
      return NextResponse.json(
        { error: "Forbidden: Cannot access broadcasts of another business." },
        { status: 403 }
      );
    }

    // 1. Try relational table
    const { data: tableData, error: tableError } = await supa
      .from("b2b_broadcasts")
      .select("*")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false });

    if (!tableError && tableData) {
      return NextResponse.json({ ok: true, broadcasts: tableData, source: "table" });
    }

    // 2. Dual-engine fallback
    const { data: biz } = await supa
      .from("businesses")
      .select("enabled_modules")
      .eq("id", businessId)
      .maybeSingle();

    const broadcasts = biz?.enabled_modules?._b2b_data?.broadcasts || [];
    return NextResponse.json({ ok: true, broadcasts, source: "modules_fallback" });
  } catch (err: any) {
    console.error("GET /api/b2b/broadcasts error:", err);
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    if ("errorResponse" in auth) {
      return auth.errorResponse;
    }

    const { user: caller, supa } = auth;
    const body = await req.json().catch(() => ({}));

    const targetBizId = body.business_id && body.business_id !== "default"
      ? body.business_id
      : caller.businessId;

    if (!caller.isSuperAdmin && targetBizId !== caller.businessId) {
      return NextResponse.json(
        { error: "Forbidden: Cannot send broadcasts for another business." },
        { status: 403 }
      );
    }

    const businessId = targetBizId;
    const id = body.id || `bc-${Date.now()}`;
    const broadcastPayload = {
      id,
      business_id: businessId,
      title: body.title?.trim() || "Wholesale Advisory",
      message: body.message?.trim() || "",
      category: body.category || "Production",
      priority: body.priority || "normal",
      target_stores: Array.isArray(body.target_stores) ? body.target_stores : [],
      created_at: new Date().toISOString(),
    };

    // 1. Try relational table insert
    const { data: tableData, error: tableError } = await supa
      .from("b2b_broadcasts")
      .insert(broadcastPayload)
      .select()
      .maybeSingle();

    // 2. Dual-engine fallback
    const { data: biz } = await supa
      .from("businesses")
      .select("enabled_modules")
      .eq("id", businessId)
      .maybeSingle();

    const b2bData = biz?.enabled_modules?._b2b_data || {};
    const existing: any[] = Array.isArray(b2bData.broadcasts) ? b2bData.broadcasts : [];
    const updated = [broadcastPayload, ...existing.filter((b) => b.id !== id)];

    const nextModules = {
      ...(biz?.enabled_modules || {}),
      _b2b_data: {
        ...b2bData,
        broadcasts: updated,
        lastUpdated: new Date().toISOString(),
      },
    };

    await supa
      .from("businesses")
      .update({ enabled_modules: nextModules })
      .eq("id", businessId);

    return NextResponse.json({
      ok: true,
      broadcast: tableData || broadcastPayload,
      source: !tableError ? "table" : "modules_fallback",
    });
  } catch (err: any) {
    console.error("POST /api/b2b/broadcasts error:", err);
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}
