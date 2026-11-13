import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  validateTenantSlug,
  normalizeTenantSlug,
  sanitizeSlugCandidate,
  isReservedTenantSlug,
} from "../../lib/utils/slugValidator.ts";
import {
  resolveCanonicalHostname,
  resolveRequestHostname,
  sanitizeAndSetVerifiedTenantHeaders,
} from "../../lib/tenant/hostnameResolver.ts";
import {
  authorizeTenantContext,
  validateImpersonationGrant,
  deriveTenantRole,
  getPermissionsForRole,
  hasTenantPermission,
} from "../../lib/auth/authorization.ts";

describe("Phase 1 Security Suite — Hostname Resolution, Slug Validation & Zero-Trust Authorization", () => {
  describe("1. Authoritative Tenant Slug Validation (lib/utils/slugValidator.ts)", () => {
    it("accepts valid lowercase DNS-safe tenant slugs", () => {
      for (const validSlug of ["royal-baker", "bft-navalur", "cafe42", "a1b"]) {
        const res = validateTenantSlug(validSlug);
        assert.equal(res.valid, true, `Expected '${validSlug}' to be valid`);
        assert.equal(res.normalizedSlug, validSlug);
      }
    });

    it("normalizes uppercase and outer whitespace before validating", () => {
      const res = validateTenantSlug("  Royal-Baker-01  ");
      assert.equal(res.valid, true);
      assert.equal(res.normalizedSlug, "royal-baker-01");
      assert.equal(normalizeTenantSlug("  SHOP-A "), "shop-a");
    });

    it("rejects empty, too-short (<3), and too-long (>63) slugs", () => {
      assert.equal(validateTenantSlug("").code, "SLUG_REQUIRED");
      assert.equal(validateTenantSlug("ab").code, "SLUG_TOO_SHORT");
      assert.equal(validateTenantSlug("a".repeat(64)).code, "SLUG_TOO_LONG");
    });

    it("rejects leading/trailing hyphens, consecutive hyphens (--), punycode (xn--), and numeric-only slugs", () => {
      assert.equal(validateTenantSlug("-shopa").code, "SLUG_INVALID_FORMAT");
      assert.equal(validateTenantSlug("shopa-").code, "SLUG_INVALID_FORMAT");
      assert.equal(
        validateTenantSlug("shop--a").code,
        "SLUG_CONSECUTIVE_HYPHENS"
      );
      assert.equal(
        validateTenantSlug("xn--pple-43d").code,
        "SLUG_CONSECUTIVE_HYPHENS"
      );
      assert.equal(validateTenantSlug("123456").code, "SLUG_NUMERIC_ONLY");
      assert.equal(validateTenantSlug("shop_a").code, "SLUG_INVALID_FORMAT");
      assert.equal(validateTenantSlug("shop.a").code, "SLUG_INVALID_FORMAT");
    });

    it("blocks all reserved system, protocol, and platform subdomains", () => {
      const reservedSamples = [
        "www",
        "app",
        "api",
        "admin",
        "super-admin",
        "auth",
        "login",
        "signup",
        "dashboard",
        "pos",
        "billing",
        "support",
        "mail",
        "cdn",
        "storage",
        "realtime",
        "countercub",
        "seyalpro",
        "bftone",
        "null",
        "undefined",
        "default",
        "localhost",
      ];
      for (const reserved of reservedSamples) {
        assert.equal(isReservedTenantSlug(reserved), true);
        const res = validateTenantSlug(reserved);
        assert.equal(
          res.valid,
          false,
          `Expected reserved slug '${reserved}' to be rejected`
        );
        assert.equal(res.code, "SLUG_RESERVED");
      }
    });

    it("sanitizes rough display names into safe slug candidates", () => {
      assert.equal(
        sanitizeSlugCandidate("  Royal Baker's & Co!! "),
        "royal-baker-s-co"
      );
    });
  });

  describe("2. Centralized Canonical Hostname Parser & Tenant Resolver (lib/tenant/hostnameResolver.ts)", () => {
    it("resolves countercub.com and www.countercub.com as marketing context with null tenantSlug", () => {
      const root = resolveCanonicalHostname("countercub.com", {
        allowLocalhost: false,
      });
      assert.equal(root.valid, true);
      assert.equal(root.kind, "marketing");
      assert.equal(root.canonicalHost, "countercub.com");
      assert.equal(root.tenantSlug, null);

      const www = resolveCanonicalHostname("www.countercub.com", {
        allowLocalhost: false,
      });
      assert.equal(www.valid, true);
      assert.equal(www.kind, "marketing");
      assert.equal(www.canonicalHost, "countercub.com");
      assert.equal(www.tenantSlug, null);
    });

    it("resolves app.countercub.com and www.app.countercub.com as platform_admin context", () => {
      const appHost = resolveCanonicalHostname("app.countercub.com", {
        allowLocalhost: false,
      });
      assert.equal(appHost.valid, true);
      assert.equal(appHost.kind, "platform_admin");
      assert.equal(appHost.canonicalHost, "app.countercub.com");
      assert.equal(appHost.tenantSlug, null);
      assert.equal(appHost.isCanonicalRedirectRequired, false);

      const wwwApp = resolveCanonicalHostname("www.app.countercub.com", {
        allowLocalhost: false,
      });
      assert.equal(wwwApp.valid, true);
      assert.equal(wwwApp.kind, "platform_admin");
      assert.equal(wwwApp.canonicalHost, "app.countercub.com");
      assert.equal(wwwApp.isCanonicalRedirectRequired, true);
      assert.equal(wwwApp.redirectTargetHost, "app.countercub.com");
      assert.equal(wwwApp.tenantSlug, null);
    });

    it("resolves <tenant-slug>.countercub.com and normalizes case and trailing dots", () => {
      const tenant = resolveCanonicalHostname("Royal-Baker.CounterCub.COM.", {
        allowLocalhost: false,
      });
      assert.equal(tenant.valid, true);
      assert.equal(tenant.kind, "tenant_workspace");
      assert.equal(tenant.tenantSlug, "royal-baker");
      assert.equal(tenant.canonicalHost, "royal-baker.countercub.com");
    });

    it("rejects unexpected external domains, malformed hostnames, multi-level subdomains, and unexpected ports", () => {
      const evil = resolveCanonicalHostname("evil.com", {
        allowLocalhost: false,
      });
      assert.equal(evil.valid, false);
      assert.equal(evil.errorCode, "UNTRUSTED_DOMAIN");

      const suffixTrick = resolveCanonicalHostname("countercub.com.evil.com", {
        allowLocalhost: false,
      });
      assert.equal(suffixTrick.valid, false);
      assert.equal(suffixTrick.errorCode, "UNTRUSTED_DOMAIN");

      const multiSub = resolveCanonicalHostname("a.b.countercub.com", {
        allowLocalhost: false,
      });
      assert.equal(multiSub.valid, false);
      assert.equal(multiSub.errorCode, "MULTI_LEVEL_SUBDOMAIN_FORBIDDEN");

      const badPort = resolveCanonicalHostname(
        "royal-baker.countercub.com:8080",
        { allowLocalhost: false }
      );
      assert.equal(badPort.valid, false);
      assert.equal(badPort.errorCode, "UNEXPECTED_PORT");

      const reservedSub = resolveCanonicalHostname("admin.countercub.com", {
        allowLocalhost: false,
      });
      assert.equal(reservedSub.valid, false);
      assert.equal(reservedSub.errorCode, "RESERVED_SUBDOMAIN");
    });

    it("strips spoofed client tenant headers and ensures root/admin requests never inherit tenant context", () => {
      const incoming = new Headers({
        host: "countercub.com",
        "x-tenant-slug": "spoofed-shop",
        "x-verified-tenant-slug": "spoofed-shop",
        "x-tenant-id": "11111111-1111-1111-1111-111111111111",
        "x-tenant-context": "evil",
      });

      const rootRes = resolveCanonicalHostname("countercub.com", {
        allowLocalhost: false,
      });
      const sanitizedRoot = sanitizeAndSetVerifiedTenantHeaders(
        incoming,
        rootRes
      );

      assert.equal(sanitizedRoot.get("x-tenant-slug"), null);
      assert.equal(sanitizedRoot.get("x-verified-tenant-slug"), null);
      assert.equal(sanitizedRoot.get("x-tenant-id"), null);
      assert.equal(sanitizedRoot.get("x-tenant-context"), null);
      assert.equal(sanitizedRoot.get("x-verified-host-kind"), "marketing");

      const tenantRes = resolveCanonicalHostname("bft-navalur.countercub.com", {
        allowLocalhost: false,
      });
      const sanitizedTenant = sanitizeAndSetVerifiedTenantHeaders(
        incoming,
        tenantRes
      );
      assert.equal(
        sanitizedTenant.get("x-verified-tenant-slug"),
        "bft-navalur"
      );
      assert.equal(sanitizedTenant.get("x-tenant-slug"), "bft-navalur");
      assert.equal(sanitizedTenant.get("x-tenant-id"), null);
    });

    it("ignores spoofed X-Forwarded-Host pointing to an untrusted domain", () => {
      const headers = new Headers({
        host: "royal-baker.countercub.com",
        "x-forwarded-host": "evil-attacker.com",
      });
      const resolved = resolveRequestHostname(headers, {
        allowLocalhost: false,
      });
      assert.equal(resolved.valid, true);
      assert.equal(resolved.kind, "tenant_workspace");
      assert.equal(resolved.tenantSlug, "royal-baker");
    });
  });

  describe("3. Centralized Identity, Membership, Role & Impersonation Authorization (lib/auth/authorization.ts)", () => {
    const shopA = {
      id: "11111111-1111-1111-1111-111111111111",
      slug: "shop-a",
      name: "Shop A",
      status: "active",
    };
    const shopB = {
      id: "22222222-2222-2222-2222-222222222222",
      slug: "shop-b",
      name: "Shop B",
      status: "active",
    };

    const userAIdentity = {
      userId: "aaaa0000-0000-0000-0000-000000000001",
      email: "staff@shop-a.com",
      aal: "aal1",
    };

    const userAProfile = {
      id: userAIdentity.userId,
      email: userAIdentity.email,
      business_id: shopA.id,
      is_admin: false,
      is_stock_manager: false,
      is_super_admin: false,
      status: "active",
    };

    const superAdminIdentity = {
      userId: "99990000-0000-0000-0000-000000000099",
      email: "owner@countercub.com",
      aal: "aal2",
    };

    const superAdminProfile = {
      id: superAdminIdentity.userId,
      email: superAdminIdentity.email,
      business_id: null,
      is_admin: true,
      is_stock_manager: true,
      is_super_admin: true,
      status: "active",
    };

    it("authorizes a normal user when hostname matches their assigned business_id", () => {
      const hostRes = resolveCanonicalHostname("shop-a.countercub.com", {
        allowLocalhost: false,
      });
      const res = authorizeTenantContext({
        identity: userAIdentity,
        profile: userAProfile,
        hostnameResolution: hostRes,
        hostnameBusiness: shopA,
        requiredPermission: "pos:operate",
      });

      assert.equal(res.authorized, true);
      assert.equal(res.businessId, shopA.id);
      assert.equal(res.membership?.role, "staff");
      assert.equal(res.isImpersonating, false);
    });

    it("blocks a user of Shop A when visiting Shop B's subdomain (403 TENANT_HOSTNAME_MISMATCH)", () => {
      const hostRes = resolveCanonicalHostname("shop-b.countercub.com", {
        allowLocalhost: false,
      });
      const res = authorizeTenantContext({
        identity: userAIdentity,
        profile: userAProfile,
        hostnameResolution: hostRes,
        hostnameBusiness: shopB,
      });

      assert.equal(res.authorized, false);
      assert.equal(res.status, 403);
      assert.equal(res.errorCode, "TENANT_HOSTNAME_MISMATCH");
    });

    it("blocks a user of Shop A when requesting Shop B's business_id in API payload/params (403 CROSS_TENANT_ACCESS_DENIED)", () => {
      const res = authorizeTenantContext({
        identity: userAIdentity,
        profile: userAProfile,
        requestedBusinessId: shopB.id,
      });

      assert.equal(res.authorized, false);
      assert.equal(res.status, 403);
      assert.equal(res.errorCode, "CROSS_TENANT_ACCESS_DENIED");
    });

    it("fails closed with 404 TENANT_NOT_FOUND when visiting an unknown tenant subdomain", () => {
      const hostRes = resolveCanonicalHostname("unknown-shop.countercub.com", {
        allowLocalhost: false,
      });
      const res = authorizeTenantContext({
        identity: userAIdentity,
        profile: userAProfile,
        hostnameResolution: hostRes,
        hostnameBusiness: null,
      });

      assert.equal(res.authorized, false);
      assert.equal(res.status, 404);
      assert.equal(res.errorCode, "TENANT_NOT_FOUND");
    });

    it("enforces role and permission boundaries (staff cannot execute employees:manage or settings:manage)", () => {
      const res = authorizeTenantContext({
        identity: userAIdentity,
        profile: userAProfile,
        requiredPermission: "employees:manage",
      });

      assert.equal(res.authorized, false);
      assert.equal(res.status, 403);
      assert.equal(res.errorCode, "INSUFFICIENT_PERMISSION");

      const stockRole = deriveTenantRole({
        is_admin: false,
        is_stock_manager: true,
      });
      const stockPerms = getPermissionsForRole(stockRole);
      assert.equal(stockPerms.has("inventory:write"), true);
      assert.equal(stockPerms.has("employees:manage"), false);
      assert.equal(
        hasTenantPermission(
          {
            businessId: shopA.id,
            role: stockRole,
            permissions: stockPerms,
            isTenantAdmin: false,
            isStockManager: true,
            accountStatus: "active",
          },
          "inventory:write"
        ),
        true
      );
    });

    it("prevents a generic Super Admin flag from silently accessing tenant APIs without an active SupportImpersonationGrant", () => {
      const hostRes = resolveCanonicalHostname("shop-b.countercub.com", {
        allowLocalhost: false,
      });
      const resWithoutGrant = authorizeTenantContext({
        identity: superAdminIdentity,
        profile: superAdminProfile,
        hostnameResolution: hostRes,
        hostnameBusiness: shopB,
        impersonationGrant: null,
      });

      assert.equal(resWithoutGrant.authorized, false);
      assert.equal(resWithoutGrant.status, 403);
      assert.equal(resWithoutGrant.errorCode, "IMPERSONATION_GRANT_REQUIRED");
    });

    it("allows Super Admin cross-tenant support access ONLY with a valid, non-expired, reason-bound SupportImpersonationGrant", () => {
      const now = Date.now();
      const validGrant = {
        sessionId: "33333333-3333-4333-8333-333333333333",
        superAdminId: superAdminIdentity.userId,
        superAdminEmail: superAdminIdentity.email,
        targetBusinessId: shopB.id,
        targetBusinessSlug: shopB.slug,
        reason: "Investigating ticket CC-10492 for customer billing discrepancy",
        mfaVerified: true,
        createdAt: new Date(now - 60_000).toISOString(),
        expiresAt: new Date(now + 15 * 60_000).toISOString(),
        revokedAt: null,
      };

      const hostRes = resolveCanonicalHostname("shop-b.countercub.com", {
        allowLocalhost: false,
      });
      const resWithGrant = authorizeTenantContext({
        identity: superAdminIdentity,
        profile: superAdminProfile,
        hostnameResolution: hostRes,
        hostnameBusiness: shopB,
        impersonationGrant: validGrant,
      });

      assert.equal(resWithGrant.authorized, true);
      assert.equal(resWithGrant.businessId, shopB.id);
      assert.equal(resWithGrant.isImpersonating, true);

      // Expired grant must fail closed immediately
      const expiredGrant = {
        ...validGrant,
        createdAt: new Date(now - 25 * 60_000).toISOString(),
        expiresAt: new Date(now - 1000).toISOString(),
      };
      const expiredCheck = validateImpersonationGrant(
        expiredGrant,
        superAdminIdentity,
        true,
        shopB.id
      );
      assert.equal(expiredCheck.valid, false);
      assert.equal(expiredCheck.errorCode, "GRANT_EXPIRED");

      // Grant targeting Shop B cannot be used on Shop A
      const wrongTargetCheck = validateImpersonationGrant(
        validGrant,
        superAdminIdentity,
        true,
        shopA.id
      );
      assert.equal(wrongTargetCheck.valid, false);
      assert.equal(wrongTargetCheck.errorCode, "TARGET_MISMATCH");
    });
  });

  describe("4. Codebase Zero-Trust Invariants (No Hardcoded Email Privilege & User-Scoped Server Client)", () => {
    const rootDir = process.cwd();

    it("verifies serverAuth.ts uses createUserScopedServerClient for ordinary tenant requests", () => {
      const serverAuthContent = fs.readFileSync(
        path.join(rootDir, "lib", "auth", "serverAuth.ts"),
        "utf8"
      );
      assert.ok(
        serverAuthContent.includes("createUserScopedServerClient"),
        "serverAuth.ts must use createUserScopedServerClient to enforce RLS"
      );
      assert.ok(
        serverAuthContent.includes("authorizeTenantContext"),
        "serverAuth.ts must enforce authorizeTenantContext"
      );
    });

    it("verifies hardcoded admin@seyalpro.com privilege bypasses are removed from auth & context files", () => {
      const filesToCheck = [
        path.join(rootDir, "lib", "context", "TenantContext.tsx"),
        path.join(rootDir, "lib", "auth", "serverAuth.ts"),
        path.join(rootDir, "app", "login", "page.tsx"),
        path.join(rootDir, "app", "(protected)", "super-admin", "page.tsx"),
        path.join(rootDir, "app", "expenses", "page.tsx"),
      ];

      for (const filePath of filesToCheck) {
        const content = fs.readFileSync(filePath, "utf8");
        assert.equal(
          content.includes('=== "admin@seyalpro.com"') ||
            content.includes("=== 'admin@seyalpro.com'"),
          false,
          `Found forbidden hardcoded email privilege check in ${path.relative(rootDir, filePath)}`
        );
      }
    });
  });
});

