import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { evaluateWildcardTenantRoute } from "../../lib/tenant/wildcardRouter.ts";

const ROOT = process.cwd();

function readRepoFile(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

function runRoute(urlStr, headersObj = {}, options = { allowLocalhost: false }) {
  const url = new URL(urlStr);
  const headers = new Headers({
    host: url.host,
    ...headersObj,
  });
  return evaluateWildcardTenantRoute({
    url,
    headers,
    options,
  });
}

describe("Phase 4 Security Suite — Wildcard Domains, Canonical Hostname Routing & Zero-Trust Middleware", () => {
  describe("1. Canonical Marketing Domain Routing (countercub.com & www.countercub.com)", () => {
    it("resolves countercub.com and www.countercub.com as marketing host, rewrites / to /site, and never sets x-tenant-slug", () => {
      for (const host of ["countercub.com", "www.countercub.com"]) {
        const res = runRoute(`https://${host}/`, { host });
        assert.equal(res.action, "rewrite");
        assert.equal(res.status, 200);
        assert.equal(res.rewritePathname, "/site");
        assert.equal(res.responseHeaders["x-verified-host-kind"], "marketing");
        assert.equal(
          res.responseHeaders["x-verified-canonical-host"],
          "countercub.com"
        );
        assert.equal(res.responseHeaders["x-tenant-slug"], undefined);
        assert.equal(res.responseHeaders["x-verified-tenant-slug"], undefined);
        assert.equal(res.sanitizedRequestHeaders.get("x-tenant-slug"), null);
      }
    });

    it("strips spoofed client tenant headers, ignores ?tenant= query params, deletes stale tenant_slug cookies, and redirects shop paths on root domain to /", () => {
      const res = runRoute("https://www.countercub.com/billing?tenant=shop-b", {
        host: "www.countercub.com",
        "x-tenant-slug": "shop-b",
        "x-verified-tenant-slug": "shop-b",
        "x-tenant-id": "22222222-2222-2222-2222-222222222222",
        cookie: "tenant_slug=shop-b",
      });
      assert.equal(res.action, "redirect");
      assert.equal(res.status, 307);
      assert.equal(res.location, "https://www.countercub.com/");
      assert.equal(res.responseHeaders["x-verified-host-kind"], "marketing");
      assert.equal(res.responseHeaders["x-tenant-slug"], undefined);
      assert.equal(res.sanitizedRequestHeaders.get("x-tenant-slug"), null);
      assert.equal(
        res.sanitizedRequestHeaders.get("x-verified-tenant-slug"),
        null
      );
      assert.equal(res.sanitizedRequestHeaders.get("x-tenant-id"), null);
      assert.equal(res.deleteLegacyTenantCookie, true);
    });

    it("redirects /super-admin on countercub.com to https://app.countercub.com/ (308)", () => {
      const res = runRoute("https://countercub.com/super-admin?tenant=evil", {
        host: "countercub.com",
      });
      assert.equal(res.action, "redirect");
      assert.equal(res.status, 308);
      assert.equal(res.location, "https://app.countercub.com/");
    });
  });

  describe("2. Platform Administration Routing (app.countercub.com & www.app.countercub.com)", () => {
    it("redirects www.app.countercub.com to https://app.countercub.com with 308 Permanent Redirect", () => {
      const res = runRoute(
        "https://www.app.countercub.com/super-admin?tab=tenants&tenant=spoof",
        { host: "www.app.countercub.com" }
      );
      assert.equal(res.action, "redirect");
      assert.equal(res.status, 308);
      assert.equal(
        res.location,
        "https://app.countercub.com/super-admin?tab=tenants"
      );
    });

    it("resolves app.countercub.com as platform_admin, rewrites / to /super-admin, and redirects /login to /super-admin-login", () => {
      const rootRes = runRoute("https://app.countercub.com/", {
        host: "app.countercub.com",
      });
      assert.equal(rootRes.action, "rewrite");
      assert.equal(rootRes.status, 200);
      assert.equal(rootRes.rewritePathname, "/super-admin");
      assert.equal(
        rootRes.responseHeaders["x-verified-host-kind"],
        "platform_admin"
      );

      const loginRes = runRoute("https://app.countercub.com/login", {
        host: "app.countercub.com",
      });
      assert.equal(loginRes.action, "redirect");
      assert.equal(loginRes.status, 307);
      assert.equal(loginRes.location, "https://app.countercub.com/super-admin-login");

      const saLoginRes = runRoute("https://app.countercub.com/super-admin-login", {
        host: "app.countercub.com",
      });
      assert.equal(saLoginRes.action, "rewrite");
      assert.equal(saLoginRes.status, 200);
      assert.equal(saLoginRes.rewritePathname, "/super-admin/login");

      const portalRes = runRoute("https://app.countercub.com/super-admin", {
        host: "app.countercub.com",
        "x-tenant-slug": "spoofed-shop",
      });
      assert.equal(portalRes.action, "redirect");
      assert.equal(portalRes.status, 307);
      assert.equal(portalRes.location, "https://app.countercub.com/");
    });
  });

  describe("3. Wildcard Tenant Workspace Routing (<tenant-slug>.countercub.com)", () => {
    it("resolves <tenant-slug>.countercub.com and overrides any spoofed header, cookie, or query parameter", () => {
      const res = runRoute(
        "https://bft-navalur.countercub.com/billing?tenant=other-shop",
        {
          host: "BFT-Navalur.CounterCub.com.",
          "x-tenant-slug": "other-shop",
          "x-verified-tenant-slug": "other-shop",
          cookie: "tenant_slug=other-shop",
        }
      );
      assert.equal(res.action, "next");
      assert.equal(res.status, 200);
      assert.equal(
        res.responseHeaders["x-verified-host-kind"],
        "tenant_workspace"
      );
      assert.equal(
        res.responseHeaders["x-verified-canonical-host"],
        "bft-navalur.countercub.com"
      );
      assert.equal(
        res.responseHeaders["x-verified-tenant-slug"],
        "bft-navalur"
      );
      assert.equal(res.responseHeaders["x-tenant-slug"], "bft-navalur");
      assert.equal(
        res.sanitizedRequestHeaders.get("x-verified-tenant-slug"),
        "bft-navalur"
      );
      assert.equal(res.deleteLegacyTenantCookie, true);
    });

    it("blocks /api/super-admin/businesses on customer tenant subdomains with 403 while permitting /api/super-admin/impersonation", () => {
      const blockedApiRes = runRoute(
        "https://bft-navalur.countercub.com/api/super-admin/businesses",
        { host: "bft-navalur.countercub.com" }
      );
      assert.equal(blockedApiRes.action, "json_error");
      assert.equal(blockedApiRes.status, 403);
      assert.equal(blockedApiRes.jsonBody?.code, "SUPER_ADMIN_HOST_REQUIRED");

      const allowedImpRes = runRoute(
        "https://bft-navalur.countercub.com/api/super-admin/impersonation",
        { host: "bft-navalur.countercub.com" }
      );
      assert.equal(allowedImpRes.action, "next");
      assert.equal(allowedImpRes.status, 200);

      const superAdminPageRes = runRoute(
        "https://bft-navalur.countercub.com/super-admin",
        { host: "bft-navalur.countercub.com" }
      );
      assert.equal(superAdminPageRes.action, "redirect");
      assert.equal(superAdminPageRes.status, 307);
      assert.equal(
        superAdminPageRes.location,
        "https://app.countercub.com/super-admin"
      );
    });
  });

  describe("4. Reserved Subdomains, Invalid Subdomains, Legacy Redirects & Untrusted Hosts", () => {
    it("rewrites reserved or invalid subdomains (admin.countercub.com, api.countercub.com, a.b.countercub.com) to /tenant-not-found with 404", () => {
      for (const badHost of [
        "admin.countercub.com",
        "api.countercub.com",
        "mail.countercub.com",
        "a.b.countercub.com",
        "12345.countercub.com",
      ]) {
        const pageRes = runRoute(`https://${badHost}/billing`, {
          host: badHost,
        });
        assert.equal(
          pageRes.action,
          "rewrite",
          `Expected rewrite for reserved/invalid host ${badHost}`
        );
        assert.equal(pageRes.status, 404);
        assert.equal(pageRes.rewritePathname, "/tenant-not-found");
        assert.equal(pageRes.responseHeaders["x-tenant-slug"], undefined);

        const apiRes = runRoute(`https://${badHost}/api/invoices`, {
          host: badHost,
        });
        assert.equal(apiRes.action, "json_error");
        assert.equal(apiRes.status, 404);
      }
    });

    it("redirects legacy seyalpro.com / seyalpro.in domains to canonical countercub.com with 308", () => {
      const legacyRootRes = runRoute("https://www.seyalpro.com/login", {
        host: "www.seyalpro.com",
      });
      assert.equal(legacyRootRes.action, "redirect");
      assert.equal(legacyRootRes.status, 308);
      assert.equal(legacyRootRes.location, "https://countercub.com/login");

      const legacyTenantRes = runRoute(
        "https://royal-baker.seyalpro.in/billing?tab=pos&tenant=evil",
        { host: "royal-baker.seyalpro.in" }
      );
      assert.equal(legacyTenantRes.action, "redirect");
      assert.equal(legacyTenantRes.status, 308);
      assert.equal(
        legacyTenantRes.location,
        "https://royal-baker.countercub.com/billing?tab=pos"
      );
    });

    it("rejects untrusted external Host headers with 400 Bad Request", () => {
      for (const untrusted of ["evil.com", "countercub.com.evil.com"]) {
        const res = runRoute(`https://${untrusted}/billing`, {
          host: untrusted,
        });
        assert.equal(res.action, "json_error");
        assert.equal(res.status, 400);
        assert.equal(res.jsonBody?.code, "UNTRUSTED_DOMAIN");
        assert.equal(res.responseHeaders["x-tenant-slug"], undefined);
      }
    });

    it("preserves backwards-compatible /baker/* -> /b2b/* 307 redirect", () => {
      const res = runRoute(
        "https://royal-baker.countercub.com/baker/orders",
        { host: "royal-baker.countercub.com" }
      );
      assert.equal(res.action, "redirect");
      assert.equal(res.status, 307);
      assert.equal(
        res.location,
        "https://royal-baker.countercub.com/b2b/orders"
      );
    });
  });

  describe("5. Middleware Integration, Tenant Resolution Endpoint & Visible Impersonation State", () => {
    it("verifies middleware.ts delegates to evaluateWildcardTenantRoute and never sets tenant_slug cookies or reads ?tenant=", () => {
      const mwSrc = readRepoFile("middleware.ts");
      assert.match(mwSrc, /evaluateWildcardTenantRoute/);
      assert.doesNotMatch(mwSrc, /searchParams\.get\("tenant"\)/);
      assert.doesNotMatch(mwSrc, /cookies\.get\("tenant_slug"\)/);
      assert.doesNotMatch(mwSrc, /cookies\.set\("tenant_slug"/);
    });

    it("verifies /api/public/tenant-resolve checks retired_slugs (TENANT_RETIRED) and suspended status (TENANT_SUSPENDED)", () => {
      const src = readRepoFile("app/api/public/tenant-resolve/route.ts");
      assert.match(src, /from\("retired_slugs"\)/);
      assert.match(src, /TENANT_RETIRED/);
      assert.match(src, /TENANT_SUSPENDED/);
      assert.match(src, /biz\.is_active === false/);
    });

    it("verifies app/tenant-not-found/page.tsx and AppShell zero-trust error & impersonation banner", () => {
      const notFoundSrc = readRepoFile("app/tenant-not-found/page.tsx");
      assert.match(notFoundSrc, /404 — Workspace Not Found/);
      assert.match(notFoundSrc, /https:\/\/www\.countercub\.com/);

      const appShellSrc = readRepoFile("components/layout/AppShell.tsx");
      assert.match(appShellSrc, /AUDITED SUPPORT SESSION/);
      assert.match(appShellSrc, /Exit Support Session/);
      assert.match(appShellSrc, /TENANT_RETIRED/);
      assert.match(appShellSrc, /TENANT_HOSTNAME_MISMATCH/);
      assert.match(appShellSrc, /IMPERSONATION_REQUIRED/);
    });
  });
});
