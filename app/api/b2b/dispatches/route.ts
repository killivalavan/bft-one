import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/serverAuth";
import { normalizeDispatch } from "@/lib/utils/b2bSlipWhatsapp";

export const dynamic = "force-dynamic";

export { normalizeDispatch };

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
        { error: "Forbidden: Cannot access dispatches belonging to another business." },
        { status: 403 }
      );
    }

    // 1. Try relational table
    const { data: tableData, error: tableError } = await supa
      .from("b2b_dispatches")
      .select("*")
      .eq("business_id", businessId)
      .order("date", { ascending: false });

    if (!tableError && tableData) {
      return NextResponse.json({ ok: true, dispatches: tableData.map(normalizeDispatch), source: "table" });
    }

    // 2. Dual-engine fallback
    const { data: biz } = await supa
      .from("businesses")
      .select("enabled_modules")
      .eq("id", businessId)
      .maybeSingle();

    const dispatches = biz?.enabled_modules?._b2b_data?.invoices || [];
    return NextResponse.json({ ok: true, dispatches: dispatches.map(normalizeDispatch), source: "modules_fallback" });
  } catch (err: any) {
    console.error("GET /api/b2b/dispatches error:", err);
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
        { error: "Forbidden: Cannot create dispatches for another business." },
        { status: 403 }
      );
    }

    const businessId = targetBizId;
    const id = body.id || `inv-disp-${Date.now()}`;
    const slipNumber = body.invoiceNumber || body.slip_number || `SLIP-${Date.now().toString().slice(-5)}`;

    const items = Array.isArray(body.items) ? body.items : [];
    const rawTotal = Number(body.totalAmount || body.total_amount || 0);
    const paidAmount = Number(body.paidAmount || body.paid_amount || 0);

    const isReturn = Boolean(
      body.isReturn ||
      body.is_return ||
      slipNumber.startsWith("RET-") ||
      (body.title || "").includes("RETURN") ||
      rawTotal < 0
    );

    const totalAmount = isReturn ? -Math.abs(rawTotal) : Math.abs(rawTotal);
    const balanceDue = isReturn ? -Math.abs(totalAmount) : Math.max(0, totalAmount - paidAmount);
    const status = isReturn ? "unpaid" : (balanceDue <= 0 ? "paid" : "pending");

    const dispatchPayload = {
      id,
      business_id: businessId,
      slip_number: slipNumber,
      date: body.date || new Date().toISOString().split("T")[0],
      due_date: body.dueDate || null,
      client_id: body.clientId || body.client_id || "",
      client_name: body.customerName || body.client_name || "Partner Store",
      client_phone: body.customerPhone || body.client_phone || "",
      client_address: body.customerAddress || body.client_address || "",
      items,
      subtotal: totalAmount,
      tax_amount: 0,
      total_amount: totalAmount,
      paid_amount: paidAmount,
      balance_due: balanceDue,
      status,
      delivery_status: body.deliveryStatus || (isReturn ? "returned" : "dispatched"),
      notes: body.notes || "",
      vehicle_no: body.vehicleNo || "",
      driver_name: body.driverName || "",
      updated_at: new Date().toISOString(),
    };

    // 1. Try relational table upsert
    const { data: tableData, error: tableError } = await supa
      .from("b2b_dispatches")
      .upsert(dispatchPayload, { onConflict: "id" })
      .select()
      .maybeSingle();

    if (!tableError) {
      return NextResponse.json({ ok: true, dispatch: normalizeDispatch(tableData || dispatchPayload), source: "table" });
    }

    // 2. Dual-engine fallback: businesses.enabled_modules._b2b_data.invoices
    const { data: biz } = await supa
      .from("businesses")
      .select("enabled_modules")
      .eq("id", businessId)
      .maybeSingle();

    const b2bData = biz?.enabled_modules?._b2b_data || {};
    const existing: any[] = Array.isArray(b2bData.invoices) ? b2bData.invoices : [];

    // Also format in the shape expected by B2B UI components
    const legacyUiRecord = {
      ...dispatchPayload,
      invoiceNumber: slipNumber,
      customerName: dispatchPayload.client_name,
      customerPhone: dispatchPayload.client_phone,
      isReturn,
      totalAmount,
      paidAmount,
      balanceDue,
    };

    const updatedInvoices = [
      legacyUiRecord,
      ...existing.filter((item) => item.id !== id && item.invoiceNumber !== slipNumber),
    ];

    const nextModules = {
      ...(biz?.enabled_modules || {}),
      _b2b_data: {
        ...b2bData,
        invoices: updatedInvoices,
        lastUpdated: new Date().toISOString(),
      },
    };

    const { error: updateError } = await supa
      .from("businesses")
      .update({ enabled_modules: nextModules })
      .eq("id", businessId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, dispatch: normalizeDispatch(legacyUiRecord), source: "modules_fallback" });
  } catch (err: any) {
    console.error("POST /api/b2b/dispatches error:", err);
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}
