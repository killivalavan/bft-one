import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (fs.existsSync(envPath)) {
    const text = fs.readFileSync(envPath, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx > 0) {
        const k = trimmed.slice(0, eqIdx).trim();
        let v = trimmed.slice(eqIdx + 1).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        process.env[k] = v;
      }
    }
  }
}

loadEnv();

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const ROYAL_BAKER_ID = "e99fb445-d15e-4208-a8e6-0108ffdbe32a";
const DEFAULT_BIZ_ID = "a0000000-0000-0000-0000-000000000001";

async function runTests() {
  console.log("=========================================================");
  console.log(" SEYALPRO PLATFORM ARCHITECTURE REGRESSION TEST SUITE");
  console.log("=========================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  // TEST 1: Cloud Persistence in Supabase
  console.log("[TEST 1] Verifying Cloud Persistence in Supabase...");
  const { data: rbBiz, error: rbErr } = await sb
    .from("businesses")
    .select("id, name, enabled_modules")
    .eq("id", ROYAL_BAKER_ID)
    .single();

  assert(!rbErr && rbBiz, `Royal Baker business record exists in Supabase (${ROYAL_BAKER_ID})`);
  const b2bData = rbBiz?.enabled_modules?._b2b_data || {};
  assert(Array.isArray(b2bData.invoices) && b2bData.invoices.length > 0, `B2B Invoices persisted in cloud (Count: ${b2bData.invoices?.length || 0})`);
  assert(Array.isArray(b2bData.products) && b2bData.products.length >= 19, `B2B Wholesale products persisted in cloud (Count: ${b2bData.products?.length || 0})`);
  assert(Array.isArray(b2bData.payments) && b2bData.payments.length >= 6, `B2B Payments persisted in cloud (Count: ${b2bData.payments?.length || 0})`);
  assert(Array.isArray(b2bData.expenses) && b2bData.expenses.length >= 10, `B2B Expenses persisted in cloud (Count: ${b2bData.expenses?.length || 0})`);
  assert(Array.isArray(b2bData.broadcasts) && b2bData.broadcasts.length >= 3, `B2B Broadcasts persisted in cloud (Count: ${b2bData.broadcasts?.length || 0})`);
  assert(Array.isArray(rbBiz?.enabled_modules?._b2b_clients) && rbBiz.enabled_modules._b2b_clients.length === 9, `Partner stores persisted in cloud (Count: ${rbBiz?.enabled_modules?._b2b_clients?.length || 0})`);

  // TEST 2: Multi-Tenant Boundary Verification
  console.log("\n[TEST 2] Verifying Multi-Tenant Boundary Separation...");
  const { data: defBiz } = await sb
    .from("businesses")
    .select("id, name, enabled_modules")
    .eq("id", DEFAULT_BIZ_ID)
    .single();

  assert(defBiz && defBiz.id !== ROYAL_BAKER_ID, `Default workspace (${defBiz?.name}) is isolated from Royal Baker`);
  assert(defBiz?.enabled_modules?.baker_mode === true, "Default workspace has baker_mode enabled for unauthenticated mobile fallback");

  // TEST 3: Financial Reconciliation & Math Verification
  console.log("\n[TEST 3] Verifying Financial Math & Balance Reconciliation...");
  let mathReconciled = true;
  let returnSlipFound = false;

  b2bData.invoices?.forEach((inv) => {
    // Check line item amounts
    const itemTotal = (inv.items || []).reduce((acc, it) => acc + (it.qty * it.rate), 0);
    if (inv.items && inv.items.length > 0 && Math.abs(itemTotal - inv.totalAmount) > 1) {
      console.log(`[MISMATCH itemTotal] Invoice ${inv.invoiceNumber}: itemTotal=${itemTotal}, totalAmount=${inv.totalAmount}`);
      mathReconciled = false;
    }
    // Check balance due calculation
    const computedDue = inv.totalAmount < 0 
      ? (inv.totalAmount - (inv.paidAmount || 0))
      : Math.max(0, inv.totalAmount - (inv.paidAmount || 0));
    if (Math.abs(computedDue - inv.balanceDue) > 1) {
      console.log(`[MISMATCH balanceDue] Invoice ${inv.invoiceNumber}: computedDue=${computedDue}, balanceDue=${inv.balanceDue}`);
      mathReconciled = false;
    }
    if (inv.invoiceNumber === "RET-101") {
      returnSlipFound = true;
      assert(inv.totalAmount < 0 && inv.delivery_status === "returned", "Return credit slip RET-101 has negative balance credit");
    }
  });

  assert(mathReconciled, `All ${b2bData.invoices?.length || 0} delivery slip totals and dues reconcile with line item math`);
  assert(returnSlipFound, "Return credit slip RET-101 verified for reverse logistics intake");

  // TEST 4: Idempotency & Duplicate Prevention Check
  console.log("\n[TEST 4] Verifying Idempotency & Deduplication Logic...");
  const testMap = new Map();
  b2bData.invoices?.forEach((inv) => testMap.set(inv.invoiceNumber, inv));
  assert(testMap.size === b2bData.invoices?.length, `All delivery slip numbers are unique without duplicates (${testMap.size}/${b2bData.invoices?.length})`);

  const prodMap = new Map();
  b2bData.products?.forEach((p) => prodMap.set(p.name.toLowerCase().trim(), p));
  assert(prodMap.size === b2bData.products?.length, `All product catalog names are unique without duplicates (${prodMap.size}/${b2bData.products?.length})`);

  // TEST 5: Product Pricing, Costs, Margins & Zero NaN Integrity
  console.log("\n[TEST 5] Verifying Product Pricing, Costs, Margins & Zero NaN Integrity...");
  let allProductsValid = true;
  let invalidReason = "";

  (b2bData.products || []).forEach((p) => {
    const sPrice = Number(p.selling_price ?? p.rate ?? 0);
    const mCost = Number(p.making_cost ?? 0);
    const uProfit = Number(p.unit_profit ?? 0);
    const mPct = Number(p.profit_margin_pct ?? 0);

    if (!Number.isFinite(sPrice) || sPrice <= 0) {
      allProductsValid = false;
      invalidReason = `Product "${p.name}" has invalid selling_price: ${p.selling_price}`;
    }
    if (!Number.isFinite(mCost) || mCost < 0) {
      allProductsValid = false;
      invalidReason = `Product "${p.name}" has invalid making_cost: ${p.making_cost}`;
    }
    if (!Number.isFinite(uProfit)) {
      allProductsValid = false;
      invalidReason = `Product "${p.name}" has invalid unit_profit: ${p.unit_profit}`;
    }
    if (!Number.isFinite(mPct) || mPct < 0) {
      allProductsValid = false;
      invalidReason = `Product "${p.name}" has invalid profit_margin_pct: ${p.profit_margin_pct}`;
    }
  });

  assert(allProductsValid, allProductsValid ? "All products have complete finite selling_price, making_cost, unit_profit, and profit_margin_pct" : invalidReason);

  let noNaNInvoices = true;
  (b2bData.invoices || []).forEach((inv) => {
    if (!Number.isFinite(Number(inv.totalAmount))) noNaNInvoices = false;
    if (!Number.isFinite(Number(inv.paidAmount))) noNaNInvoices = false;
    if (!Number.isFinite(Number(inv.balanceDue))) noNaNInvoices = false;
    (inv.items || []).forEach((it) => {
      if (!Number.isFinite(Number(it.qty)) || !Number.isFinite(Number(it.rate)) || !Number.isFinite(Number(it.amount))) {
        noNaNInvoices = false;
      }
    });
  });

  assert(noNaNInvoices, "All invoices, items, totals, and balances have strictly finite numeric values (0 NaN detected)");

  // SUMMARY
  console.log("\n=========================================================");
  console.log(` TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log("=========================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test execution error:", err);
  process.exit(1);
});
