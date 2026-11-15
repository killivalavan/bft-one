import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function readRepoFile(relPath) {
  return fs.readFileSync(path.join(process.cwd(), relPath), "utf8");
}

describe("Phase 7 Security Suite — Super Admin Mandatory 2FA (AAL2) Enforcement", () => {
  it("1. (Scenarios A, B, C, D) Login portal mandates TOTP enrollment or challenge and never redirects to '/' without verified MFA", () => {
    const src = readRepoFile("app/super-admin/login/page.tsx");

    // Must not redirect to '/' when !verifiedFactor
    const noFactorBlock = src.slice(
      src.indexOf("if (!verifiedFactor)"),
      src.indexOf("if (currentAal === \"aal2\")")
    );
    assert.ok(noFactorBlock.length > 0, "Expected if (!verifiedFactor) block in login page");
    assert.doesNotMatch(
      noFactorBlock,
      /window\.location\.href\s*=\s*["']\/["']/,
      "Super Admin without verified TOTP factor must not be redirected to '/'"
    );
    assert.match(
      noFactorBlock,
      /supabaseClient\.auth\.mfa\.enroll/,
      "Existing AAL1 session without verified factor must initiate mandatory TOTP enrollment"
    );
    assert.match(
      noFactorBlock,
      /setStep\(["']mfa_enroll["']\)/,
      "Must transition to mfa_enroll step when no verified factor exists"
    );

    // Scenario D: Must unenroll stale unverified factors before enrolling a new one.
    // listFactors().totp only returns VERIFIED factors in auth-js v2, so cleanup must iterate .all
    assert.match(
      src,
      /supabaseClient\.auth\.mfa\.unenroll/,
      "Must clean up unverified TOTP factors before enrolling to prevent duplicate friendlyName errors"
    );
    assert.match(
      src,
      /factorsData\?\.all/,
      "Unverified factor cleanup must iterate listFactors().all (totp excludes unverified factors)"
    );
    assert.doesNotMatch(
      src,
      /for \(const f of totpFactors\)/,
      "Cleanup loop over totpFactors is a no-op because totp only contains verified factors"
    );

    // Scenario A & F: Only redirects to '/' when currentAal === 'aal2' or after challengeAndVerify / verify
    assert.match(src, /if\s*\(\s*currentAal\s*===\s*["']aal2["']\s*\)/);
    assert.match(src, /supabaseClient\.auth\.mfa\.challengeAndVerify/);
    assert.match(src, /supabaseClient\.auth\.mfa\.verify/);
  });

  it("2. (Scenarios F, G) ProtectedLayout and SuperAdminPage block AAL1 sessions from rendering the dashboard via direct URL access", () => {
    const layoutSrc = readRepoFile("app/(protected)/layout.tsx");
    assert.match(
      layoutSrc,
      /getAuthenticatorAssuranceLevel/,
      "ProtectedLayout must verify MFA Authenticator Assurance Level on Super Admin routes"
    );
    assert.match(
      layoutSrc,
      /currentLevel\s*!==\s*["']aal2["']/,
      "ProtectedLayout must redirect non-AAL2 Super Admin sessions to /super-admin-login"
    );

    const saPageSrc = readRepoFile("app/(protected)/super-admin/page.tsx");
    const initAuthSection = saPageSrc.slice(
      saPageSrc.indexOf("async function initAuth()"),
      saPageSrc.indexOf("await loadBusinessesData();")
    );
    assert.match(
      initAuthSection,
      /getAuthenticatorAssuranceLevel/,
      "SuperAdminPage initAuth must check getAuthenticatorAssuranceLevel before setting Ready or loading data"
    );
    assert.match(
      initAuthSection,
      /currentLevel\s*!==\s*["']aal2["']/,
      "SuperAdminPage initAuth must block non-AAL2 sessions before setViewState(SuperAdminView.Ready)"
    );
  });

  it("3. (Scenario E) Server-side authenticateRequest and all privileged Super Admin APIs enforce AAL2", () => {
    const serverAuthSrc = readRepoFile("lib/auth/serverAuth.ts");
    assert.match(
      serverAuthSrc,
      /const shouldRequireAAL2 = options\.requireAAL2 !== false;/,
      "requireSuperAdmin must default to requiring AAL2"
    );
    assert.match(
      serverAuthSrc,
      /if\s*\(shouldRequireAAL2\s*&&\s*aal\s*!==\s*["']aal2["']\)/,
      "Server must reject AAL1 tokens when AAL2 is required"
    );

    const privilegedRoutes = [
      "app/api/super-admin/businesses/route.ts",
      "app/api/super-admin/plans/route.ts",
      "app/api/super-admin/subscriptions/route.ts",
      "app/api/super-admin/reset-password/route.ts",
    ];

    for (const routePath of privilegedRoutes) {
      const routeSrc = readRepoFile(routePath);
      assert.match(routeSrc, /requireSuperAdmin:\s*true/, `${routePath} must requireSuperAdmin: true`);
      assert.doesNotMatch(routeSrc, /requireAAL2:\s*false/, `${routePath} must never disable AAL2 enforcement`);
    }

    const impersonationSrc = readRepoFile("app/api/super-admin/impersonation/route.ts");
    assert.match(
      impersonationSrc,
      /export async function POST[\s\S]*?requireSuperAdmin:\s*true[\s\S]*?requireAAL2:\s*true/,
      "Starting an impersonation session (POST) must strictly require AAL2"
    );
  });

  it("4. (Scenario H) Store login blocks Super Admin accounts and does not allow bypassing Platform 2FA", () => {
    const storeLoginSrc = readRepoFile("app/login/page.tsx");
    assert.match(
      storeLoginSrc,
      /if\s*\(isSuperAdmin[^)]*\)\s*\{[\s\S]*?setSuperAdminNotice\(true\)/,
      "Store login must block Super Admin accounts and display the Platform Portal (2FA) redirect notice"
    );
    assert.match(
      storeLoginSrc,
      /getPlatformAdminUrl\(["']\/super-admin-login["']\)/,
      "Store login must direct Super Admin accounts to the 2FA Platform Portal"
    );
  });

  it("5. (Scenario H) Manage 2FA modal requires AAL2, step-up with a different device, and never removes the last device", () => {
    const src = readRepoFile("components/super-admin/ManageMfaModal.tsx");
    assert.match(src, /getAuthenticatorAssuranceLevel/, "Device management must require an AAL2 session");
    assert.match(
      src,
      /factors\.find\(\(f\) => f\.id !== removing\.id\)/,
      "Step-up verification must use a device other than the one being removed"
    );
    assert.match(
      src,
      /challengeAndVerify\(\{\s*factorId: stepUpFactor\.id/,
      "Removal must be preceded by a fresh TOTP challenge on the step-up device"
    );
    assert.match(src, /factors\.length < 2/, "Must block removal of the last verified 2FA device");
    assert.doesNotMatch(src, /SERVICE_ROLE|supabaseAdmin/, "Client component must never use service-role credentials");

    const saPageSrc = readRepoFile("app/(protected)/super-admin/page.tsx");
    assert.match(saPageSrc, /<ManageMfaModal/, "Super Admin dashboard must expose the Manage 2FA modal");
  });
});
