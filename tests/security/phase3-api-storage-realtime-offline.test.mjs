/**
 * CounterCub — Phase 3 Automated Security Verification Suite
 * ============================================================================
 * Verifies:
 * 1. CSRF & Same-Origin Verification + Sliding-Window Rate Limiting (`lib/security/csrf.ts`)
 * 2. API Route Tenant Isolation (`SEC-04`, `SEC-05`, `SEC-12`, `SEC-13`, `SEC-14`, `SEC-15`)
 * 3. Private Storage & Signed URL Enforcement (`SEC-13`)
 * 4. Realtime Tenant Filter Enforcement (`SEC-17`)
 * 5. Next.js Security Headers, Service Worker HTML Cache Prevention & Logout Purge (`SEC-16`, `SEC-18`)
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { verifySameOriginCsrf, checkRateLimit } from "../../lib/security/csrf.ts";

const ROOT = process.cwd();

function readRepoFile(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

test("Phase 3.1 — CSRF & Same-Origin Verification (lib/security/csrf.ts)", async (t) => {
  await t.test("Safe HTTP methods (GET, HEAD, OPTIONS) always pass CSRF checks", () => {
    const req = new Request("https://shop-a.countercub.com/api/invoices", {
      method: "GET",
      headers: {
        host: "shop-a.countercub.com",
        origin: "https://evil.example.com",
      },
    });
    assert.equal(verifySameOriginCsrf(req).ok, true);
  });

  await t.test("Mutating requests with Sec-Fetch-Site: cross-site are blocked", () => {
    const req = new Request("https://shop-a.countercub.com/api/orders/cancel", {
      method: "POST",
      headers: {
        host: "shop-a.countercub.com",
        "sec-fetch-site": "cross-site",
      },
    });
    const res = verifySameOriginCsrf(req);
    assert.equal(res.ok, false);
    assert.match(res.reason || "", /Sec-Fetch-Site/i);
  });

  await t.test("Mutating requests from external untrusted Origin are blocked", () => {
    const req = new Request("https://shop-a.countercub.com/api/admin-users", {
      method: "DELETE",
      headers: {
        host: "shop-a.countercub.com",
        origin: "https://attacker-site.org",
      },
    });
    const res = verifySameOriginCsrf(req);
    assert.equal(res.ok, false);
    assert.match(res.reason || "", /Untrusted request origin/i);
  });

  await t.test("Cross-tenant subdomain CSRF (shop-a -> shop-b) is blocked", () => {
    const req = new Request("https://shop-b.countercub.com/api/notifications", {
      method: "DELETE",
      headers: {
        host: "shop-b.countercub.com",
        origin: "https://shop-a.countercub.com",
      },
    });
    const res = verifySameOriginCsrf(req);
    assert.equal(res.ok, false);
    assert.match(res.reason || "", /Cross-subdomain origin mismatch/i);
  });

  await t.test("Same-origin tenant mutating requests (shop-a -> shop-a) are allowed", () => {
    const req = new Request("https://shop-a.countercub.com/api/notifications", {
      method: "PATCH",
      headers: {
        host: "shop-a.countercub.com",
        origin: "https://shop-a.countercub.com",
      },
    });
    const res = verifySameOriginCsrf(req);
    assert.equal(res.ok, true);
  });

  await t.test("Sliding-window rate limiter enforces request ceiling and recovers after window", () => {
    const key = `test-rl-${Date.now()}`;
    const t0 = 1_000_000;
    assert.equal(checkRateLimit(key, 3, 10_000, t0).allowed, true);
    assert.equal(checkRateLimit(key, 3, 10_000, t0 + 100).allowed, true);
    assert.equal(checkRateLimit(key, 3, 10_000, t0 + 200).allowed, true);
    const blocked = checkRateLimit(key, 3, 10_000, t0 + 300);
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.remaining, 0);

    // After window expires, requests are allowed again
    const recovered = checkRateLimit(key, 3, 10_000, t0 + 10_001);
    assert.equal(recovered.allowed, true);
  });
});

test("Phase 3.2 — API Route Tenant Isolation & Fail-Closed Ownership Checks", async (t) => {
  await t.test("authenticateRequest enforces verifySameOriginCsrf before processing requests", () => {
    const src = readRepoFile("lib/auth/serverAuth.ts");
    assert.match(src, /verifySameOriginCsrf\(request\)/);
    assert.match(src, /CSRF_ORIGIN_MISMATCH/);
  });

  await t.test("app/api/admin-users/route.ts scopes all deletes/updates by business_id and fails closed", () => {
    const src = readRepoFile("app/api/admin-users/route.ts");
    assert.match(src, /if\s*\(!targetProfile\.business_id\s*\|\|\s*targetProfile\.business_id\s*!==\s*caller\.businessId\)/);
    assert.match(src, /\.from\("salary_entries"\)\.delete\(\)\.eq\("user_id",\s*userId\)\.eq\("business_id",\s*targetBizId\)/);
    assert.match(src, /\.from\("leaves"\)\.delete\(\)\.eq\("user_id",\s*userId\)\.eq\("business_id",\s*targetBizId\)/);
    assert.match(src, /\.from\("timesheets"\)\.delete\(\)\.eq\("user_id",\s*userId\)\.eq\("business_id",\s*targetBizId\)/);
    assert.match(src, /\.from\("profiles"\)\s*\.delete\(\)\s*\.eq\("id",\s*userId\)\s*\.eq\("business_id",\s*targetBizId\)/);
  });

  await t.test("app/api/admin/employee-hub/route.ts fails closed on null business_id and scopes all mutations by business_id", () => {
    const src = readRepoFile("app/api/admin/employee-hub/route.ts");
    assert.match(src, /if\s*\(!p\s*\|\|\s*!p\.business_id\s*\|\|\s*p\.business_id\s*!==\s*caller\.businessId\)/);
    assert.doesNotMatch(src, /!caller\.isSuperAdmin/);
    // All profile updates in employee-hub must include .eq("business_id", ...)
    const profileUpdates = src.split('.from("profiles")').slice(1);
    assert.ok(profileUpdates.length >= 3);
    for (const block of profileUpdates) {
      assert.match(block.slice(0, 320), /\.eq\("business_id",/);
    }
  });

  await t.test("app/api/employee/hub-data/route.ts fails closed on null business_id and filters queries by business_id", () => {
    const src = readRepoFile("app/api/employee/hub-data/route.ts");
    assert.match(src, /if\s*\(!profile\.business_id\s*\|\|\s*profile\.business_id\s*!==\s*caller\.businessId\)/);
    assert.match(src, /\.from\("employee_increments"\)[\s\S]{0,220}\.eq\("business_id",\s*caller\.businessId\)/);
    assert.match(src, /\.from\("employee_achievements"\)[\s\S]{0,220}\.eq\("business_id",\s*caller\.businessId\)/);
  });

  await t.test("app/api/payslips/upload/route.ts enforces path traversal guard, tenant prefix, and 5-min signed URL (SEC-13)", () => {
    const src = readRepoFile("app/api/payslips/upload/route.ts");
    assert.match(src, /userId\.includes\("\.\."\)/);
    assert.match(src, /if\s*\(!targetProfile\.business_id\s*\|\|\s*targetProfile\.business_id\s*!==\s*caller\.businessId\)/);
    assert.match(src, /const filePath = `\$\{caller\.businessId\}\/\$\{sanitizedUserId\}\/\$\{sanitizedMonth\}_payslip\.pdf`/);
    assert.match(src, /\.createSignedUrl\(filePath,\s*300\)/);
    assert.doesNotMatch(src, /\.getPublicUrl\(/);
  });

  await t.test("app/api/super-admin/businesses/route.ts enforces validateTenantSlug, retired_slugs check, 400/409 responses, and BUSINESS_SLUG_CHANGED audit log (SEC-12)", () => {
    const src = readRepoFile("app/api/super-admin/businesses/route.ts");
    assert.match(src, /validateTenantSlug\(slug\)/);
    assert.match(src, /\.from\("retired_slugs"\)/);
    assert.match(src, /status:\s*409/);
    assert.match(src, /BUSINESS_SLUG_CHANGED/);
    assert.match(src, /https:\/\/\$\{normalizedSlug\}\.countercub\.com/);
    assert.doesNotMatch(src, /seyalpro\.com/);
  });

  await t.test("app/api/baker/clients/lookup/route.ts scopes lookup to b2b_clients and never enumerates public.businesses (SEC-14)", () => {
    const src = readRepoFile("app/api/baker/clients/lookup/route.ts");
    assert.match(src, /\.from\("b2b_clients"\)/);
    assert.match(src, /\.eq\("business_id",\s*caller\.businessId\)/);
    assert.doesNotMatch(src, /\.from\("businesses"\)/);
  });

  await t.test("app/api/invoices/route.ts and app/api/audit-logs/route.ts do not use supabaseAdmin() for tenant CRUD", () => {
    const invSrc = readRepoFile("app/api/invoices/route.ts");
    assert.doesNotMatch(invSrc, /supabaseAdmin/);

    const auditSrc = readRepoFile("app/api/audit-logs/route.ts");
    assert.doesNotMatch(auditSrc, /supabaseAdmin/);
  });

  await t.test("app/api/inventory/audit/route.ts includes business_id on stock_audit_items inserts", () => {
    const src = readRepoFile("app/api/inventory/audit/route.ts");
    assert.match(src, /auditItems\.push\(\{\s*business_id:\s*user\.businessId/);
  });
});

test("Phase 3.3 — Realtime Subscriptions Enforce Explicit business_id Filter (SEC-17)", async (t) => {
  await t.test("daily-sales, notifications, pending, and useUnreadNotificationsCount all pass business_id=eq.<id> filter", () => {
    const dailySales = readRepoFile("app/(protected)/daily-sales/page.tsx");
    assert.match(dailySales, /const tenantFilter = `business_id=eq\.\$\{business\.id\}`/);
    assert.match(dailySales, /table:\s*"orders",\s*filter:\s*tenantFilter/);
    assert.match(dailySales, /table:\s*"order_items",\s*filter:\s*tenantFilter/);

    const notifsPage = readRepoFile("app/(protected)/notifications/page.tsx");
    assert.match(notifsPage, /filter:\s*`business_id=eq\.\$\{activeBizId\}`/);

    const pendingPage = readRepoFile("app/(protected)/pending/page.tsx");
    assert.match(pendingPage, /const tenantFilter = `business_id=eq\.\$\{business\.id\}`/);
    assert.match(pendingPage, /table:\s*'orders',\s*filter:\s*tenantFilter/);
    assert.match(pendingPage, /table:\s*'order_items',\s*filter:\s*tenantFilter/);

    const unreadHook = readRepoFile("lib/hooks/useUnreadNotificationsCount.ts");
    assert.match(unreadHook, /filter:\s*`business_id=eq\.\$\{bizId\}`/);
  });
});

test("Phase 3.4 — Next.js Headers, Service Worker Navigation Isolation & Client Logout Purge (SEC-16, SEC-18)", async (t) => {
  await t.test("next.config.ts configures CSP, HSTS, X-Frame-Options, and private no-store + Vary on /api/*", () => {
    const cfg = readRepoFile("next.config.ts");
    assert.match(cfg, /Content-Security-Policy/);
    assert.match(cfg, /Strict-Transport-Security/);
    assert.match(cfg, /X-Frame-Options/);
    assert.match(cfg, /private, no-store, no-cache, max-age=0, must-revalidate/);
    assert.match(cfg, /Host, Origin, Authorization, Cookie/);
  });

  await t.test("public/sw.js uses countercub-pos-v3, never caches HTML navigate requests, and handles CLEAR_TENANT_CACHE", () => {
    const sw = readRepoFile("public/sw.js");
    assert.match(sw, /const CACHE_NAME = "countercub-pos-v3"/);
    assert.match(sw, /event\.data\.type === "CLEAR_TENANT_CACHE"/);
    // Ensure navigate mode does not call cache.put
    const navSection = sw.slice(sw.indexOf('event.request.mode === "navigate"'));
    assert.doesNotMatch(navSection, /cache\.put/);
  });

  await t.test("lib/auth/clientLogout.ts purges Service Worker CacheStorage, impersonation cookie, and IndexedDB on logout", () => {
    const logoutSrc = readRepoFile("lib/auth/clientLogout.ts");
    assert.match(logoutSrc, /cc_impersonation_session=;/);
    assert.match(logoutSrc, /CLEAR_TENANT_CACHE/);
    assert.match(logoutSrc, /window\.caches\.delete/);
    assert.match(logoutSrc, /countercub_offline_v1/);
  });
});

