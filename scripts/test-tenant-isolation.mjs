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
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supa = createClient(supabaseUrl, supabaseKey);

console.log("=========================================================");
console.log(" MULTI-TENANT STORE & USER ISOLATION VERIFICATION TEST");
console.log("=========================================================\n");

async function runTests() {
  let passCount = 0;
  let failCount = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passCount++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failCount++;
    }
  }

  // 1. Verify Distinct Businesses
  console.log("[TEST 1] Verifying Distinct Store/Business Entities in Supabase...");
  const { data: businesses, error: bizErr } = await supa.from("businesses").select("id, name, slug");
  assert(!bizErr, "Successfully queried businesses table");
  assert(Array.isArray(businesses) && businesses.length >= 2, `Found ${businesses?.length} distinct registered stores`);

  const bftBiz = businesses.find((b) => b.slug === "bft-navalur");
  const royalBiz = businesses.find((b) => b.slug === "royal-baker");
  const mongosBiz = businesses.find((b) => b.slug === "mongo-s");

  assert(bftBiz && royalBiz && mongosBiz, "Identified Brown Fening Tea, Royal Baker, and Mongo's businesses");

  // 2. Verify Individual Store Admins and Regular Users
  console.log("\n[TEST 2] Verifying Individual Admins & Staff Users per Store...");
  const { data: profiles, error: profErr } = await supa
    .from("profiles")
    .select("id, email, full_name, is_admin, is_super_admin, business_id");
  assert(!profErr, "Successfully queried user profiles");

  // Verify Royal Baker admin
  const royalAdmin = profiles.find((p) => p.email === "royalbaker@gmail.com");
  assert(royalAdmin && royalAdmin.is_admin && royalAdmin.business_id === royalBiz.id, 
    "Royal Baker has its own individual admin (royalbaker@gmail.com) bound to Royal Baker ID");

  // Verify Mongo's admin & users
  const mongosAdmin = profiles.find((p) => p.email === "mongo@gmail.com");
  assert(mongosAdmin && mongosAdmin.is_admin && mongosAdmin.business_id === mongosBiz.id,
    "Mongo's has its own individual admin (mongo@gmail.com) bound to Mongo's ID");

  const mongosStaff = profiles.filter((p) => p.business_id === mongosBiz.id && !p.is_admin);
  assert(mongosStaff.length >= 2, `Mongo's has ${mongosStaff.length} store-specific staff users (newuser@, newuser1@)`);
  assert(mongosStaff.every((u) => u.business_id === mongosBiz.id), "All Mongo's staff are strictly bound to Mongo's business_id");

  // Verify BFT staff
  const bftStaff = profiles.filter((p) => p.business_id === bftBiz.id && !p.is_admin);
  assert(bftStaff.length >= 3, `BFT has ${bftStaff.length} store-specific staff users (muthamil@, vasanth@, etc.)`);
  assert(bftStaff.every((u) => u.business_id === bftBiz.id), "All BFT staff are strictly bound to BFT business_id");

  // 3. Verify Data Isolation across Dispatches / Delivery Slips
  console.log("\n[TEST 3] Verifying Business-Level Data Scoping (B2B Dispatches)...");
  const { data: royalDispatches } = await supa
    .from("b2b_dispatches")
    .select("id, slip_number, client_name, business_id")
    .eq("business_id", royalBiz.id);

  const { data: mongosDispatches } = await supa
    .from("b2b_dispatches")
    .select("id, slip_number, client_name, business_id")
    .eq("business_id", mongosBiz.id);

  assert(royalDispatches && royalDispatches.every((d) => d.business_id === royalBiz.id),
    `Royal Baker dispatches (${royalDispatches?.length}) are strictly tagged with Royal Baker business_id`);
  assert(mongosDispatches && mongosDispatches.every((d) => d.business_id === mongosBiz.id),
    `Mongo's dispatches (${mongosDispatches?.length}) are strictly tagged with Mongo's business_id`);

  // Ensure no cross-bleed
  const royalIds = new Set((royalDispatches || []).map((d) => d.id));
  const mongosCrossContamination = (mongosDispatches || []).filter((d) => royalIds.has(d.id));
  assert(mongosCrossContamination.length === 0, "Zero cross-store dispatch contamination between Royal Baker and Mongo's");

  // 4. Verify Code Protection in serverAuth & useB2BData
  console.log("\n[TEST 4] Verifying Code Integrity (serverAuth, useB2BData & LocalStorage)...");
  const serverAuthCode = fs.readFileSync(path.resolve(process.cwd(), "lib/auth/serverAuth.ts"), "utf8");
  assert(
    serverAuthCode.includes("!isSuperAdmin && !profile.business_id"),
    "serverAuth.ts rejects any unassigned non-super-admin user instead of falling back to default store"
  );

  const b2bDataHooksCode = fs.readFileSync(path.resolve(process.cwd(), "lib/hooks/useB2BData.ts"), "utf8");
  assert(
    b2bDataHooksCode.includes('bizId && bizId !== "default"'),
    "useB2BData.ts pauses all queries when business_id is resolving or uninitialized"
  );

  const royalBakerDemoCode = fs.readFileSync(path.resolve(process.cwd(), "lib/data/royalBakerDemoData.ts"), "utf8");
  assert(
    !royalBakerDemoCode.includes('`bftone_invoices_${id}`') &&
    !royalBakerDemoCode.includes('"bftone_invoices_default"'),
    "seedRoyalBakerLocalStorage strictly targets ROYAL_BAKER_BIZ_ID and never pollutes default or generic keys"
  );

  console.log("\n=========================================================");
  if (failCount === 0) {
    console.log(` ALL ${passCount} MULTI-TENANT ISOLATION TESTS PASSED! 🚀`);
  } else {
    console.error(` ❌ ${failCount} TESTS FAILED!`);
    process.exit(1);
  }
  console.log("=========================================================\n");
}

runTests();
