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
        { error: "Forbidden: Cannot access payments belonging to another business." },
        { status: 403 }
      );
    }

    // 1. Try relational table
    const { data: tableData, error: tableError } = await supa
      .from("b2b_payments")
      .select("*")
      .eq("business_id", businessId)
      .order("date", { ascending: false });

    if (!tableError && tableData) {
      return NextResponse.json({ ok: true, payments: tableData, source: "table" });
    }

    // 2. Dual-engine fallback
    const { data: biz } = await supa
      .from("businesses")
      .select("enabled_modules")
      .eq("id", businessId)
      .maybeSingle();

    const payments = biz?.enabled_modules?._b2b_data?.payments || [];
    return NextResponse.json({ ok: true, payments, source: "modules_fallback" });
  } catch (err: any) {
    console.error("GET /api/b2b/payments error:", err);
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
        { error: "Forbidden: Cannot record payments for another business." },
        { status: 403 }
      );
    }

    const businessId = targetBizId;
    const id = body.id || `pay-${Date.now()}`;
    const amount = Number(body.amount || 0);

    const paymentPayload = {
      id,
      business_id: businessId,
      date: body.date || new Date().toISOString().split("T")[0],
      client_id: body.clientId || body.client_id || "",
      client_name: body.clientName || body.client_name || "Partner Store",
      amount,
      payment_method: body.paymentMethod || body.payment_method || "UPI",
      reference_no: body.referenceNo || body.reference_no || "",
      notes: body.notes || "",
      allocated_slips: Array.isArray(body.allocatedSlips) ? body.allocatedSlips : [],
      recorded_by: caller.email,
      created_at: new Date().toISOString(),
    };

    // 1. Try relational table insert
    const { data: tableData, error: tableError } = await supa
      .from("b2b_payments")
      .insert(paymentPayload)
      .select()
      .maybeSingle();

    // 2. Also handle updated invoices/slips in dual-engine
    const { data: biz } = await supa
      .from("businesses")
      .select("enabled_modules")
      .eq("id", businessId)
      .maybeSingle();

    const b2bData = biz?.enabled_modules?._b2b_data || {};
    const existingPayments: any[] = Array.isArray(b2bData.payments) ? b2bData.payments : [];
    const updatedPayments = [paymentPayload, ...existingPayments];

    // If updatedInvoices was passed, update their paid balances as well
    let updatedInvoices = b2bData.invoices || [];
    if (Array.isArray(body.updatedInvoices) && body.updatedInvoices.length > 0) {
      const invoiceMap = new Map<string, any>();
      (b2bData.invoices || []).forEach((inv: any) => invoiceMap.set(inv.id, inv));
      body.updatedInvoices.forEach((inv: any) => invoiceMap.set(inv.id, inv));
      updatedInvoices = Array.from(invoiceMap.values());
    }

    const nextModules = {
      ...(biz?.enabled_modules || {}),
      _b2b_data: {
        ...b2bData,
        payments: updatedPayments,
        invoices: updatedInvoices,
        lastUpdated: new Date().toISOString(),
      },
    };

    await supa
      .from("businesses")
      .update({ enabled_modules: nextModules })
      .eq("id", businessId);

    return NextResponse.json({
      ok: true,
      payment: tableData || paymentPayload,
      source: !tableError ? "table" : "modules_fallback",
    });
  } catch (err: any) {
    console.error("POST /api/b2b/payments error:", err);
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}
