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
        { error: "Forbidden: Cannot access expenses of another business." },
        { status: 403 }
      );
    }

    // 1. Try relational table
    const { data: tableData, error: tableError } = await supa
      .from("b2b_expenses")
      .select("*")
      .eq("business_id", businessId)
      .order("date", { ascending: false });

    if (!tableError && tableData && tableData.length > 0) {
      return NextResponse.json({ ok: true, expenses: tableData, source: "table" });
    }

    // 2. Fallback to daily_expenses if b2b_expenses has no records yet
    const { data: dailyExp } = await supa
      .from("daily_expenses")
      .select("*")
      .eq("business_id", businessId)
      .order("expense_date", { ascending: false });

    if (dailyExp && dailyExp.length > 0) {
      const mapped = dailyExp.map((d: any) => ({
        id: d.id,
        business_id: businessId,
        date: d.expense_date,
        name: d.item_name || "Bakery Operating Expense",
        category: d.item_name?.toLowerCase().includes("box") ? "Packaging & Boxes" : "Raw Materials & Supplies",
        amount: ((Number(d.price_cents) || 0) * (Number(d.quantity) || 1)) / 100,
        notes: "Auto-synced from daily_expenses",
        created_at: d.created_at,
      }));
      supa.from("b2b_expenses").upsert(mapped, { onConflict: "id" }).then(() => {});
      return NextResponse.json({ ok: true, expenses: mapped, source: "daily_expenses_fallback" });
    }

    // 2. Dual-engine fallback
    const { data: biz } = await supa
      .from("businesses")
      .select("enabled_modules")
      .eq("id", businessId)
      .maybeSingle();

    const expenses = biz?.enabled_modules?._b2b_data?.expenses || [];
    return NextResponse.json({ ok: true, expenses, source: "modules_fallback" });
  } catch (err: any) {
    console.error("GET /api/b2b/expenses error:", err);
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
        { error: "Forbidden: Cannot record expenses for another business." },
        { status: 403 }
      );
    }

    const businessId = targetBizId;
    const id = body.id || `exp-${Date.now()}`;
    const expensePayload = {
      id,
      business_id: businessId,
      date: body.date || new Date().toISOString().split("T")[0],
      name: body.name?.trim() || "Bakery Operating Expense",
      category: body.category || "Raw Materials",
      amount: Number(body.amount || 0),
      notes: body.notes || "",
      created_at: new Date().toISOString(),
    };

    // 1. Try relational table insert
    const { data: tableData, error: tableError } = await supa
      .from("b2b_expenses")
      .insert(expensePayload)
      .select()
      .maybeSingle();

    // 2. Dual-engine fallback
    const { data: biz } = await supa
      .from("businesses")
      .select("enabled_modules")
      .eq("id", businessId)
      .maybeSingle();

    const b2bData = biz?.enabled_modules?._b2b_data || {};
    const existing: any[] = Array.isArray(b2bData.expenses) ? b2bData.expenses : [];
    const updated = [expensePayload, ...existing.filter((e) => e.id !== id)];

    const nextModules = {
      ...(biz?.enabled_modules || {}),
      _b2b_data: {
        ...b2bData,
        expenses: updated,
        lastUpdated: new Date().toISOString(),
      },
    };

    await supa
      .from("businesses")
      .update({ enabled_modules: nextModules })
      .eq("id", businessId);

    return NextResponse.json({
      ok: true,
      expense: tableData || expensePayload,
      source: !tableError ? "table" : "modules_fallback",
    });
  } catch (err: any) {
    console.error("POST /api/b2b/expenses error:", err);
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}
