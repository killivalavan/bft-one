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
        { error: "Forbidden: Cannot access B2B workspace belonging to another business." },
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

    function sanitizeInvoice(inv: any) {
      const rawTotal = Number(inv.totalAmount !== undefined && inv.totalAmount !== null ? inv.totalAmount : (inv.total_amount ?? 0));
      const totalAmount = Number.isFinite(rawTotal) ? rawTotal : 0;

      const rawPaid = Number(inv.paidAmount !== undefined && inv.paidAmount !== null ? inv.paidAmount : (inv.paid_amount ?? 0));
      const paidAmount = Number.isFinite(rawPaid) ? rawPaid : 0;

      const rawDue = Number(inv.balanceDue !== undefined && inv.balanceDue !== null ? inv.balanceDue : (inv.balance_due ?? (totalAmount - paidAmount)));
      const balanceDue = Number.isFinite(rawDue) ? rawDue : Math.max(0, totalAmount - paidAmount);

      const customerName = inv.customerName || inv.client_name || inv.customer_name || "Partner Store";
      const invoiceNumber = inv.invoiceNumber || inv.slip_number || inv.invoice_number || `SLIP-${inv.id || "0"}`;
      const customerPhone = inv.customerPhone || inv.client_phone || inv.customer_phone || "";
      const customerAddress = inv.customerAddress || inv.client_address || inv.customer_address || "";
      const clientId = inv.clientId || inv.client_id || "";

      const rawStatus = String(inv.status || "").toLowerCase();
      const status = (rawStatus === "paid" || balanceDue <= 0) ? "paid" : "unpaid";

      const isReturn = Boolean(
        inv.isReturn ||
        (invoiceNumber || "").startsWith("RET-") ||
        (inv.title || "").includes("RETURN") ||
        totalAmount < 0
      );

      return {
        ...inv,
        id: inv.id || invoiceNumber,
        invoiceNumber,
        slip_number: invoiceNumber,
        customerName,
        client_name: customerName,
        customerPhone,
        client_phone: customerPhone,
        customerAddress,
        client_address: customerAddress,
        clientId,
        client_id: clientId,
        totalAmount,
        total_amount: totalAmount,
        paidAmount,
        paid_amount: paidAmount,
        balanceDue,
        balance_due: balanceDue,
        status,
        isReturn,
        title: inv.title || (isReturn ? "RETURN & CREDIT SLIP" : "DELIVERY SLIP"),
        date: inv.date || inv.invoice_date || (inv.created_at ? inv.created_at.split("T")[0] : new Date().toISOString().split("T")[0]),
        items: Array.isArray(inv.items)
          ? inv.items.map((it: any) => {
              const qty = Number(it.qty || 0);
              const rate = Number(it.rate ?? it.price ?? 0);
              const rawAmount = Number(it.amount !== undefined ? it.amount : qty * rate);
              return {
                ...it,
                qty: Number.isFinite(qty) ? qty : 0,
                rate: Number.isFinite(rate) ? rate : 0,
                amount: Number.isFinite(rawAmount) ? rawAmount : 0,
              };
            })
          : [],
      };
    }

    // 1. Check primary relational tables
    const [dispatchesRes, productsRes, paymentsRes, expensesRes, broadcastsRes, clientsRes] = await Promise.all([
      supa.from("b2b_dispatches").select("*").eq("business_id", businessId).order("date", { ascending: false }),
      supa.from("b2b_products").select("*").eq("business_id", businessId),
      supa.from("b2b_payments").select("*").eq("business_id", businessId).order("date", { ascending: false }),
      supa.from("b2b_expenses").select("*").eq("business_id", businessId).order("date", { ascending: false }),
      supa.from("b2b_broadcasts").select("*").eq("business_id", businessId).order("created_at", { ascending: false }),
      supa.from("b2b_clients").select("*").eq("business_id", businessId),
    ]);

    const hasTables = !dispatchesRes.error && !productsRes.error;

    if (hasTables) {
      return NextResponse.json({
        ok: true,
        source: "relational_tables",
        invoices: (dispatchesRes.data || []).map(sanitizeInvoice),
        products: (productsRes.data || []).map(normalizeProduct),
        payments: paymentsRes.data || [],
        expenses: expensesRes.data || [],
        broadcasts: broadcastsRes.data || [],
        stores: clientsRes.data || [],
      });
    }

    // 2. Dual-engine fallback: businesses.enabled_modules._b2b_data & _b2b_clients
    const { data: biz, error: bizError } = await supa
      .from("businesses")
      .select("enabled_modules")
      .eq("id", businessId)
      .maybeSingle();

    if (bizError) {
      return NextResponse.json({ error: bizError.message }, { status: 500 });
    }

    const b2bData = biz?.enabled_modules?._b2b_data || {};
    const stores = biz?.enabled_modules?._b2b_clients || [];

    return NextResponse.json({
      ok: true,
      source: "modules_fallback",
      invoices: (b2bData.invoices || []).map(sanitizeInvoice),
      products: (b2bData.products || []).map(normalizeProduct),
      payments: b2bData.payments || [],
      expenses: b2bData.expenses || [],
      broadcasts: b2bData.broadcasts || [],
      stores,
    });
  } catch (err: any) {
    console.error("GET /api/b2b/workspace error:", err);
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}
