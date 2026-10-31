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

    // Also populate primary relational tables so b2b/workspace sees migrated data immediately
    try {
      if (mergedClients.length > 0) {
        await supa.from("b2b_clients").upsert(
          mergedClients.map((c) => ({
            id: c.id || `client-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            business_id: businessId,
            name: c.name || "Partner Store",
            phone: c.phone || "",
            address: c.address || "",
            linked_business_id: c.business_id || null,
            updated_at: new Date().toISOString(),
          })),
          { onConflict: "id" }
        );
      }

      if (mergedProducts.length > 0) {
        await supa.from("b2b_products").upsert(
          mergedProducts.map((p) => {
            const rawPrice = Number(p.selling_price !== undefined ? p.selling_price : (p.rate ?? p.price ?? 0));
            const sPrice = Number.isFinite(rawPrice) ? Math.max(0, rawPrice) : 0;
            const rawCost = Number(p.making_cost !== undefined ? p.making_cost : Math.round(sPrice * 0.42));
            const mCost = Number.isFinite(rawCost) ? Math.max(0, rawCost) : 0;
            return {
              id: String(p.id || `prod-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`),
              business_id: businessId,
              name: p.name || "Bakery Item",
              category: p.category || "General",
              rate: sPrice,
              selling_price: sPrice,
              making_cost: mCost,
              unit_profit: sPrice - mCost,
              profit_margin_pct: sPrice > 0 ? Math.round(((sPrice - mCost) / sPrice) * 100) : 0,
              unit: p.unit || "Unit",
              is_active: p.is_active !== undefined ? Boolean(p.is_active) : true,
              min_order_qty: Number(p.min_order_qty || 1),
              stock_available: Number(p.stock_available || 0),
              updated_at: new Date().toISOString(),
            };
          }),
          { onConflict: "id" }
        );
      }

      if (mergedInvoices.length > 0) {
        await supa.from("b2b_dispatches").upsert(
          mergedInvoices.map((inv) => {
            const total = Number(inv.totalAmount ?? inv.total_amount ?? 0);
            const paid = Number(inv.paidAmount ?? inv.paid_amount ?? 0);
            const due = Number(inv.balanceDue ?? inv.balance_due ?? Math.max(0, total - paid));
            const slipNum = inv.invoiceNumber || inv.slip_number || `SLIP-${inv.id || Date.now()}`;
            return {
              id: inv.id || slipNum,
              business_id: businessId,
              slip_number: slipNum,
              date: inv.date || (inv.created_at ? inv.created_at.split("T")[0] : new Date().toISOString().split("T")[0]),
              client_id: inv.clientId || inv.client_id || "",
              client_name: inv.customerName || inv.client_name || "Partner Store",
              client_phone: inv.customerPhone || inv.client_phone || "",
              client_address: inv.customerAddress || inv.client_address || "",
              items: Array.isArray(inv.items) ? inv.items : [],
              subtotal: total,
              tax_amount: 0,
              total_amount: total,
              paid_amount: paid,
              balance_due: due,
              status: due <= 0 ? "paid" : "pending",
              delivery_status: "dispatched",
              notes: inv.notes || "",
              updated_at: new Date().toISOString(),
            };
          }),
          { onConflict: "id" }
        );
      }

      if (mergedExpenses.length > 0) {
        await supa.from("b2b_expenses").upsert(
          mergedExpenses.map((exp: any) => ({
            id: exp.id || `exp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            business_id: businessId,
            date: exp.date || (exp.createdAt ? exp.createdAt.split("T")[0] : new Date().toISOString().split("T")[0]),
            name: exp.name || "Bakery Operating Expense",
            category: exp.category || "Raw Materials & Supplies",
            amount: Number(exp.amount || 0),
            notes: exp.notes || "",
            created_at: exp.createdAt || new Date().toISOString(),
          })),
          { onConflict: "id" }
        );
      }

      if (mergedPayments.length > 0) {
        await supa.from("b2b_payments").upsert(
          mergedPayments.map((p: any) => ({
            id: p.id || `pay-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            business_id: businessId,
            date: p.date || (p.createdAt ? p.createdAt.split("T")[0] : new Date().toISOString().split("T")[0]),
            client_id: p.clientId || p.client_id || "",
            client_name: p.clientName || p.client_name || p.storeName || "Partner Store",
            amount: Number(p.amount || 0),
            payment_method: p.paymentMethod || p.payment_method || p.paymentMode || "UPI",
            reference_no: p.referenceNo || p.reference_no || p.invoiceNumber || "",
            notes: p.notes || "",
            allocated_slips: Array.isArray(p.allocatedSlips) ? p.allocatedSlips : [],
            recorded_by: caller.email,
            created_at: p.createdAt || new Date().toISOString(),
          })),
          { onConflict: "id" }
        );
      }
    } catch (syncErr) {
      console.warn("Relational table sync in /api/migrate fallback:", syncErr);
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
