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

    const requestedBizId = body.business_id || body.sender_business_id;
    const targetBizId = requestedBizId && requestedBizId !== "default"
      ? requestedBizId
      : caller.businessId;

    if (!caller.isSuperAdmin && targetBizId !== caller.businessId) {
      return NextResponse.json(
        { error: "Forbidden: Cannot send broadcasts for another business." },
        { status: 403 }
      );
    }

    const businessId = targetBizId;
    const title = body.title?.trim() || "Wholesale Advisory";
    const message = body.message?.trim() || "";
    const category = body.category || "Production";
    const id = body.id || `bc-${Date.now()}`;
    const broadcastPayload = {
      id,
      business_id: businessId,
      title,
      message,
      category,
      priority: body.priority || "normal",
      target_stores: Array.isArray(body.target_stores) ? body.target_stores : (Array.isArray(body.target_store_names) ? body.target_store_names : []),
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
      .select("name, enabled_modules")
      .eq("id", businessId)
      .maybeSingle();

    const b2bData = biz?.enabled_modules?._b2b_data || {};
    const existing: any[] = Array.isArray(b2bData.broadcasts) ? b2bData.broadcasts : [];
    const updated = [broadcastPayload, ...existing.filter((b) => b.id !== id)];

    await supa
      .from("businesses")
      .update({
        enabled_modules: {
          ...(biz?.enabled_modules || {}),
          _b2b_data: { ...b2bData, broadcasts: updated, lastUpdated: new Date().toISOString() },
        },
      })
      .eq("id", businessId);

    // 3. Optional cross-tenant notification fan-out when target_store_ids are specified
    const candidateIds: string[] = Array.isArray(body.target_store_ids) ? body.target_store_ids : [];
    const targets: string[] = [];
    if (candidateIds.length > 0 && message) {
      const { data: allBusinesses } = await supa.from("businesses").select("id, name, slug");
      const matchedTargets: { id: string; name: string }[] = [];
      for (const rawId of candidateIds) {
        if (!rawId || rawId === "all") continue;
        const idLower = String(rawId).toLowerCase();
        const found = (allBusinesses || []).find(
          (b) => b.id === rawId || b.slug?.toLowerCase() === idLower || b.name?.toLowerCase() === idLower
        );
        if (found && found.id !== businessId && !matchedTargets.some((t) => t.id === found.id)) {
          matchedTargets.push({ id: found.id, name: found.name });
        }
      }
      if (matchedTargets.length > 0) {
        const senderName = biz?.name || body.sender_name || "Central Kitchen";
        const suffix = body.product_name && body.quantity
          ? ` (${body.quantity}x ${body.product_name}${body.discount_rate ? ` @ ₹${body.discount_rate}` : ""})`
          : "";
        const formattedMsg = `📢 [${String(category).toUpperCase()}] ${title}: ${message}${suffix}`;
        await supa.from("notifications").insert(
          matchedTargets.map((tb) => ({
            business_id: tb.id,
            kind: "baker_broadcast",
            message: formattedMsg,
            meta: {
              sender_name: senderName,
              category,
              title,
              product_name: body.product_name || null,
              quantity: body.quantity || null,
              discount_rate: body.discount_rate || null,
              sender_business_id: businessId || null,
            },
          }))
        );
        targets.push(...matchedTargets.map((t) => t.name));
      }
    }

    return NextResponse.json({
      ok: true,
      count: targets.length,
      targets,
      broadcast: tableData || broadcastPayload,
      source: !tableError ? "table" : "modules_fallback",
    });
  } catch (err: any) {
    console.error("POST /api/b2b/broadcasts error:", err);
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}
