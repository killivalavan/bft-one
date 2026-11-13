import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/serverAuth";

export const dynamic = "force-dynamic";

// POST { product_ids: string[] }
export async function POST(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    if ("errorResponse" in auth) {
      return auth.errorResponse;
    }

    const { user: caller, supa } = auth;
    const body = (await req.json().catch(() => ({}))) as { product_ids?: string[] };
    const ids = Array.isArray(body.product_ids) ? [...new Set(body.product_ids.filter(Boolean))] : [];
    if (ids.length === 0) return NextResponse.json({ ok: true, skipped: true });

    const { data: stocks, error: stErr } = await supa
      .from("product_stocks")
      .select("product_id, available_qty, notify_at_count")
      .in("product_id", ids)
      .eq("business_id", caller.businessId);

    if (stErr) return NextResponse.json({ error: stErr.message }, { status: 500 });

    const toClear: string[] = [];
    for (const s of stocks || []) {
      const avail = s.available_qty || 0;
      const thr = s.notify_at_count && s.notify_at_count > 0 ? s.notify_at_count : null;
      const clearLow = thr !== null ? avail > thr : false;
      const clearOOS = avail > 0;
      if (clearLow || clearOOS) toClear.push(s.product_id);
    }

    if (toClear.length > 0) {
      const { error: delErr } = await supa
        .from("notifications")
        .delete()
        .in("product_id", toClear)
        .eq("kind", "stock")
        .eq("business_id", caller.businessId);

      if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, cleared: toClear.length });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "unknown" }, { status: 500 });
  }
}
