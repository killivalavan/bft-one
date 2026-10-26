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
        { error: "Forbidden: Cannot access invoices belonging to another business." },
        { status: 403 }
      );
    }

    // 1. Try primary relational invoices table
    const { data: tableData, error: tableError } = await supa
      .from("invoices")
      .select("*")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false });

    if (!tableError && tableData) {
      return NextResponse.json({ ok: true, invoices: tableData, source: "table" });
    }

    // 2. Dual-engine fallback: businesses.enabled_modules._invoices or _b2b_data.invoices
    const { data: biz, error: bizError } = await supa
      .from("businesses")
      .select("enabled_modules")
      .eq("id", businessId)
      .maybeSingle();

    if (bizError) {
      return NextResponse.json({ error: bizError.message }, { status: 500 });
    }

    const storedInvoices =
      biz?.enabled_modules?._invoices ||
      biz?.enabled_modules?._b2b_data?.invoices ||
      [];

    return NextResponse.json({ ok: true, invoices: storedInvoices, source: "modules_fallback" });
  } catch (err: any) {
    console.error("GET /api/invoices error:", err);
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
        { error: "Forbidden: Cannot create invoices for another business." },
        { status: 403 }
      );
    }

    const businessId = targetBizId;
    const invoiceId = body.id || `inv-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const invoiceNumber = body.invoiceNumber || body.invoice_number || `INV-${Date.now().toString().slice(-6)}`;

    // Normalize invoice payload
    const invoicePayload = {
      id: invoiceId,
      business_id: businessId,
      invoice_number: invoiceNumber,
      title: body.title || "TAX INVOICE",
      date: body.date || new Date().toISOString().split("T")[0],
      due_date: body.dueDate || body.due_date || null,
      customer_name: body.customerName || body.customer_name || "Walk-in Customer",
      customer_phone: body.customerPhone || body.customer_phone || "",
      customer_address: body.customerAddress || body.customer_address || "",
      customer_gstin: body.customerGstin || body.customer_gstin || "",
      items: Array.isArray(body.items) ? body.items : [],
      subtotal: Number(body.subtotal || body.subtotal_cents ? (body.subtotal_cents / 100) : 0),
      tax_rate: Number(body.taxRate || body.tax_rate || 0),
      tax_amount: Number(body.taxAmount || body.tax_cents ? (body.tax_cents / 100) : 0),
      tds_amount: Number(body.tdsAmount || body.tds_cents ? (body.tds_cents / 100) : 0),
      discount_amount: Number(body.discountAmount || 0),
      total_amount: Number(body.totalAmount || body.total_amount || (body.total_cents ? (body.total_cents / 100) : 0)),
      paid_amount: Number(body.paidAmount || body.paid_amount || 0),
      balance_due: Number(body.balanceDue || body.balance_due || (body.totalAmount || body.total_amount || 0)),
      status: body.status || "pending",
      payment_mode: body.paymentMode || body.payment_mode || "UPI",
      notes: body.notes || "",
      bank_details: body.bankDetails || body.bank_details || null,
      upi_details: body.upiDetails || body.upi_details || null,
      source: body.source || "cafe_pos",
      updated_at: new Date().toISOString(),
    };

    // 1. Try relational table upsert
    const { data: tableData, error: tableError } = await supa
      .from("invoices")
      .upsert(invoicePayload, { onConflict: "id" })
      .select()
      .maybeSingle();

    if (!tableError) {
      return NextResponse.json({ ok: true, invoice: tableData || invoicePayload, source: "table" });
    }

    // 2. Dual-engine fallback: save into businesses.enabled_modules._invoices
    const { data: biz } = await supa
      .from("businesses")
      .select("enabled_modules")
      .eq("id", businessId)
      .maybeSingle();

    const existing: any[] = Array.isArray(biz?.enabled_modules?._invoices)
      ? biz.enabled_modules._invoices
      : [];

    const updated = [
      invoicePayload,
      ...existing.filter((inv) => inv.id !== invoicePayload.id),
    ];

    const nextModules = {
      ...(biz?.enabled_modules || {}),
      _invoices: updated,
    };

    const { error: updateError } = await supa
      .from("businesses")
      .update({ enabled_modules: nextModules })
      .eq("id", businessId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, invoice: invoicePayload, source: "modules_fallback" });
  } catch (err: any) {
    console.error("POST /api/invoices error:", err);
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    if ("errorResponse" in auth) {
      return auth.errorResponse;
    }

    const { user: caller, supa } = auth;
    const { searchParams } = new URL(req.url);
    const requestedBizId = searchParams.get("business_id");
    const id = searchParams.get("id");

    const businessId = requestedBizId && requestedBizId !== "default"
      ? requestedBizId
      : caller.businessId;

    if (!caller.isSuperAdmin && businessId !== caller.businessId) {
      return NextResponse.json(
        { error: "Forbidden: Cannot delete invoices of another business." },
        { status: 403 }
      );
    }

    if (!id) {
      return NextResponse.json({ error: "Invoice id is required." }, { status: 400 });
    }

    // 1. Try table delete
    const { error: tableError } = await supa
      .from("invoices")
      .delete()
      .eq("id", id)
      .eq("business_id", businessId);

    if (!tableError) {
      return NextResponse.json({ ok: true, deletedId: id, source: "table" });
    }

    // 2. Fallback: filter out of businesses.enabled_modules._invoices
    const { data: biz } = await supa
      .from("businesses")
      .select("enabled_modules")
      .eq("id", businessId)
      .maybeSingle();

    const existing: any[] = Array.isArray(biz?.enabled_modules?._invoices)
      ? biz.enabled_modules._invoices
      : [];

    const filtered = existing.filter((inv) => inv.id !== id);

    const nextModules = {
      ...(biz?.enabled_modules || {}),
      _invoices: filtered,
    };

    await supa
      .from("businesses")
      .update({ enabled_modules: nextModules })
      .eq("id", businessId);

    return NextResponse.json({ ok: true, deletedId: id, source: "modules_fallback" });
  } catch (err: any) {
    console.error("DELETE /api/invoices error:", err);
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}
