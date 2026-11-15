import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();

describe("Resend Email Integration Security & Configuration", () => {
  it("reads RESEND_API_KEY exclusively from process.env on the server and never exposes NEXT_PUBLIC_", () => {
    const clientPath = path.join(rootDir, "lib", "email", "resendClient.ts");
    const content = fs.readFileSync(clientPath, "utf8");

    assert.match(content, /process\.env\.RESEND_API_KEY/);
    assert.doesNotMatch(content, /NEXT_PUBLIC_/);
    assert.match(content, /typeof window !== "undefined"/);
    assert.match(content, /CounterCub Support <support@countercub\.com>/);
    assert.match(content, /support@countercub\.com/);
  });

  it("enforces Super Admin auth, rate limiting, and DB-resolved verified email on test email route", () => {
    const routePath = path.join(
      rootDir,
      "app",
      "api",
      "super-admin",
      "email",
      "test",
      "route.ts"
    );
    const content = fs.readFileSync(routePath, "utf8");

    assert.match(content, /authenticateRequest\(request,\s*\{\s*requireSuperAdmin:\s*true\s*\}\)/);
    assert.match(content, /checkRateLimit\(/);
    assert.match(content, /email_confirmed_at/);
    assert.match(content, /SUPER_ADMIN_TEST_EMAIL_SENT/);
    assert.doesNotMatch(content, /request\.json\(/);
  });
});

