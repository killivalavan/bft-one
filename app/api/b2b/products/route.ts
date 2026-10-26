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
        { error: "Forbidden: Cannot access products of another business." },
        { status: 403 }
      );
    }

    function normalizeProduct(p: any) {
      const rawPrice = Number(p.selling_price !== undefined && p.selling_price !== null ? p.selling_price : (p.rate ?? p.price ?? 0));
      const sPrice = Number.isFinite(rawPrice) ? Math.max(0, rawPrice) : 0;
      const rawCost = Number(p.making_cost !== undefined && p.making_cost !== null ? p.making_cost : (sPrice > 0 ? Math.round(sPrice * 0.42) : 0));
      const mCost = Number.isFinite(rawCost) ? Math.max(0, rawCost) : 0;
      const rawProfit = Number(p.unit_profit !== undefined && p.unit_profit !== null ? p.unit_profit : (sPrice - mCost));
      const uProfit = Number.isFinite(rawProfit) ? rawProfit : sPrice - mCost;
      const rawMargin = Number(
        p.profit_margin_pct !== undefined && p.profit_margin_pct !== null
          ? p.profit_margin_pct
          : (sPrice > 0 ? Math.round(((uProfit / sPrice) * 100) * 10) / 10 : 0)
      );
      const mPct = Number.isFinite(rawMargin) ? rawMargin : 0;

      return {
        ...p,
        id: String(p.id || `prod-${Date.now()}`),
        name: p.name || "Bakery Item",
        category: p.category || "General",
        rate: sPrice,
        selling_price: sPrice,
        making_cost: mCost,
        unit_profit: uProfit,
        profit_margin_pct: mPct,
        unit: p.unit || "Unit",
        is_active: p.is_active !== undefined ? Boolean(p.is_active) : true,
        min_order_qty: Number(p.min_order_qty || 1),
        stock_available: Number(p.stock_available || 0),
      };
    }

    // 1. Try relational table
    const { data: tableData, error: tableError } = await supa
      .from("b2b_products")
      .select("*")
      .eq("business_id", businessId)
      .order("name", { ascending: true });

    if (!tableError && tableData) {
      return NextResponse.json({ ok: true, products: tableData.map(normalizeProduct), source: "table" });
    }

    // 2. Dual-engine fallback
    const { data: biz } = await supa
      .from("businesses")
      .select("enabled_modules")
      .eq("id", businessId)
      .maybeSingle();

    const rawProducts = biz?.enabled_modules?._b2b_data?.products || [];
    return NextResponse.json({ ok: true, products: rawProducts.map(normalizeProduct), source: "modules_fallback" });
  } catch (err: any) {
    console.error("GET /api/b2b/products error:", err);
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
        { error: "Forbidden: Cannot create products for another business." },
        { status: 403 }
      );
    }

    const businessId = targetBizId;
    const id = body.id || `prod-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const rawPrice = Number(body.selling_price !== undefined && body.selling_price !== null ? body.selling_price : (body.rate ?? body.price ?? 0));
    const sPrice = Number.isFinite(rawPrice) ? Math.max(0, rawPrice) : 0;
    const rawCost = Number(body.making_cost !== undefined && body.making_cost !== null ? body.making_cost : (sPrice > 0 ? Math.round(sPrice * 0.42) : 0));
    const mCost = Number.isFinite(rawCost) ? Math.max(0, rawCost) : 0;
    const rawProfit = Number(body.unit_profit !== undefined && body.unit_profit !== null ? body.unit_profit : (sPrice - mCost));
    const uProfit = Number.isFinite(rawProfit) ? rawProfit : sPrice - mCost;
    const rawMargin = Number(
      body.profit_margin_pct !== undefined && body.profit_margin_pct !== null
        ? body.profit_margin_pct
        : (sPrice > 0 ? Math.round(((uProfit / sPrice) * 100) * 10) / 10 : 0)
    );
    const mPct = Number.isFinite(rawMargin) ? rawMargin : 0;

    const productPayload = {
      id,
      business_id: businessId,
      name: body.name?.trim() || "Bakery Item",
      category: body.category || "General",
      rate: sPrice,
      selling_price: sPrice,
      making_cost: mCost,
      unit_profit: uProfit,
      profit_margin_pct: mPct,
      unit: body.unit || "Unit",
      is_active: body.is_active !== undefined ? Boolean(body.is_active) : true,
      min_order_qty: Number(body.min_order_qty || 1),
      stock_available: Number(body.stock_available || 0),
      updated_at: new Date().toISOString(),
    };

    // 1. Try relational table upsert
    const { data: tableData, error: tableError } = await supa
      .from("b2b_products")
      .upsert(productPayload, { onConflict: "id" })
      .select()
      .maybeSingle();

    // 2. Dual-engine fallback
    const { data: biz } = await supa
      .from("businesses")
      .select("enabled_modules")
      .eq("id", businessId)
      .maybeSingle();

    const b2bData = biz?.enabled_modules?._b2b_data || {};
    const existing: any[] = Array.isArray(b2bData.products) ? b2bData.products : [];
    const updated = [productPayload, ...existing.filter((p) => p.id !== id)];

    const nextModules = {
      ...(biz?.enabled_modules || {}),
      _b2b_data: {
        ...b2bData,
        products: updated,
        lastUpdated: new Date().toISOString(),
      },
    };

    await supa
      .from("businesses")
      .update({ enabled_modules: nextModules })
      .eq("id", businessId);

    return NextResponse.json({
      ok: true,
      product: tableData || productPayload,
      source: !tableError ? "table" : "modules_fallback",
    });
  } catch (err: any) {
    console.error("POST /api/b2b/products error:", err);
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}
