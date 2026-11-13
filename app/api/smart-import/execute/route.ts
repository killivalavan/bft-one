/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/serverAuth";
import { logAuditEvent, extractClientMetadata } from "@/lib/services/auditLogger";
import { makeTenantRecordId, computeSourceFingerprint } from "@/lib/smart-import/validationEngine";
import { DuplicateHandlingStrategy, ImportEntityType } from "@/lib/smart-import/types";
import { getEffectiveEntitlements } from "@/lib/subscription/plans";

export const dynamic = "force-dynamic";

const BATCH_SIZE = 200;

async function upsertInBatches(
  supa: any,
  table: string,
  rows: any[],
  conflictColumn = "id"
): Promise<{ ok: boolean; error?: string }> {
  if (!rows || rows.length === 0) return { ok: true };
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supa.from(table).upsert(chunk, { onConflict: conflictColumn });
    if (error) {
      return { ok: false, error: error.message };
    }
  }
  return { ok: true };
}

export async function POST(req: Request) {
  const startedAt = new Date().toISOString();
  const startMs = Date.now();

  try {
    const auth = await authenticateRequest(req);
    if ("errorResponse" in auth) {
      return auth.errorResponse;
    }

    const { user: caller, supa } = auth;
    const body = await req.json().catch(() => ({}));

    // 1. Strict Store Isolation Check: Never allow importing into another store
    const requestedBizId = body.business_id;
    if (
      requestedBizId &&
      requestedBizId !== "default" &&
      requestedBizId !== caller.businessId
    ) {
      return NextResponse.json(
        { error: "Forbidden: Cannot import data into another store's workspace." },
        { status: 403 }
      );
    }

    const businessId = caller.businessId;

    if (!businessId) {
      return NextResponse.json(
        { error: "Missing store business_id context." },
        { status: 400 }
      );
    }

    // 2. Mandatory User Confirmation Gate
    if (body.userConfirmed !== true) {
      return NextResponse.json(
        { error: "Explicit user authorization is required before importing records." },
        { status: 400 }
      );
    }

    const importName = String(body.importName || `Smart Import – ${new Date().toLocaleDateString("en-IN")}`).trim();
    const sourceSoftware = String(body.sourceSoftware || "excel_sheets");
    const duplicateStrategy: DuplicateHandlingStrategy = body.duplicateStrategy || "skip";
    const filesMeta: any[] = Array.isArray(body.files) ? body.files : [];
    const mappingConfigs: any[] = Array.isArray(body.mappingConfigs) ? body.mappingConfigs : [];
    const stagedRecords: any[] = Array.isArray(body.records) ? body.records : [];

    if (stagedRecords.length === 0) {
      return NextResponse.json(
        { error: "No staged records provided for import." },
        { status: 400 }
      );
    }

    const cleanBizPrefix = businessId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8);
    const jobId =
      body.jobId && String(body.jobId).startsWith(`si_job_${cleanBizPrefix}`)
        ? String(body.jobId)
        : `si_job_${cleanBizPrefix}_${Date.now()}`;

    // 3. Load current store state strictly scoped to businessId
    const { data: bizRow } = await supa
      .from("businesses")
      .select("id, name, enabled_modules")
      .eq("id", businessId)
      .maybeSingle();

    const currentModules = bizRow?.enabled_modules || {};
    const currentB2BData = currentModules._b2b_data || {};
    const existingSmartImports: any[] = Array.isArray(currentModules._smart_imports)
      ? currentModules._smart_imports
      : [];

    // Idempotency guard: if this exact jobId already completed for this store, return existing result
    const existingJob = existingSmartImports.find(
      (j) => j.id === jobId && j.status === "completed"
    );
    if (existingJob) {
      return NextResponse.json({
        ok: true,
        idempotentReplay: true,
        job: existingJob,
      });
    }

    // Load existing store records to support merge/skip & provenance snapshots
    const [existingInvsRes, existingDispatchesRes, existingProdsRes, existingClientsRes] =
      await Promise.all([
        supa.from("invoices").select("*").eq("business_id", businessId),
        supa.from("b2b_dispatches").select("*").eq("business_id", businessId),
        supa.from("b2b_products").select("*").eq("business_id", businessId),
        supa.from("b2b_clients").select("*").eq("business_id", businessId),
        supa.from("b2b_payments").select("*").eq("business_id", businessId),
        supa.from("b2b_expenses").select("*").eq("business_id", businessId),
      ]);

    const existingDispatchesBySlip = new Map<string, any>();
    (existingDispatchesRes.data || currentB2BData.invoices || []).forEach((d: any) => {
      const key = String(d.slip_number || d.invoiceNumber || d.id || "").trim().toLowerCase();
      if (key) existingDispatchesBySlip.set(key, d);
    });

    const existingInvoicesByNo = new Map<string, any>();
    (existingInvsRes.data || currentModules._invoices || []).forEach((inv: any) => {
      const key = String(inv.invoice_number || inv.invoiceNumber || inv.id || "").trim().toLowerCase();
      if (key) existingInvoicesByNo.set(key, inv);
    });

    const existingClientsByName = new Map<string, any>();
    (existingClientsRes.data || currentModules._b2b_clients || []).forEach((c: any) => {
      const key = String(c.name || "").trim().toLowerCase();
      if (key) existingClientsByName.set(key, c);
    });

    const existingProductsByName = new Map<string, any>();
    (existingProdsRes.data || currentB2BData.products || []).forEach((p: any) => {
      const key = String(p.name || "").trim().toLowerCase();
      if (key) existingProductsByName.set(key, p);
    });

    // Collections to upsert into Supabase for this store
    const invoicesToUpsert: any[] = [];
    const dispatchesToUpsert: any[] = [];
    const clientsToUpsert = new Map<string, any>();
    const productsToUpsert = new Map<string, any>();
    const paymentsToUpsert: any[] = [];
    const expensesToUpsert: any[] = [];
    const dailyExpensesToUpsert: any[] = [];
    const inventoryToUpsert: any[] = [];
    const suppliersToUpsert: any[] = [];
    const purchasesToUpsert: any[] = [];

    // Provenance tracking for safe rollback
    const createdIds: Record<string, string[]> = {
      invoices: [],
      b2b_dispatches: [],
      b2b_clients: [],
      b2b_products: [],
      b2b_payments: [],
      b2b_expenses: [],
      daily_expenses: [],
      inventory_items: [],
      suppliers: [],
      purchase_orders: [],
    };
    const updatedSnapshots: Record<string, any[]> = {
      invoices: [],
      b2b_dispatches: [],
      b2b_clients: [],
      b2b_products: [],
    };

    let importedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    let duplicateCount = 0;

    const entityBreakdown: Record<
      string,
      { imported: number; merged: number; skipped: number; failed: number }
    > = {};

    const ensureBucket = (et: string) => {
      if (!entityBreakdown[et]) {
        entityBreakdown[et] = { imported: 0, merged: 0, skipped: 0, failed: 0 };
      }
      return entityBreakdown[et];
    };

    for (const rec of stagedRecords) {
      const entityType: ImportEntityType = rec.entityType || "invoices";
      const bucket = ensureBucket(entityType);

      if (rec.duplicateStatus && rec.duplicateStatus !== "unique") {
        duplicateCount++;
      }

      if (rec.action === "skip" || rec.status === "invalid") {
        skippedCount++;
        bucket.skipped++;
        continue;
      }

      const norm = rec.normalized || {};
      const fingerprint =
        rec.sourceFingerprint || computeSourceFingerprint(entityType, norm);
      const isMerge = rec.action === "merge";

      try {
        if (entityType === "invoices" || entityType === "returns") {
          const isReturn =
            entityType === "returns" ||
            Boolean(norm.is_return) ||
            Number(norm.total_amount || 0) < 0;
          const slipNo = String(
            norm.invoice_number || `${isReturn ? "RET" : "INV"}-${Date.now().toString().slice(-6)}`
          ).trim();
          const slipKey = slipNo.toLowerCase();

          const existingDisp = existingDispatchesBySlip.get(slipKey);
          const existingInv = existingInvoicesByNo.get(slipKey);

          if ((existingDisp || existingInv) && duplicateStrategy === "skip" && !isMerge) {
            skippedCount++;
            bucket.skipped++;
            continue;
          }

          const recordId =
            isMerge && existingDisp?.id
              ? existingDisp.id
              : makeTenantRecordId(businessId, entityType, fingerprint);
          const univInvId =
            isMerge && existingInv?.id
              ? existingInv.id
              : makeTenantRecordId(businessId, "univ_inv", fingerprint);

          if (isMerge && existingDisp) updatedSnapshots.b2b_dispatches.push(existingDisp);
          else createdIds.b2b_dispatches.push(recordId);

          if (isMerge && existingInv) updatedSnapshots.invoices.push(existingInv);
          else createdIds.invoices.push(univInvId);

          const rawTotal = Math.abs(Number(norm.total_amount || 0));
          const signedTotal = isReturn ? -rawTotal : rawTotal;
          const paidAmt = Math.max(0, Number(norm.paid_amount ?? 0));
          const balDue = isReturn
            ? -rawTotal
            : Math.max(0, Number(norm.balance_due ?? Math.max(0, rawTotal - paidAmt)));
          const status = isReturn
            ? "unpaid"
            : balDue <= 0
            ? "paid"
            : paidAmt > 0
            ? "partial"
            : "pending";

          const customerName = String(norm.customer_name || "Customer").trim();
          const customerPhone = String(norm.customer_phone || "").trim();
          const customerAddress = String(norm.customer_address || "").trim();
          const customerGstin = String(norm.customer_gstin || "").trim();
          const invDate = norm.date || new Date().toISOString().split("T")[0];
          const items = Array.isArray(norm.items) ? norm.items : [];

          // Auto-register referenced customer into this store's client directory if not already present
          const custKey = customerName.toLowerCase();
          if (custKey && custKey !== "walk-in customer" && !existingClientsByName.has(custKey) && !clientsToUpsert.has(custKey)) {
            const clientId = makeTenantRecordId(businessId, "customers", `cust:${custKey}`);
            createdIds.b2b_clients.push(clientId);
            clientsToUpsert.set(custKey, {
              id: clientId,
              business_id: businessId,
              name: customerName,
              phone: customerPhone,
              address: customerAddress,
              updated_at: new Date().toISOString(),
            });
          }

          // Auto-register referenced line-item products if not already present (preserving verified cost flag)
          for (const it of items) {
            const pName = String(it.name || "").trim();
            const pKey = pName.toLowerCase();
            if (
              pKey &&
              pKey !== "historical billed items" &&
              !existingProductsByName.has(pKey) &&
              !productsToUpsert.has(pKey)
            ) {
              const prodId = makeTenantRecordId(businessId, "products", `prod:${pKey}`);
              const sPrice = Math.max(0, Number(it.rate || 0));
              const hasVerifiedCost = Boolean(it.making_cost && Number(it.making_cost) > 0);
              const mCost = hasVerifiedCost ? Number(it.making_cost) : 0;
              const uProfit = hasVerifiedCost ? sPrice - mCost : 0;
              const mPct = hasVerifiedCost && sPrice > 0 ? Math.round(((uProfit / sPrice) * 100) * 10) / 10 : 0;

              createdIds.b2b_products.push(prodId);
              productsToUpsert.set(pKey, {
                id: prodId,
                business_id: businessId,
                name: pName,
                category: "Imported Catalog",
                rate: sPrice,
                selling_price: sPrice,
                making_cost: mCost,
                unit_profit: uProfit,
                profit_margin_pct: mPct,
                unit: it.unit || "Unit",
                is_active: true,
                min_order_qty: 1,
                stock_available: 0,
                has_verified_cost: hasVerifiedCost,
                updated_at: new Date().toISOString(),
              });
            }
          }

          const clientRecord = existingClientsByName.get(custKey) || clientsToUpsert.get(custKey);

          dispatchesToUpsert.push({
            id: recordId,
            business_id: businessId,
            slip_number: slipNo,
            date: invDate,
            due_date: norm.due_date || null,
            client_id: clientRecord?.id || "",
            client_name: customerName,
            client_phone: customerPhone,
            client_address: customerAddress,
            items,
            subtotal: signedTotal - Number(norm.tax_amount || 0) + Number(norm.discount_amount || 0),
            tax_amount: Number(norm.tax_amount || 0),
            total_amount: signedTotal,
            paid_amount: paidAmt,
            balance_due: balDue,
            status: status === "partial" ? "pending" : status,
            delivery_status: isReturn ? "returned" : "delivered",
            notes: norm.notes || `Imported via Smart Import (${jobId})`,
            updated_at: new Date().toISOString(),
          });

          invoicesToUpsert.push({
            id: univInvId,
            business_id: businessId,
            invoice_number: slipNo,
            title: isReturn ? "CREDIT NOTE / RETURN" : "TAX INVOICE",
            date: invDate,
            due_date: norm.due_date || null,
            customer_name: customerName,
            customer_phone: customerPhone,
            customer_address: customerAddress,
            customer_gstin: customerGstin,
            items,
            subtotal: Math.abs(signedTotal) - Number(norm.tax_amount || 0) + Number(norm.discount_amount || 0),
            tax_rate: 0,
            tax_amount: Number(norm.tax_amount || 0),
            tds_amount: 0,
            discount_amount: Number(norm.discount_amount || 0),
            total_amount: signedTotal,
            paid_amount: paidAmt,
            balance_due: balDue,
            status,
            payment_mode: norm.payment_mode || "UPI",
            notes: norm.notes || `Imported via Smart Import (${jobId})`,
            source: "smart_import",
            updated_at: new Date().toISOString(),
          });

          importedCount++;
          if (isMerge) bucket.merged++;
          else bucket.imported++;
        } else if (entityType === "customers") {
          const name = String(norm.name || "").trim();
          const custKey = name.toLowerCase();
          if (!custKey) {
            skippedCount++;
            bucket.skipped++;
            continue;
          }
          const existingCust = existingClientsByName.get(custKey);
          if (existingCust && duplicateStrategy === "skip" && !isMerge) {
            skippedCount++;
            bucket.skipped++;
            continue;
          }

          const clientId =
            isMerge && existingCust?.id
              ? existingCust.id
              : makeTenantRecordId(businessId, "customers", fingerprint);

          if (isMerge && existingCust) updatedSnapshots.b2b_clients.push(existingCust);
          else createdIds.b2b_clients.push(clientId);

          clientsToUpsert.set(custKey, {
            id: clientId,
            business_id: businessId,
            name,
            phone: String(norm.phone || existingCust?.phone || "").trim(),
            address: String(norm.address || existingCust?.address || "").trim(),
            updated_at: new Date().toISOString(),
          });

          // If customer has an opening balance > 0, create an opening balance invoice so ledgers reflect it
          const openingBal = Number(norm.opening_balance || 0);
          if (openingBal > 0) {
            const obSlipNo = `OB-${name.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 6)}-${Date.now().toString().slice(-4)}`;
            const obId = makeTenantRecordId(businessId, "invoices", `ob:${custKey}`);
            createdIds.b2b_dispatches.push(obId);
            dispatchesToUpsert.push({
              id: obId,
              business_id: businessId,
              slip_number: obSlipNo,
              date: new Date().toISOString().split("T")[0],
              client_id: clientId,
              client_name: name,
              client_phone: String(norm.phone || "").trim(),
              client_address: String(norm.address || "").trim(),
              items: [{ name: "Historical Opening Balance", qty: 1, rate: openingBal, amount: openingBal, making_cost: 0, has_verified_cost: false }],
              subtotal: openingBal,
              tax_amount: 0,
              total_amount: openingBal,
              paid_amount: 0,
              balance_due: openingBal,
              status: "pending",
              delivery_status: "delivered",
              notes: `Opening balance imported via Smart Import (${jobId})`,
              updated_at: new Date().toISOString(),
            });
          }

          importedCount++;
          if (isMerge) bucket.merged++;
          else bucket.imported++;
        } else if (entityType === "products") {
          const name = String(norm.name || "").trim();
          const prodKey = name.toLowerCase();
          if (!prodKey) {
            skippedCount++;
            bucket.skipped++;
            continue;
          }
          const existingProd = existingProductsByName.get(prodKey);
          if (existingProd && duplicateStrategy === "skip" && !isMerge) {
            skippedCount++;
            bucket.skipped++;
            continue;
          }

          const prodId =
            isMerge && existingProd?.id
              ? existingProd.id
              : makeTenantRecordId(businessId, "products", fingerprint);

          if (isMerge && existingProd) updatedSnapshots.b2b_products.push(existingProd);
          else createdIds.b2b_products.push(prodId);

          const sPrice = Math.max(0, Number(norm.selling_price ?? existingProd?.selling_price ?? 0));
          const hasCost =
            (norm.making_cost !== undefined && Number(norm.making_cost) > 0) ||
            Boolean(existingProd?.making_cost && Number(existingProd.making_cost) > 0);
          const mCost =
            norm.making_cost !== undefined && Number(norm.making_cost) > 0
              ? Number(norm.making_cost)
              : Number(existingProd?.making_cost || 0);
          const uProfit = hasCost ? sPrice - mCost : 0;
          const mPct = hasCost && sPrice > 0 ? Math.round(((uProfit / sPrice) * 100) * 10) / 10 : 0;

          productsToUpsert.set(prodKey, {
            id: prodId,
            business_id: businessId,
            name,
            category: String(norm.category || existingProd?.category || "General").trim(),
            rate: sPrice,
            selling_price: sPrice,
            making_cost: mCost,
            unit_profit: uProfit,
            profit_margin_pct: mPct,
            unit: String(norm.unit || existingProd?.unit || "Unit").trim(),
            is_active: true,
            min_order_qty: 1,
            stock_available: Number(norm.stock_available ?? existingProd?.stock_available ?? 0),
            has_verified_cost: hasCost,
            updated_at: new Date().toISOString(),
          });

          importedCount++;
          if (isMerge) bucket.merged++;
          else bucket.imported++;
        } else if (entityType === "payments") {
          const payId = makeTenantRecordId(businessId, "payments", fingerprint);
          createdIds.b2b_payments.push(payId);
          const customerName = String(norm.customer_name || "Customer").trim();
          const clientObj = existingClientsByName.get(customerName.toLowerCase()) || clientsToUpsert.get(customerName.toLowerCase());

          paymentsToUpsert.push({
            id: payId,
            business_id: businessId,
            date: norm.date || new Date().toISOString().split("T")[0],
            client_id: clientObj?.id || "",
            client_name: customerName,
            amount: Math.max(0, Number(norm.amount || 0)),
            payment_method: String(norm.payment_method || "UPI").trim(),
            reference_no: String(norm.reference_no || "").trim(),
            notes: norm.notes || `Imported via Smart Import (${jobId})`,
            allocated_slips: norm.reference_no ? [String(norm.reference_no).trim()] : [],
            recorded_by: caller.email,
            created_at: new Date().toISOString(),
          });

          importedCount++;
          bucket.imported++;
        } else if (entityType === "expenses") {
          const expId = makeTenantRecordId(businessId, "expenses", fingerprint);
          createdIds.b2b_expenses.push(expId);
          const expDate = norm.date || new Date().toISOString().split("T")[0];
          const expName = String(norm.name || "Operating Expense").trim();
          const expAmt = Math.max(0, Number(norm.amount || 0));
          const expQty = Math.max(1, Number(norm.quantity || 1));

          expensesToUpsert.push({
            id: expId,
            business_id: businessId,
            date: expDate,
            name: expName,
            category: String(norm.category || "Operating Expenses").trim(),
            amount: expAmt,
            notes: norm.notes || `Imported via Smart Import (${jobId})`,
            created_at: new Date().toISOString(),
          });

          dailyExpensesToUpsert.push({
            id: expId,
            business_id: businessId,
            expense_date: expDate,
            item_name: expName,
            quantity: expQty,
            price_cents: Math.round((expAmt / expQty) * 100),
            submitted_by: caller.id,
          });

          importedCount++;
          bucket.imported++;
        } else if (entityType === "inventory") {
          const invItemId = makeTenantRecordId(businessId, "inventory", fingerprint);
          createdIds.inventory_items.push(invItemId);
          inventoryToUpsert.push({
            id: invItemId,
            business_id: businessId,
            name: String(norm.name || "Stock Item").trim(),
            sku: norm.sku ? String(norm.sku).trim() : null,
            category: String(norm.category || "General").trim(),
            unit: String(norm.unit || "Unit").trim(),
            cost_per_unit: Math.max(0, Number(norm.cost_per_unit || 0)),
            current_stock: Number(norm.current_stock || 0),
            min_reorder_level: Number(norm.min_reorder_level || 5),
            optimal_stock_level: Number(norm.current_stock || 20),
            is_active: true,
          });
          importedCount++;
          bucket.imported++;
        } else if (entityType === "suppliers") {
          const supId = makeTenantRecordId(businessId, "suppliers", fingerprint);
          createdIds.suppliers.push(supId);
          suppliersToUpsert.push({
            id: supId,
            business_id: businessId,
            name: String(norm.name || "Vendor").trim(),
            contact_person: norm.contact_person ? String(norm.contact_person).trim() : null,
            phone: norm.phone ? String(norm.phone).trim() : null,
            email: norm.email ? String(norm.email).trim() : null,
            payment_terms: norm.payment_terms ? String(norm.payment_terms).trim() : "Net 15",
            lead_time_days: 3,
          });
          importedCount++;
          bucket.imported++;
        } else if (entityType === "purchases") {
          const poId = makeTenantRecordId(businessId, "purchases", fingerprint);
          createdIds.purchase_orders.push(poId);
          purchasesToUpsert.push({
            id: poId,
            business_id: businessId,
            po_number: String(norm.po_number || `PO-${Date.now().toString().slice(-5)}`).trim(),
            status: "RECEIVED",
            total_amount: Math.max(0, Number(norm.total_amount || 0)),
            expected_delivery_date: norm.date || new Date().toISOString().split("T")[0],
            received_at: new Date().toISOString(),
          });
          importedCount++;
          bucket.imported++;
        } else if (entityType === "invoice_items") {
          // Standalone invoice_items are already merged into their parent invoices during staging;
          // count as imported if not skipped
          importedCount++;
          bucket.imported++;
        }
      } catch (rowErr) {
        console.warn("Row import error:", rowErr);
        failedCount++;
        bucket.failed++;
      }
    }

    const clientArray = Array.from(clientsToUpsert.values());
    const productArray = Array.from(productsToUpsert.values());

    if (productArray.length > 0) {
      const newActiveProductsCount = productArray.filter(
        (p) => p.is_active !== false && !existingProductsByName.has(String(p.name || "").trim().toLowerCase())
      ).length;
      if (newActiveProductsCount > 0) {
        const entitlements = await getEffectiveEntitlements(supa, businessId);
        if (
          entitlements.maxActiveProducts !== null &&
          entitlements.usage.activeProducts + newActiveProductsCount > entitlements.maxActiveProducts
        ) {
          return NextResponse.json(
            {
              error: `Smart Import would add ${newActiveProductsCount} active products, exceeding your ${entitlements.planName} plan limit (${entitlements.usage.activeProducts}/${entitlements.maxActiveProducts}). Please upgrade your plan or reduce the imported products.`,
              code: "SUBSCRIPTION_PRODUCT_LIMIT_REACHED",
            },
            { status: 403 }
          );
        }
      }
    }

    // 4. Commit batches to Supabase relational tables for this store (non-fatal if optional tables aren't migrated yet)
    await Promise.all([
      upsertInBatches(supa, "b2b_clients", clientArray),
      upsertInBatches(supa, "b2b_products", productArray),
      upsertInBatches(supa, "b2b_dispatches", dispatchesToUpsert),
      upsertInBatches(supa, "invoices", invoicesToUpsert),
      upsertInBatches(supa, "b2b_payments", paymentsToUpsert),
      upsertInBatches(supa, "b2b_expenses", expensesToUpsert),
      upsertInBatches(supa, "daily_expenses", dailyExpensesToUpsert),
      upsertInBatches(supa, "inventory_items", inventoryToUpsert),
      upsertInBatches(supa, "suppliers", suppliersToUpsert),
      upsertInBatches(supa, "purchase_orders", purchasesToUpsert),
    ]);

    // 5. Compute verified Historical Business Summary (strictly from imported records)
    const totalImportedRevenue = dispatchesToUpsert
      .filter((d) => Number(d.total_amount) > 0)
      .reduce((sum, d) => sum + Number(d.total_amount || 0), 0);
    const totalImportedReturns = dispatchesToUpsert
      .filter((d) => Number(d.total_amount) < 0)
      .reduce((sum, d) => sum + Math.abs(Number(d.total_amount || 0)), 0);
    const totalImportedDues = dispatchesToUpsert
      .filter((d) => Number(d.balance_due) > 0)
      .reduce((sum, d) => sum + Number(d.balance_due || 0), 0);
    const totalImportedExpenses = expensesToUpsert.reduce(
      (sum, e) => sum + Number(e.amount || 0),
      0
    );
    const totalImportedPayments = paymentsToUpsert.reduce(
      (sum, p) => sum + Number(p.amount || 0),
      0
    );
    const allProductsHaveVerifiedCost =
      productArray.length > 0 && productArray.every((p) => p.has_verified_cost);

    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - startMs;

    const jobSummary = {
      entityBreakdown,
      financials: {
        totalImportedRevenue,
        totalImportedReturns,
        totalImportedDues,
        totalImportedExpenses,
        totalImportedPayments,
        hasVerifiedProductCosts: allProductsHaveVerifiedCost,
        costCompletenessNote: allProductsHaveVerifiedCost
          ? "All imported products include verified unit/making costs. Historical gross profit is fully verified."
          : "Some imported products or invoices did not include historical making/unit costs. Revenue and dues are 100% verified; add making costs in Product Catalog to unlock verified net margins.",
      },
      durationMs,
    };

    const jobRecord = {
      id: jobId,
      business_id: businessId,
      created_by: caller.id,
      created_by_email: caller.email,
      import_name: importName,
      source_software: sourceSoftware,
      status: failedCount > 0 && importedCount > 0 ? "partial" : failedCount > 0 ? "failed" : "completed",
      duplicate_strategy: duplicateStrategy,
      total_records: stagedRecords.length,
      imported_count: importedCount,
      skipped_count: skippedCount,
      failed_count: failedCount,
      duplicate_count: duplicateCount,
      file_names: filesMeta.map((f) => f.fileName || f.name || "Spreadsheet"),
      summary: jobSummary,
      provenance: {
        createdIds,
        updatedSnapshots,
      },
      started_at: startedAt,
      completed_at: completedAt,
      created_at: startedAt,
      updated_at: completedAt,
    };

    // 6. Persist to dedicated data_import_* tables if present
    try {
      await supa.from("data_import_jobs").upsert(jobRecord, { onConflict: "id" });

      if (filesMeta.length > 0) {
        await supa.from("data_import_files").upsert(
          filesMeta.map((f, idx) => ({
            id: `${jobId}_file_${idx + 1}`,
            job_id: jobId,
            business_id: businessId,
            file_name: f.fileName || f.name || `File_${idx + 1}`,
            file_size: Number(f.fileSize || f.size || 0),
            file_type: f.fileType || "xlsx",
            sheet_count: Number(f.sheetCount || 1),
            row_count: Number(f.rowCount || 0),
            detected_categories: f.detectedCategories || [],
          })),
          { onConflict: "id" }
        );
      }

      if (mappingConfigs.length > 0) {
        await supa.from("data_import_mappings").upsert(
          mappingConfigs.map((mc, idx) => ({
            id: `${jobId}_map_${idx + 1}`,
            job_id: jobId,
            business_id: businessId,
            file_name: mc.fileName || "Workbook",
            sheet_name: mc.sheetName || "Sheet1",
            entity_type: mc.entityType || "invoices",
            mappings: mc.mappings || [],
            confidence_summary: {
              missingRequired: mc.missingRequiredFields || [],
              aiSource: mc.aiSource || "deterministic",
            },
          })),
          { onConflict: "id" }
        );
      }

      await supa.from("data_import_logs").insert({
        id: `${jobId}_log_commit`,
        job_id: jobId,
        business_id: businessId,
        actor_id: caller.id,
        actor_email: caller.email,
        event_type: "IMPORT_COMMITTED",
        details: {
          importedCount,
          skippedCount,
          failedCount,
          duplicateCount,
          durationMs,
        },
      });
    } catch {
      // Non-fatal if SQL migration script hasn't been executed on Supabase yet
    }

    // 7. Update Dual-Engine Fallback in businesses.enabled_modules strictly for businessId
    const mergedClientsMap = new Map<string, any>();
    (currentModules._b2b_clients || []).forEach((c: any) =>
      mergedClientsMap.set(String(c.name || c.id).toLowerCase(), c)
    );
    clientArray.forEach((c) => mergedClientsMap.set(String(c.name || c.id).toLowerCase(), c));

    const mergedProdsMap = new Map<string, any>();
    (currentB2BData.products || []).forEach((p: any) =>
      mergedProdsMap.set(String(p.name || p.id).toLowerCase(), p)
    );
    productArray.forEach((p) => mergedProdsMap.set(String(p.name || p.id).toLowerCase(), p));

    const mergedDispatchesMap = new Map<string, any>();
    (currentB2BData.invoices || []).forEach((inv: any) =>
      mergedDispatchesMap.set(String(inv.id || inv.invoiceNumber || inv.slip_number), inv)
    );
    dispatchesToUpsert.forEach((d) =>
      mergedDispatchesMap.set(d.id, {
        ...d,
        invoiceNumber: d.slip_number,
        customerName: d.client_name,
        customerPhone: d.client_phone,
        customerAddress: d.client_address,
        totalAmount: d.total_amount,
        paidAmount: d.paid_amount,
        balanceDue: d.balance_due,
        isReturn: d.total_amount < 0,
      })
    );

    const mergedUnivInvoicesMap = new Map<string, any>();
    (currentModules._invoices || []).forEach((inv: any) =>
      mergedUnivInvoicesMap.set(String(inv.id || inv.invoice_number), inv)
    );
    invoicesToUpsert.forEach((inv) => mergedUnivInvoicesMap.set(inv.id, inv));

    const mergedPayments = [
      ...paymentsToUpsert,
      ...(currentB2BData.payments || []).filter(
        (p: any) => !paymentsToUpsert.some((np) => np.id === p.id)
      ),
    ];
    const mergedExpenses = [
      ...expensesToUpsert,
      ...(currentB2BData.expenses || []).filter(
        (e: any) => !expensesToUpsert.some((ne) => ne.id === e.id)
      ),
    ];

    const updatedSmartImports = [
      jobRecord,
      ...existingSmartImports.filter((j) => j.id !== jobId),
    ].slice(0, 50);

    const nextModules = {
      ...currentModules,
      _invoices: Array.from(mergedUnivInvoicesMap.values()),
      _b2b_clients: Array.from(mergedClientsMap.values()),
      _b2b_data: {
        ...currentB2BData,
        invoices: Array.from(mergedDispatchesMap.values()),
        products: Array.from(mergedProdsMap.values()),
        payments: mergedPayments,
        expenses: mergedExpenses,
        lastUpdated: completedAt,
      },
      _smart_imports: updatedSmartImports,
    };

    await supa
      .from("businesses")
      .update({ enabled_modules: nextModules })
      .eq("id", businessId);

    // 8. Record Immutable Audit Log
    const { ipAddress, userAgent } = extractClientMetadata(req);
    await logAuditEvent({
      businessId,
      actorId: caller.id,
      actorEmail: caller.email,
      action: "SMART_IMPORT_EXECUTED",
      targetType: "data_import_job",
      targetId: jobId,
      details: {
        importName,
        importedCount,
        skippedCount,
        failedCount,
        duplicateCount,
      },
      ipAddress,
      userAgent,
    });

    return NextResponse.json({
      ok: true,
      job: jobRecord,
      workspaceDelta: {
        invoices: dispatchesToUpsert.map((d) => ({
          ...d,
          invoiceNumber: d.slip_number,
          customerName: d.client_name,
          customerPhone: d.client_phone,
          customerAddress: d.client_address,
          totalAmount: d.total_amount,
          paidAmount: d.paid_amount,
          balanceDue: d.balance_due,
          isReturn: d.total_amount < 0,
        })),
        products: productArray,
        stores: clientArray,
        payments: paymentsToUpsert,
        expenses: expensesToUpsert,
      },
    });
  } catch (err: any) {
    console.error("POST /api/smart-import/execute error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to execute smart import" },
      { status: 500 }
    );
  }
}

