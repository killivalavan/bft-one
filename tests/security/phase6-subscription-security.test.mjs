import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function readRel(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

test("Migration enforces zero-trust RLS, grants, advisory locks, and search_path pinning", () => {
  const sql = readRel("supabase/migrations/202611140001_subscription_plan_management.up.sql");

  for (const tbl of [
    "subscription_plans",
    "tenant_subscriptions",
    "subscription_events",
    "subscription_requests",
  ]) {
    assert.match(sql, new RegExp(`ALTER TABLE public\\.${tbl} ENABLE ROW LEVEL SECURITY;`, "i"));
  }

  // Store Admins cannot mutate plans, subscriptions, or audit events directly
  assert.match(sql, /REVOKE INSERT, UPDATE, DELETE ON public\.subscription_plans FROM authenticated;/i);
  assert.match(sql, /REVOKE INSERT, UPDATE, DELETE ON public\.tenant_subscriptions FROM authenticated;/i);
  assert.match(sql, /REVOKE INSERT, UPDATE, DELETE ON public\.subscription_events FROM authenticated;/i);
  assert.match(sql, /REVOKE UPDATE, DELETE ON public\.subscription_requests FROM authenticated;/i);

  // SECURITY DEFINER functions must pin search_path = ''
  const secDefMatches = sql.match(/^\s*SECURITY DEFINER\s*$/gim) || [];
  const searchPathMatches = sql.match(/^\s*SET search_path = ''\s*$/gim) || [];
  assert.ok(secDefMatches.length >= 3, "Expected at least 3 SECURITY DEFINER functions");
  assert.equal(searchPathMatches.length, secDefMatches.length, "All SECURITY DEFINER functions must set search_path = ''");

  // Concurrency-safe advisory locks on product & employee seat triggers
  assert.match(sql, /pg_advisory_xact_lock\(/);
  assert.match(sql, /SUBSCRIPTION_PRODUCT_LIMIT_REACHED/);
  assert.match(sql, /SUBSCRIPTION_SEAT_LIMIT_REACHED/);

  // Store Admin (is_admin = true) must not consume an employee seat
  assert.match(sql, /COALESCE\(NEW\.is_admin, false\) = false/);
});

test("Subscription API routes enforce authentication and Super Admin authorization", () => {
  const plansApi = readRel("app/api/super-admin/plans/route.ts");
  assert.match(plansApi, /requireSuperAdmin:\s*true/);

  const subsApi = readRel("app/api/super-admin/subscriptions/route.ts");
  assert.match(subsApi, /requireSuperAdmin:\s*true/);

  const meApi = readRel("app/api/subscription/me/route.ts");
  assert.match(meApi, /authenticateRequest\(request\)/);
  assert.match(meApi, /requireAdmin:\s*true/);

  const seedAdminApi = readRel("app/api/seed-admin/route.ts");
  assert.match(seedAdminApi, /SUBSCRIPTION_SEAT_LIMIT_REACHED/);
  assert.match(seedAdminApi, /!userId && !isAdmin/);

  const b2bProductsApi = readRel("app/api/b2b/products/route.ts");
  assert.match(b2bProductsApi, /SUBSCRIPTION_PRODUCT_LIMIT_REACHED/);

  const smartImportApi = readRel("app/api/smart-import/execute/route.ts");
  assert.match(smartImportApi, /SUBSCRIPTION_PRODUCT_LIMIT_REACHED/);
});
