import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/serverAuth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const auth = await authenticateRequest(req, { requireAdmin: true });
    if ("errorResponse" in auth) {
      return auth.errorResponse;
    }

    const { user: caller, supa } = auth;
    const body = await req.json().catch(() => ({}));

    const targetBizId = body.business_id && body.business_id !== "default"
      ? body.business_id
      : caller.businessId;

    if (!targetBizId) {
      return NextResponse.json({ error: "Missing tenant business identifier" }, { status: 400 });
    }

    if (!caller.isSuperAdmin && targetBizId !== caller.businessId) {
      return NextResponse.json(
        { error: "Forbidden: Cannot migrate data into another business." },
        { status: 403 }
      );
    }

    const businessId = targetBizId;
    const { invoices, products, payments, expenses, broadcasts, customers } = body;

    const { data: biz } = await supa
      .from("businesses")
      .select("enabled_modules")
      .eq("id", businessId)
      .maybeSingle();

    const currentModules = biz?.enabled_modules || {};
    const b2bData = currentModules._b2b_data || {};

    // 1. Idempotently merge Invoices
    const existingInvoices: any[] = Array.isArray(b2bData.invoices) ? b2bData.invoices : [];
    const invMap = new Map<string, any>();
    existingInvoices.forEach((inv) => invMap.set(inv.id || inv.invoiceNumber, inv));
    if (Array.isArray(invoices)) {
      invoices.forEach((inv) => {
        const key = inv.id || inv.invoiceNumber;
        if (key && !invMap.has(key)) invMap.set(key, inv);
      });
    }

    // 2. Idempotently merge Products
    const existingProducts: any[] = Array.isArray(b2bData.products) ? b2bData.products : [];
    const prodMap = new Map<string, any>();
    existingProducts.forEach((p) => prodMap.set(p.name?.toLowerCase().trim() || p.id, p));
    if (Array.isArray(products)) {
      products.forEach((p) => {
        const key = p.name?.toLowerCase().trim() || p.id;
        if (key && !prodMap.has(key)) prodMap.set(key, p);
      });
    }

    // 3. Idempotently merge Customers / Partner Stores
    const existingClients: any[] = Array.isArray(currentModules._b2b_clients) ? currentModules._b2b_clients : [];
    const clientMap = new Map<string, any>();
    existingClients.forEach((c) => clientMap.set(c.name?.toLowerCase().trim() || c.id, c));
    if (Array.isArray(customers)) {
      customers.forEach((c) => {
        const key = c.name?.toLowerCase().trim() || c.id;
        if (key && !clientMap.has(key)) clientMap.set(key, c);
      });
    }

    // 4. Payments, Expenses, Broadcasts
    const mergedInvoices = Array.from(invMap.values());
    const mergedProducts = Array.from(prodMap.values());
    const mergedClients = Array.from(clientMap.values());
    const mergedPayments = Array.isArray(payments) && payments.length > 0 ? payments : (b2bData.payments || []);
    const mergedExpenses = Array.isArray(expenses) && expenses.length > 0 ? expenses : (b2bData.expenses || []);
    const mergedBroadcasts = Array.isArray(broadcasts) && broadcasts.length > 0 ? broadcasts : (b2bData.broadcasts || []);

    const nextModules = {
      ...currentModules,
      _b2b_clients: mergedClients,
      _b2b_data: {
        invoices: mergedInvoices,
        products: mergedProducts,
        payments: mergedPayments,
        expenses: mergedExpenses,
        broadcasts: mergedBroadcasts,
        lastMigratedAt: new Date().toISOString(),
      },
    };

    const { error: updateError } = await supa
      .from("businesses")
      .update({ enabled_modules: nextModules })
      .eq("id", businessId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      message: "Idempotent migration successfully completed",
      counts: {
        invoices: mergedInvoices.length,
        products: mergedProducts.length,
        clients: mergedClients.length,
        payments: mergedPayments.length,
        expenses: mergedExpenses.length,
        broadcasts: mergedBroadcasts.length,
      },
    });
  } catch (err: any) {
    console.error("POST /api/migrate error:", err);
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}
