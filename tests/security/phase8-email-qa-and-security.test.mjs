import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { registerHooks } from "node:module";
import { createClient } from "@supabase/supabase-js";

// Resolve Next.js "@/*" path aliases and extensionless TS imports for Node's native test runner
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") {
      return nextResolve("next/server.js", context);
    }
    if (specifier.startsWith("@/")) {
      const rel = specifier.slice(2);
      const base = path.join(process.cwd(), rel);
      const candidate = fs.existsSync(`${base}.ts`)
        ? `${base}.ts`
        : fs.existsSync(`${base}.tsx`)
          ? `${base}.tsx`
          : fs.existsSync(path.join(base, "index.ts"))
            ? path.join(base, "index.ts")
            : base;
      return nextResolve(pathToFileURL(candidate).href, context);
    }
    return nextResolve(specifier, context);
  },
});

const {
  computeReminderScheduledFor,
  processDailyScheduledEmails,
  syncExpiryRemindersForSubscription,
} = await import("../../lib/email/subscriptionNotificationService.ts");
const { isPermanentEmailFailure, computeNextRetryAt } = await import("../../lib/email/emailService.ts");
const { createMarketingToken, verifyMarketingToken } = await import("../../lib/email/marketingToken.ts");
const { POST: webhookPost } = await import("../../app/api/webhooks/resend/route.ts");

function loadEnvLocal() {
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const idx = t.indexOf("=");
      if (idx > 0) {
        const k = t.slice(0, idx).trim();
        const v = t.slice(idx + 1).trim();
        if (!process.env[k]) process.env[k] = v;
      }
    }
  } catch {}
}
loadEnvLocal();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const hasLiveSupabase = Boolean(SUPABASE_URL && ANON_KEY && SERVICE_KEY);

describe("Phase 8 — CounterCub Email QA, Concurrency & Multi-Tenant Security Audit", () => {
  const adminSupa = hasLiveSupabase
    ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;
  const anonSupa = hasLiveSupabase
    ? createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;

  const createdBizIds = [];
  const createdUserIds = [];
  const createdWebhookEventIds = [];

  after(async () => {
    if (!adminSupa) return;
    for (const evId of createdWebhookEventIds) {
      await adminSupa.from("email_webhook_events").delete().eq("event_id", evId);
    }
    for (const bId of createdBizIds) {
      await adminSupa.from("email_dispatches").delete().eq("business_id", bId);
      await adminSupa.from("marketing_preferences").delete().eq("business_id", bId);
      await adminSupa.from("support_tickets").delete().eq("business_id", bId);
      await adminSupa.from("subscription_events").delete().eq("business_id", bId);
      await adminSupa.from("tenant_subscriptions").delete().eq("business_id", bId);
      await adminSupa.from("profiles").delete().eq("business_id", bId);
      await adminSupa.from("businesses").delete().eq("id", bId);
    }
    for (const uId of createdUserIds) {
      await adminSupa.auth.admin.deleteUser(uId).catch(() => {});
    }
  });

  it("VAL-1H: computes exact 09:00 Asia/Kolkata (03:30 UTC) timestamps across month-end and year-end", () => {
    // 2026-12-31T18:00:00Z is 2026-12-31 23:30 IST (year-end boundary)
    const sched7d = computeReminderScheduledFor("2027-01-01T12:00:00.000Z", 7, 9);
    assert.equal(sched7d, "2026-12-25T03:30:00.000Z");

    // Month-end: 2026-11-30 -> 1 day before = 2026-11-29 09:00 IST = 03:30 UTC
    const sched1d = computeReminderScheduledFor("2026-11-30T10:00:00.000Z", 1, 9);
    assert.equal(sched1d, "2026-11-29T03:30:00.000Z");

    // Midnight IST (2026-12-13T18:30:00Z is 2026-12-14 00:00 IST) -> 0d reminder on 2026-12-14 09:00 IST
    const sched0d = computeReminderScheduledFor("2026-12-13T18:30:00.000Z", 0, 9);
    assert.equal(sched0d, "2026-12-14T03:30:00.000Z");
  });

  it("VAL-1G & QUEUE: classifies permanent vs transient failures and applies exponential backoff", () => {
    assert.equal(isPermanentEmailFailure(422, "Invalid recipient"), true);
    assert.equal(isPermanentEmailFailure(400, "Bad request"), true);
    assert.equal(isPermanentEmailFailure(429, "Rate limited"), false);
    assert.equal(isPermanentEmailFailure(502, "Provider timeout"), false);

    const baseMs = Date.UTC(2026, 10, 16, 10, 0, 0);
    const r1 = Date.parse(computeNextRetryAt(1, baseMs)) - baseMs;
    const r2 = Date.parse(computeNextRetryAt(2, baseMs)) - baseMs;
    const r3 = Date.parse(computeNextRetryAt(3, baseMs)) - baseMs;
    assert.equal(r1, 5 * 60_000);
    assert.equal(r2, 15 * 60_000);
    assert.equal(r3, 45 * 60_000);
  });

  it("VAL-5I: scans all client components & pages for secret/credential leakage", () => {
    const clientDirs = [path.join(process.cwd(), "app"), path.join(process.cwd(), "components")];
    const forbidden = ["RESEND_API_KEY", "SUPABASE_SERVICE_ROLE_KEY", "RESEND_WEBHOOK_SECRET", "CRON_SECRET"];
    const leaks = [];

    function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith(".tsx") || entry.name.endsWith(".ts")) {
          const content = fs.readFileSync(full, "utf8");
          if (content.includes('"use client"') || content.includes("'use client'")) {
            for (const f of forbidden) {
              if (content.includes(f)) leaks.push(`${full}:${f}`);
            }
          }
        }
      }
    }
    for (const d of clientDirs) walk(d);
    assert.deepEqual(leaks, [], `Client files must never reference server secrets: ${leaks.join(", ")}`);
  });

  it("VAL-5B: verifies HMAC marketing preference token integrity and rejects tampering", () => {
    const token = createMarketingToken("biz-123", "admin@example.com", 30);
    const ok = verifyMarketingToken(token);
    assert.equal(ok?.businessId, "biz-123");
    assert.equal(ok?.contactEmail, "admin@example.com");

    const tampered = token.slice(0, -3) + "xyz";
    assert.equal(verifyMarketingToken(tampered), null);
  });

  it("VAL-4: verifies Resend Svix webhook rejects invalid signatures (401), deduplicates, and resists out-of-order regression", async () => {
    process.env.RESEND_WEBHOOK_SECRET = "whsec_" + Buffer.from("qa_test_secret_key_32bytes_long!!").toString("base64");
    const payload = JSON.stringify({
      type: "email.delivered",
      created_at: new Date().toISOString(),
      data: { email_id: "re_qa_nonexistent_msg_123" },
    });

    // Invalid signature -> 401
    const badReq = new Request("https://app.countercub.com/api/webhooks/resend", {
      method: "POST",
      headers: {
        "svix-id": `msg_bad_${Date.now()}`,
        "svix-timestamp": String(Math.floor(Date.now() / 1000)),
        "svix-signature": "v1,invalid_signature",
      },
      body: payload,
    });
    const badRes = await webhookPost(badReq);
    assert.equal(badRes.status, 401);

    if (!adminSupa) return;

    // Valid signature -> 200, then duplicate -> deduplicated: true
    const svixId = `msg_qa_${Date.now()}`;
    createdWebhookEventIds.push(svixId);
    const ts = String(Math.floor(Date.now() / 1000));
    const secretBytes = Buffer.from(process.env.RESEND_WEBHOOK_SECRET.slice(6), "base64");
    const sig = crypto.createHmac("sha256", secretBytes).update(`${svixId}.${ts}.${payload}`).digest("base64");

    const makeValidReq = () =>
      new Request("https://app.countercub.com/api/webhooks/resend", {
        method: "POST",
        headers: {
          "svix-id": svixId,
          "svix-timestamp": ts,
          "svix-signature": `v1,${sig}`,
        },
        body: payload,
      });

    const res1 = await webhookPost(makeValidReq());
    assert.equal(res1.status, 200);
    const json1 = await res1.json();
    assert.equal(json1.ok, true);

    const res2 = await webhookPost(makeValidReq());
    assert.equal(res2.status, 200);
    const json2 = await res2.json();
    assert.equal(json2.deduplicated, true);
  });

  it("VAL-1, VAL-2, VAL-5F & CONCURRENCY: runs isolated live Supabase tests for reminders, extension cancellation, RLS, and atomic worker claim", async () => {
    if (!adminSupa || !anonSupa) return;

    // 1. Verify anon client is blocked by RLS on all sensitive email tables
    for (const tbl of ["email_dispatches", "email_settings", "email_templates", "email_webhook_events", "email_campaigns"]) {
      const { data, error } = await anonSupa.from(tbl).select("*").limit(1);
      assert.ok(error || (data && data.length === 0), `Anon must not read ${tbl}`);
    }

    // 2. Provision isolated synthetic Tenant A & Tenant B
    const ts = Date.now();
    const { data: plan } = await adminSupa.from("subscription_plans").select("*").eq("plan_key", "pro").single();
    const { data: freePlan } = await adminSupa.from("subscription_plans").select("*").eq("plan_key", "free").single();

    const { data: bizA } = await adminSupa
      .from("businesses")
      .insert({ name: `QA Store A ${ts}`, slug: `qa-store-a-${ts}`, plan_type: "pro", max_users: 10, is_active: true })
      .select("*")
      .single();
    createdBizIds.push(bizA.id);

    const { data: bizFree } = await adminSupa
      .from("businesses")
      .insert({ name: `QA Free Store ${ts}`, slug: `qa-free-${ts}`, plan_type: "free", max_users: 0, is_active: true })
      .select("*")
      .single();
    createdBizIds.push(bizFree.id);

    const { data: authA } = await adminSupa.auth.admin.createUser({
      email: `qa-admin-a-${ts}@example.test`,
      password: "QaTestPassword#2026!",
      email_confirm: true,
    });
    createdUserIds.push(authA.user.id);

    await adminSupa.from("profiles").upsert({
      id: authA.user.id,
      email: `qa-admin-a-${ts}@example.test`,
      contact_email: `qa-admin-a-${ts}@example.test`,
      is_admin: true,
      business_id: bizA.id,
    });

    // 3. Create Pro subscription expiring 2026-12-13 & Free subscription
    const decExpiry = "2026-12-13T12:00:00.000Z";
    const { data: subA } = await adminSupa
      .from("tenant_subscriptions")
      .insert({
        business_id: bizA.id,
        plan_id: plan.id,
        plan_key_snapshot: "pro",
        plan_name_snapshot: plan.plan_name,
        subscription_status: "active",
        start_date: "2026-11-01T00:00:00.000Z",
        expiry_date: decExpiry,
        billing_duration_months: 1,
        price_snapshot: plan.monthly_price,
        product_limit_snapshot: plan.max_active_products,
        employee_limit_snapshot: plan.max_employee_seats,
        is_current: true,
      })
      .select("*")
      .single();

    const { data: subFree } = await adminSupa
      .from("tenant_subscriptions")
      .insert({
        business_id: bizFree.id,
        plan_id: freePlan.id,
        plan_key_snapshot: "free",
        plan_name_snapshot: freePlan.plan_name,
        subscription_status: "active",
        start_date: "2026-11-01T00:00:00.000Z",
        expiry_date: null,
        billing_duration_months: null,
        price_snapshot: 0,
        product_limit_snapshot: freePlan.max_active_products,
        employee_limit_snapshot: 0,
        is_current: true,
      })
      .select("*")
      .single();

    const simNow = new Date("2026-11-16T04:00:00.000Z");

    // Verify default (non-test) call is safely inactive when scheduled processing is deferred
    const defaultSync = await syncExpiryRemindersForSubscription(adminSupa, subA, simNow);
    assert.equal(defaultSync.scheduled, 0, "Deferred scheduler must not schedule reminders by default");
    const defaultRun = await processDailyScheduledEmails(adminSupa, { nowOverride: simNow, businessIdsFilter: [bizA.id] });
    assert.equal(defaultRun.disabled, true);
    assert.equal(defaultRun.remindersSent, 0);

    const resPro = await syncExpiryRemindersForSubscription(adminSupa, subA, simNow, { forceForTest: true });
    const resFree = await syncExpiryRemindersForSubscription(adminSupa, subFree, simNow, { forceForTest: true });
    assert.equal(resPro.scheduled, 3, "Pro plan must schedule 7d, 1d, 0d reminders");
    assert.equal(resFree.scheduled, 0, "Free plan must schedule 0 reminders");

    // 4. VAL-2: Extend subscription 2026-12-13 -> 2027-01-13 and verify Dec reminders are cancelled
    const janExpiry = "2027-01-13T12:00:00.000Z";
    const { data: subAExt } = await adminSupa
      .from("tenant_subscriptions")
      .update({ expiry_date: janExpiry })
      .eq("id", subA.id)
      .select("*")
      .single();

    const extSync = await syncExpiryRemindersForSubscription(adminSupa, subAExt, simNow, { forceForTest: true });
    assert.equal(extSync.cancelled, 3, "All 3 December reminders must be cancelled on extension");
    assert.equal(extSync.scheduled, 3, "All 3 January reminders must be scheduled");

    // 5. CONCURRENCY: Two workers racing at 2027-01-06 04:00 UTC (7d before Jan 13) -> exactly 1 send
    let sentCounter = 0;
    const mockSender = async () => {
      sentCounter++;
      return { ok: true, messageId: `mock_msg_${sentCounter}`, from: "support@countercub.com", replyTo: "support@countercub.com" };
    };

    const raceClock = new Date("2027-01-06T04:00:00.000Z");
    const [w1, w2] = await Promise.all([
      processDailyScheduledEmails(adminSupa, { nowOverride: raceClock, senderOverride: mockSender, businessIdsFilter: [bizA.id], forceForTest: true }),
      processDailyScheduledEmails(adminSupa, { nowOverride: raceClock, senderOverride: mockSender, businessIdsFilter: [bizA.id], forceForTest: true }),
    ]);
    assert.equal(w1.remindersSent + w2.remindersSent, 1, "Atomic claim must ensure exactly 1 reminder is sent across concurrent workers");
    assert.equal(sentCounter, 1);
  });
});
