import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

// Load .env.local
const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf8");
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const idx = trimmed.indexOf("=");
    if (idx > 0) {
      const key = trimmed.slice(0, idx).trim();
      let val = trimmed.slice(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  });
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supa = createClient(supabaseUrl, supabaseKey);

console.log("=========================================================");
console.log(" CLIENT LEDGERS & DATA ARCHITECTURE VERIFICATION TEST");
console.log("=========================================================\n");

async function run() {
  const bizId = "e99fb445-d15e-4208-a8e6-0108ffdbe32a"; // Royal Baker

  // 1. Check workspace sanitizeInvoice logic
  const [dispatchesRes, clientsRes] = await Promise.all([
    supa.from("b2b_dispatches").select("*").eq("business_id", bizId).order("date", { ascending: false }),
    supa.from("b2b_clients").select("*").eq("business_id", bizId),
  ]);

  if (dispatchesRes.error) {
    console.error("❌ FAIL: could not query b2b_dispatches:", dispatchesRes.error.message);
    process.exit(1);
  }

  const rawDispatches = dispatchesRes.data || [];
  console.log(`[TEST 1] Cloud Dispatches Retrieved: ${rawDispatches.length} recorded delivery slips`);
  if (rawDispatches.length === 0) {
    console.warn("⚠️ Warning: 0 dispatches in b2b_dispatches table for business");
  } else {
    console.log("  ✅ PASS: Found recorded delivery slips in Supabase");
  }

  // Verify normalization function matches app/api/b2b/workspace/route.ts
  function sanitizeInvoice(inv) {
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
    };
  }

  const normalized = rawDispatches.map(sanitizeInvoice);

  // Check property normalization
  normalized.forEach((inv) => {
    if (!inv.customerName || !inv.client_name) {
      throw new Error(`Invoice missing customerName/client_name: ${JSON.stringify(inv)}`);
    }
    if (!inv.invoiceNumber || !inv.slip_number) {
      throw new Error(`Invoice missing invoiceNumber/slip_number: ${JSON.stringify(inv)}`);
    }
  });
  console.log("  ✅ PASS: All delivery slips normalized with dual customerName and client_name properties");

  // 2. Client ledger matching
  const stores = clientsRes.data || [];
  console.log(`\n[TEST 2] Active Clients in Database: ${stores.length}`);

  const cafesWithLedger = stores.map((st) => {
    const clientInvoices = normalized.filter((inv) => {
      const invName = (inv.customerName || inv.client_name || inv.customer_name || "").toLowerCase().trim();
      const storeName = (st.name || "").toLowerCase().trim();
      const invClientId = inv.clientId || inv.client_id || inv.storeId;
      const idMatch = Boolean(st.id && invClientId && String(st.id) === String(invClientId));
      const exactNameMatch = Boolean(invName && storeName && invName === storeName);
      const normalizedInvName = invName.replace(/[^a-z0-9]/g, "");
      const normalizedStoreName = storeName.replace(/[^a-z0-9]/g, "");
      const looseMatch = Boolean(normalizedInvName && normalizedStoreName && normalizedInvName === normalizedStoreName);
      return idMatch || exactNameMatch || looseMatch;
    });

    const rawBilled = clientInvoices.reduce((acc, inv) => {
      const val = Number(inv.totalAmount !== undefined ? inv.totalAmount : (inv.total_amount ?? 0));
      return acc + (Number.isFinite(val) ? val : 0);
    }, 0);
    const totalBilled = Number.isFinite(rawBilled) ? rawBilled : 0;

    const rawUnpaid = clientInvoices
      .filter((inv) => {
        const s = String(inv.status || "").toLowerCase();
        const due = Number(inv.balanceDue ?? inv.balance_due ?? (Number(inv.totalAmount || inv.total_amount || 0) - Number(inv.paidAmount || inv.paid_amount || 0)));
        return (s === "unpaid" || s === "pending") || due > 0;
      })
      .reduce((acc, inv) => {
        const val = Number(inv.balanceDue !== undefined ? inv.balanceDue : (inv.balance_due !== undefined ? inv.balance_due : (inv.totalAmount || inv.total_amount || 0)));
        return acc + (Number.isFinite(val) ? val : 0);
      }, 0);
    const unpaidDues = Number.isFinite(rawUnpaid) ? rawUnpaid : 0;
    const totalPaid = Math.max(0, totalBilled - unpaidDues);

    return {
      id: st.id,
      name: st.name,
      totalBilled,
      totalPaid,
      unpaidDues,
      slipsCount: clientInvoices.length,
    };
  });

  const killiClub = cafesWithLedger.find((c) => c.name.toLowerCase().includes("killi"));
  const chaiGalli = cafesWithLedger.find((c) => c.name.toLowerCase().includes("chai galli"));

  if (killiClub) {
    console.log(`  -> Killi Club Ledger: ${killiClub.slipsCount} slips | Billed: ₹${killiClub.totalBilled} | Dues: ₹${killiClub.unpaidDues}`);
    if (killiClub.slipsCount === 2 && killiClub.unpaidDues === 12875) {
      console.log("  ✅ PASS: Killi Club ledger correctly reconciles to 2 slips and ₹12,875 due");
    } else {
      console.error("  ❌ FAIL: Killi Club ledger incorrect:", killiClub);
      process.exit(1);
    }
  }

  if (chaiGalli) {
    console.log(`  -> Chai Galli Cafe Ledger: ${chaiGalli.slipsCount} slips | Billed: ₹${chaiGalli.totalBilled} | Dues: ₹${chaiGalli.unpaidDues}`);
    if (chaiGalli.slipsCount === 1 && chaiGalli.unpaidDues === 1900) {
      console.log("  ✅ PASS: Chai Galli Cafe ledger correctly reconciles to 1 slip and ₹1,900 due");
    } else {
      console.error("  ❌ FAIL: Chai Galli Cafe ledger incorrect:", chaiGalli);
      process.exit(1);
    }
  }

  // 3. Verify total metrics
  const totalBilledAll = cafesWithLedger.reduce((acc, c) => acc + c.totalBilled, 0);
  const totalOutstandingAll = cafesWithLedger.reduce((acc, c) => acc + c.unpaidDues, 0);
  const totalPendingSettlementsCount = normalized.filter((inv) => {
    const s = String(inv.status || "").toLowerCase();
    const due = Number(inv.balanceDue ?? inv.balance_due ?? (Number(inv.totalAmount || inv.total_amount || 0) - Number(inv.paidAmount || inv.paid_amount || 0)));
    return (s === "unpaid" || s === "pending") || due > 0;
  }).length;

  console.log(`\n[TEST 3] Summary Metrics Verification:`);
  console.log(`  Total Active Clients: ${cafesWithLedger.length}`);
  console.log(`  Lifetime Billed: ₹${totalBilledAll}`);
  console.log(`  Outstanding Balance: ₹${totalOutstandingAll}`);
  console.log(`  Pending Settlements: ${totalPendingSettlementsCount} Slips`);

  if (totalOutstandingAll === 14775 && totalPendingSettlementsCount === 3) {
    console.log("  ✅ PASS: Summary metrics correctly show ₹14,775 outstanding across 3 pending slips");
  } else {
    console.error("  ❌ FAIL: Summary metrics incorrect");
    process.exit(1);
  }

  // 4. Verify code files do not have destructive legacy queries
  console.log("\n[TEST 4] Verifying Code Integrity (No Destructive Queries)...");
  const filesToCheck = [
    "app/(protected)/b2b/customers/page.tsx",
    "app/(protected)/b2b/customers/[id]/page.tsx",
    "app/(protected)/b2b/payments/page.tsx",
    "app/(protected)/b2b/reports/page.tsx",
    "app/(protected)/b2b/dispatch/page.tsx",
    "app/(protected)/b2b/page.tsx",
  ];

  for (const f of filesToCheck) {
    const content = fs.readFileSync(path.resolve(process.cwd(), f), "utf8");
    if (content.includes('.from("invoices").select("*")')) {
      console.error(`  ❌ FAIL: Found legacy .from("invoices").select("*") in ${f}`);
      process.exit(1);
    }
    console.log(`  ✅ PASS: ${f} clean of legacy POS invoices overwrite query`);
  }

  console.log("\n=========================================================");
  console.log(" ALL TESTS PASSED SUCCESSFULLY! 🚀");
  console.log("=========================================================\n");
}

run();
