import { createClient } from "@supabase/supabase-js";
import fs from "fs";

function loadEnv() {
  try {
    const raw = fs.readFileSync(".env.local", "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim();
        process.env[key] = val;
      }
    }
  } catch (e) {}
}
loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supa = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

console.log("\n========================================================");
console.log("VERIFYING SUPABASE SCHEMA DEPLOYMENT");
console.log("========================================================\n");

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${message}`);
    failed++;
  }
}

async function run() {
  // 1. Check businesses
  const { data: businesses, error: bErr } = await supa.from("businesses").select("id, name").limit(1);
  if (bErr || !businesses || businesses.length === 0) {
    console.error("Failed to query businesses table:", bErr);
    process.exit(1);
  }
  const sampleBizId = businesses[0].id;
  console.log(`[INFO] Using business: ${businesses[0].name} (${sampleBizId})`);

  // 2. Check pos_stock_idempotency table
  console.log("\n[CHECK 1] pos_stock_idempotency Table");
  const testKey = `verify_deploy_${Date.now()}`;
  const { error: insErr } = await supa.from("pos_stock_idempotency").insert({
    key: testKey,
    business_id: sampleBizId,
    operation: "verify_check",
  });
  assert(!insErr, `pos_stock_idempotency insert succeeded: ${insErr ? insErr.message : "OK"}`);

  // Cleanup test key
  await supa.from("pos_stock_idempotency").delete().eq("key", testKey);

  // 3. Check adjust_pos_stock_atomic RPC
  console.log("\n[CHECK 2] adjust_pos_stock_atomic RPC");
  const idempotencyKey = `rpc_verify_${Date.now()}`;
  const { data: rpcRes, error: rpcErr } = await supa.rpc("adjust_pos_stock_atomic", {
    p_business_id: sampleBizId,
    p_items: [],
    p_user_id: null,
    p_idempotency_key: idempotencyKey,
    p_strict_stock: false,
  });
  assert(!rpcErr, `adjust_pos_stock_atomic RPC call succeeded: ${rpcErr ? rpcErr.message : "OK"}`);
  assert(rpcRes && rpcRes.ok === true, `adjust_pos_stock_atomic returned valid JSON payload`);

  // Test idempotency replay
  const { data: replayRes } = await supa.rpc("adjust_pos_stock_atomic", {
    p_business_id: sampleBizId,
    p_items: [],
    p_user_id: null,
    p_idempotency_key: idempotencyKey,
    p_strict_stock: false,
  });
  assert(replayRes?.already_processed === true, `RPC idempotency deduplication active`);

  // Cleanup idempotency test key
  await supa.from("pos_stock_idempotency").delete().eq("key", idempotencyKey);

  // 4. Check get_platform_business_metrics RPC
  console.log("\n[CHECK 3] get_platform_business_metrics RPC");
  const { data: metrics, error: mErr } = await supa.rpc("get_platform_business_metrics");
  assert(!mErr, `get_platform_business_metrics RPC call succeeded: ${mErr ? mErr.message : "OK"}`);
  assert(Array.isArray(metrics), `Metrics RPC returned an array of business summaries (${metrics?.length ?? 0} businesses found)`);

  if (metrics && metrics.length > 0) {
    const first = metrics[0];
    const hasProps = "business_id" in first && "total_sales" in first && "total_expenses" in first && "order_count" in first;
    assert(hasProps, `Returned records contain expected analytical fields (sales, expenses, orders, users)`);
  }

  console.log("\n========================================================");
  console.log(`DEPLOYMENT VERIFICATION: ${passed} PASSED, ${failed} FAILED`);
  console.log("========================================================\n");

  if (failed > 0) process.exit(1);
}

run().catch((e) => {
  console.error("Fatal verification error:", e);
  process.exit(1);
});

