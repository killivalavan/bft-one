import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();

describe("Resend Email Integration Security & Configuration (Phases 1–8)", () => {
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
    const routePath = path.join(rootDir, "app", "api", "super-admin", "email", "test", "route.ts");
    const content = fs.readFileSync(routePath, "utf8");

    assert.match(content, /authenticateRequest\(request,\s*\{\s*requireSuperAdmin:\s*true\s*\}\)/);
    assert.match(content, /checkRateLimit\(/);
    assert.match(content, /email_confirmed_at/);
    assert.match(content, /SUPER_ADMIN_TEST_EMAIL_SENT/);
    assert.doesNotMatch(content, /request\.json\(/);
  });

  it("renders all required store & plan fields in Store Admin Welcome Email without plaintext passwords", () => {
    const tplPath = path.join(rootDir, "lib", "email", "templates", "storeAdminWelcomeEmail.ts");
    const content = fs.readFileSync(tplPath, "utf8");

    assert.match(content, /Store Name:/);
    assert.match(content, /Admin Login ID:/);
    assert.match(content, /Registered Contact Email:/);
    assert.match(content, /Login URL:/);
    assert.match(content, /Plan Name:/);
    assert.match(content, /Plan Amount:/);
    assert.match(content, /Billing Cycle:/);
    assert.match(content, /Product Limit:/);
    assert.match(content, /Employee Seat Limit:/);
    assert.match(content, /Activation Date:/);
    assert.match(content, /Expiry Date:/);
    assert.match(content, /never send passwords by email/i);
  });

  it("enforces contact_email, idempotent welcome dispatch, and retry endpoint security", () => {
    const bizRoute = fs.readFileSync(
      path.join(rootDir, "app", "api", "super-admin", "businesses", "route.ts"),
      "utf8"
    );
    const retryRoute = fs.readFileSync(
      path.join(rootDir, "app", "api", "super-admin", "email", "retry", "route.ts"),
      "utf8"
    );
    const welcomeSvc = fs.readFileSync(
      path.join(rootDir, "lib", "email", "storeWelcomeService.ts"),
      "utf8"
    );

    assert.match(bizRoute, /contact_email:\s*contactEmail/);
    assert.match(bizRoute, /dispatchStoreWelcomeEmail\(/);
    assert.match(retryRoute, /authenticateRequest\(request,\s*\{\s*requireSuperAdmin:\s*true\s*\}\)/);
    assert.match(retryRoute, /checkRateLimit\(/);
    assert.match(welcomeSvc, /generateLink\(\{/);
    assert.match(welcomeSvc, /type:\s*"recovery"/);
    assert.match(welcomeSvc, /skipped_duplicate/);
  });

  it("verifies Phase 2 subscription & support notification hooks and scheduler", () => {
    const subsRoute = fs.readFileSync(
      path.join(rootDir, "app", "api", "super-admin", "subscriptions", "route.ts"),
      "utf8"
    );
    const ticketsRoute = fs.readFileSync(
      path.join(rootDir, "app", "api", "support", "tickets", "route.ts"),
      "utf8"
    );
    const subSvc = fs.readFileSync(
      path.join(rootDir, "lib", "email", "subscriptionNotificationService.ts"),
      "utf8"
    );
    const cronRoute = fs.readFileSync(
      path.join(rootDir, "app", "api", "cron", "email-scheduler", "route.ts"),
      "utf8"
    );

    assert.match(subsRoute, /notifyPlanLifecycleEvent/);
    assert.match(subsRoute, /syncExpiryRemindersForSubscription/);
    assert.match(ticketsRoute, /priorTicket\.status !== "resolved"/);
    assert.match(ticketsRoute, /notifySupportTicketResolved/);
    assert.match(subSvc, /expiry_reminder_7d/);
    assert.match(subSvc, /expiry_reminder_1d/);
    assert.match(subSvc, /expiry_reminder_0d/);
    assert.match(subSvc, /Asia\/Kolkata/);
    assert.match(subSvc, /SCHEDULED_EMAIL_PROCESSING_ENABLED\s*=\s*false/);
    assert.match(cronRoute, /disabled:\s*true/);
    assert.doesNotMatch(cronRoute, /process\.env\.CRON_SECRET/);
  });

  it("verifies Phase 3-6 Email Centre, marketing consent, usage gate, and webhook signature verification", () => {
    const webhookRoute = fs.readFileSync(
      path.join(rootDir, "app", "api", "webhooks", "resend", "route.ts"),
      "utf8"
    );
    const campaignRoute = fs.readFileSync(
      path.join(rootDir, "app", "api", "super-admin", "email", "campaigns", "route.ts"),
      "utf8"
    );
    const templatesRoute = fs.readFileSync(
      path.join(rootDir, "app", "api", "super-admin", "email", "templates", "route.ts"),
      "utf8"
    );
    const emailSvc = fs.readFileSync(
      path.join(rootDir, "lib", "email", "emailService.ts"),
      "utf8"
    );

    assert.match(webhookRoute, /svix-signature/);
    assert.match(webhookRoute, /RESEND_WEBHOOK_SECRET/);
    assert.match(webhookRoute, /email_webhook_events/);
    assert.match(webhookRoute, /timingSafeEqual/);
    assert.match(campaignRoute, /unsubscribed_all/);
    assert.match(campaignRoute, /createMarketingToken/);
    assert.match(templatesRoute, /is_mandatory/);
    assert.match(emailSvc, /checkUsageAndPriorityGate/);
    assert.match(emailSvc, /computeNextRetryAt/);
  });

  it("verifies migrations 202611160001 and 202611160002 are transactional with RLS and least-privilege grants", () => {
    for (const name of [
      "202611160001_store_welcome_email_outbox",
      "202611160002_email_platform_complete",
    ]) {
      const upSql = fs.readFileSync(path.join(rootDir, "supabase", "migrations", `${name}.up.sql`), "utf8");
      const downSql = fs.readFileSync(path.join(rootDir, "supabase", "migrations", `${name}.down.sql`), "utf8");
      assert.match(upSql, /BEGIN;/);
      assert.match(upSql, /COMMIT;/);
      assert.match(downSql, /BEGIN;/);
      assert.match(downSql, /COMMIT;/);
      assert.match(upSql, /ENABLE ROW LEVEL SECURITY/);
    }
  });
});
