import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { registerHooks } from "node:module";
import { createClient } from "@supabase/supabase-js";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    if (specifier.startsWith("@/")) {
      const base = path.join(process.cwd(), specifier.slice(2));
      const candidate = fs.existsSync(`${base}.ts`)
        ? `${base}.ts`
        : fs.existsSync(`${base}.tsx`)
          ? `${base}.tsx`
          : base;
      return nextResolve(pathToFileURL(candidate).href, context);
    }
    return nextResolve(specifier, context);
  },
});

const {
  computeAsiaKolkataDaysRemaining,
  listSubscriptionAlerts,
  buildManualAlertEmailContent,
  sendManualSubscriptionAlert,
} = await import("../../lib/email/subscriptionAlertService.ts");

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
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasLiveSupabase = Boolean(SUPABASE_URL && SERVICE_KEY);

describe("Phase 9 — Manual Subscription Alert & Email Management", () => {
  const adminSupa = hasLiveSupabase
    ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;
  const createdBizIds = [];
  const createdUserIds = [];

  after(async () => {
    if (!adminSupa) return;
    for (const bId of createdBizIds) {
      await adminSupa.from("email_dispatches").delete().eq("business_id", bId);
      await adminSupa.from("audit_logs").delete().eq("business_id", bId);
      await adminSupa.from("tenant_subscriptions").delete().eq("business_id", bId);
      await adminSupa.from("profiles").delete().eq("business_id", bId);
      await adminSupa.from("businesses").delete().eq("id", bId);
    }
    for (const uId of createdUserIds) {
      await adminSupa.auth.admin.deleteUser(uId).catch(() => {});
    }
  });

  it("computes Asia/Kolkata days remaining accurately without off-by-one UTC drift", () => {
    // 2026-11-16 20:00 UTC is 2026-11-17 01:30 IST
    const nowUtc = new Date("2026-11-16T20:00:00.000Z");
    assert.equal(computeAsiaKolkataDaysRemaining("2026-11-24T10:00:00.000Z", nowUtc), 7);
    assert.equal(computeAsiaKolkataDaysRemaining("2026-11-18T10:00:00.000Z", nowUtc), 1);
    assert.equal(computeAsiaKolkataDaysRemaining("2026-11-16T10:00:00.000Z", nowUtc), -1);
  });

  it("enforces Super Admin AAL2 auth, rate limiting, and zero cron dependencies on subscription-alerts API", () => {
    const routeContent = fs.readFileSync(
      path.join(process.cwd(), "app", "api", "super-admin", "subscription-alerts", "route.ts"),
      "utf8"
    );
    assert.match(routeContent, /authenticateRequest\(request,\s*\{\s*requireSuperAdmin:\s*true\s*\}\)/);
    assert.match(routeContent, /checkRateLimit\(/);
    assert.doesNotMatch(routeContent, /CRON_SECRET/);
    assert.equal(fs.existsSync(path.join(process.cwd(), "vercel.json")), false);
  });

  it("lists expiring & expired stores dynamically, excludes Free plans, previews accurately, and enforces resend confirmation", async () => {
    if (!adminSupa) return;
    const ts = Date.now();
    const { data: proPlan } = await adminSupa.from("subscription_plans").select("*").eq("plan_key", "pro").single();
    const { data: freePlan } = await adminSupa.from("subscription_plans").select("*").eq("plan_key", "free").single();

    const { data: bizPro } = await adminSupa
      .from("businesses")
      .insert({ name: `Alert Pro ${ts}`, slug: `alert-pro-${ts}`, plan_type: "pro", max_users: 10, is_active: true })
      .select("*")
      .single();
    createdBizIds.push(bizPro.id);

    const { data: bizFree } = await adminSupa
      .from("businesses")
      .insert({ name: `Alert Free ${ts}`, slug: `alert-free-${ts}`, plan_type: "free", max_users: 0, is_active: true })
      .select("*")
      .single();
    createdBizIds.push(bizFree.id);

    const { data: authPro } = await adminSupa.auth.admin.createUser({
      email: `alert-admin-${ts}@example.test`,
      password: "QaTestPassword#2026!",
      email_confirm: true,
    });
    createdUserIds.push(authPro.user.id);

    await adminSupa.from("profiles").upsert({
      id: authPro.user.id,
      email: `alert-admin-${ts}@example.test`,
      contact_email: `alert-admin-${ts}@example.test`,
      full_name: "Alert Admin",
      is_admin: true,
      business_id: bizPro.id,
    });

    const simNow = new Date("2026-11-16T06:00:00.000Z");
    const expiry5d = "2026-11-21T10:00:00.000Z";
    const { data: subPro } = await adminSupa
      .from("tenant_subscriptions")
      .insert({
        business_id: bizPro.id,
        plan_id: proPlan.id,
        plan_key_snapshot: "pro",
        plan_name_snapshot: proPlan.plan_name,
        subscription_status: "active",
        start_date: "2026-10-21T00:00:00.000Z",
        expiry_date: expiry5d,
        billing_duration_months: 1,
        price_snapshot: proPlan.monthly_price,
        product_limit_snapshot: proPlan.max_active_products,
        employee_limit_snapshot: proPlan.max_employee_seats,
        is_current: true,
      })
      .select("*")
      .single();

    await adminSupa.from("tenant_subscriptions").insert({
      business_id: bizFree.id,
      plan_id: freePlan.id,
      plan_key_snapshot: "free",
      plan_name_snapshot: freePlan.plan_name,
      subscription_status: "active",
      start_date: "2026-10-21T00:00:00.000Z",
      expiry_date: null,
      price_snapshot: 0,
      product_limit_snapshot: freePlan.max_active_products,
      employee_limit_snapshot: 0,
      is_current: true,
    });

    const { alerts } = await listSubscriptionAlerts(adminSupa, simNow);
    const foundPro = alerts.find((a) => a.businessId === bizPro.id);
    const foundFree = alerts.find((a) => a.businessId === bizFree.id);

    assert.ok(foundPro, "Expiring Pro store must appear in alerts");
    assert.equal(foundFree, undefined, "Free non-expiring store must be excluded");
    assert.equal(foundPro.daysRemaining, 5);
    assert.equal(foundPro.bucket, "expiring_7d");

    // Preview must reflect actual subscription & contact email
    const preview = await buildManualAlertEmailContent(adminSupa, bizPro.id, "reminder_7d", simNow);
    assert.equal("error" in preview, false);
    if (!("error" in preview)) {
      assert.equal(preview.contact.contactEmail, `alert-admin-${ts}@example.test`);
      assert.match(preview.emailContent.html, new RegExp(proPlan.plan_name));
    }

    // Simulate prior sent dispatch for current expiry cycle -> requiresResendConfirmation (409)
    await adminSupa.from("email_dispatches").insert({
      idempotency_key: `manual_alert:${bizPro.id}:manual_reminder_7d:sub:${subPro.id}:${expiry5d}:nonce1`,
      email_type: "manual_reminder_7d",
      category: "subscription",
      priority: 1,
      business_id: bizPro.id,
      recipient_email: `alert-admin-${ts}@example.test`,
      from_email: "CounterCub Support <support@countercub.com>",
      reply_to_email: "support@countercub.com",
      subject: "CounterCub Subscription Reminder",
      expiry_cycle_key: `sub:${subPro.id}:${expiry5d}`,
      status: "sent",
      provider_message_id: "re_test_123",
    });

    const blockedResend = await sendManualSubscriptionAlert(adminSupa, {
      businessId: bizPro.id,
      templateType: "reminder_7d",
      idempotencyNonce: "nonce2",
      confirmResend: false,
      actor: { id: authPro.user.id, email: "super@countercub.com" },
    });
    assert.equal(blockedResend.ok, false);
    assert.equal(blockedResend.status, 409);

    // Extending subscription removes alert from 7d bucket while preserving email history
    await adminSupa
      .from("tenant_subscriptions")
      .update({ expiry_date: "2027-01-21T10:00:00.000Z" })
      .eq("id", subPro.id);

    const afterExt = await listSubscriptionAlerts(adminSupa, simNow);
    const updatedPro = afterExt.alerts.find((a) => a.businessId === bizPro.id);
    assert.equal(updatedPro.bucket, "upcoming");
    assert.equal(updatedPro.emailHistory.length, 1, "Previous email history must be preserved");
  });
});

