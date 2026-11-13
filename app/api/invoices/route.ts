import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/serverAuth";

export const dynamic = "force-dynamic";

/**
 * Normalizes input date to standard YYYY-MM-DD format for SQL DATE column
 */
function toSqlDate(input: any): string | null {
  if (!input) return null;
  const str = String(input).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  return null;
}

export async function GET(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    if ("errorResponse" in auth) {
      return auth.errorResponse;
    }

    const { user: caller, supa } = auth;
    const { searchParams } = new URL(req.url);
    const requestedBizId = searchParams.get("business_id");
    const requestedSource = searchParams.get("source") || "corporate";

    if (requestedBizId && requestedBizId !== "default" && requestedBizId !== caller.businessId) {
      return NextResponse.json(
        { error: "Forbidden: Cannot access invoices belonging to another business." },
        { status: 403 }
      );
    }

    const businessId = caller.businessId;

    // 1. Query relational invoices table strictly for corporate / generator invoices
    let query = supa
      .from("invoices")
      .select("*")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false });

    if (requestedSource === "corporate") {
      query = query.in("source", ["corporate", "cafe_pos"]);
    } else if (requestedSource !== "all") {
      query = query.eq("source", requestedSource);
    }

    const { data: tableData, error: tableError } = await query;

    if (!tableError && tableData && tableData.length > 0) {
      return NextResponse.json({ ok: true, invoices: tableData, source: "table" });
    }

    // Also check fallback storage: businesses.enabled_modules._invoices via user-scoped RLS client
    let storedFromFallback: any[] = [];
    try {
      const { data: biz } = await supa
        .from("businesses")
        .select("enabled_modules")
        .eq("id", businessId)
        .maybeSingle();

      const allStoredInvoices: any[] = biz?.enabled_modules?._invoices || [];
      storedFromFallback = allStoredInvoices.filter((inv: any) => {
        const src = inv.source || "corporate";
        if (requestedSource === "corporate") {
          return src === "corporate" || src === "cafe_pos";
        }
        if (requestedSource !== "all") {
          return src === requestedSource;
        }
        return true;
      });
    } catch (fbErr) {
      console.warn("Could not read fallback _invoices:", fbErr);
    }

    // If table returned data (even 0 rows) and no error, merge any unique fallback items
    if (!tableError && tableData) {
      const existingIds = new Set(tableData.map((t: any) => String(t.id)));
      const extraFallback = storedFromFallback.filter((f) => !existingIds.has(String(f.id)));
      const combined = [...tableData, ...extraFallback];
      return NextResponse.json({ ok: true, invoices: combined, source: extraFallback.length > 0 ? "merged" : "table" });
    }

    // If table had an error, return whatever is in fallback
    return NextResponse.json({ ok: true, invoices: storedFromFallback, source: "modules_fallback" });
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

    if (body.business_id && body.business_id !== "default" && body.business_id !== caller.businessId) {
      return NextResponse.json(
        { error: "Forbidden: Cannot create invoices for another business." },
        { status: 403 }
      );
    }

    const businessId = caller.businessId;
    const invoiceId = body.id || `inv-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const invoiceNumber = body.invoiceNumber || body.invoice_number || `INV-${Date.now().toString().slice(-6)}`;

    // Normalize date strings into valid SQL DATE YYYY-MM-DD
    const sqlDate = toSqlDate(body.date || body.invoice_date) || new Date().toISOString().split("T")[0];
    const sqlDueDate = toSqlDate(body.dueDate || body.due_date);

    const subtotalVal = Number(body.subtotal ?? (body.subtotal_cents ? body.subtotal_cents / 100 : 0));
    const taxRateVal = Number(body.taxRate ?? body.tax_rate ?? 0);
    const taxAmountVal = Number(body.taxAmount ?? (body.tax_cents ? body.tax_cents / 100 : 0));
    const tdsAmountVal = Number(body.tdsAmount ?? (body.tds_cents ? body.tds_cents / 100 : 0));
    const discountAmountVal = Number(body.discountAmount ?? (body.discount_cents ? body.discount_cents / 100 : 0));
    const totalAmountVal = Number(body.totalAmount ?? body.total_amount ?? (body.total_cents ? body.total_cents / 100 : subtotalVal + taxAmountVal));
    const paidAmountVal = Number(body.paidAmount ?? body.paid_amount ?? 0);
    const balanceDueVal = Number(body.balanceDue ?? body.balance_due ?? Math.max(0, totalAmountVal - paidAmountVal));

    // Universal invoice payload mapped for postgres invoices table
    const invoicePayload: Record<string, any> = {
      id: invoiceId,
      business_id: businessId,
      invoice_number: invoiceNumber,
      title: body.title || "TAX INVOICE",
      date: sqlDate,
      due_date: sqlDueDate,
      customer_name: body.customerName || body.customer_name || "Walk-in Customer",
      customer_phone: body.customerPhone || body.customer_phone || "",
      customer_address: body.customerAddress || body.customer_address || "",
      customer_gstin: body.customerGstin || body.customer_gstin || "",
      items: Array.isArray(body.items) ? body.items : [],
      subtotal: subtotalVal,
      tax_rate: taxRateVal,
      tax_amount: taxAmountVal,
      tds_amount: tdsAmountVal,
      discount_amount: discountAmountVal,
      total_amount: totalAmountVal,
      paid_amount: paidAmountVal,
      balance_due: balanceDueVal,
      status: body.status || "pending",
      payment_mode: body.paymentMode || body.payment_mode || "UPI",
      notes: body.notes || "",
      bank_details: body.bankDetails || body.bank_details || null,
      upi_details: body.upiDetails || body.upi_details || null,
      source: body.source || "corporate",
      updated_at: new Date().toISOString(),
    };

    // 1. Try relational table upsert using caller RLS client
    const { data: tableData, error: tableError } = await supa
      .from("invoices")
      .upsert(invoicePayload, { onConflict: "id" })
      .select()
      .maybeSingle();

    if (!tableError) {
      return NextResponse.json({ ok: true, invoice: tableData || invoicePayload, source: "table" });
    }

    // 2. Fallback: save into businesses.enabled_modules._invoices via user-scoped RLS client
    try {
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
    } catch (fbErr: any) {
      console.error("Fallback modules update failed:", fbErr);
      return NextResponse.json({ error: tableError?.message || fbErr?.message || "Failed to save invoice" }, { status: 500 });
    }
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

    if (requestedBizId && requestedBizId !== "default" && requestedBizId !== caller.businessId) {
      return NextResponse.json(
        { error: "Forbidden: Cannot delete invoices of another business." },
        { status: 403 }
      );
    }

    const businessId = caller.businessId;

    if (!id) {
      return NextResponse.json({ error: "Invoice id is required." }, { status: 400 });
    }

    // 1. Delete from invoices table using user-scoped RLS client
    await supa
      .from("invoices")
      .delete()
      .eq("id", id)
      .eq("business_id", businessId);

    // 2. Also ensure it's removed from fallback storage using user-scoped RLS client
    try {
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
    } catch {}

    return NextResponse.json({ ok: true, deletedId: id });
  } catch (err: any) {
    console.error("DELETE /api/invoices error:", err);
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}
