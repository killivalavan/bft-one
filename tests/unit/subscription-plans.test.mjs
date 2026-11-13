import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PLAN_DEFINITIONS,
  addCalendarMonths,
  calculateExtensionExpiry,
  deriveSubscriptionState,
  normalizeLegacyPlanKey,
} from "../../lib/subscription/plans.ts";

test("DEFAULT_PLAN_DEFINITIONS match Phase 1 specifications", () => {
  const byKey = Object.fromEntries(DEFAULT_PLAN_DEFINITIONS.map((p) => [p.plan_key, p]));

  assert.equal(byKey.free.monthly_price, 0);
  assert.equal(byKey.free.max_active_products, 5);
  assert.equal(byKey.free.max_employee_seats, 0);
  assert.equal(byKey.free.support_level, "standard");

  assert.equal(byKey.basic.monthly_price, 199);
  assert.equal(byKey.basic.max_active_products, 20);
  assert.equal(byKey.basic.max_employee_seats, 5);
  assert.equal(byKey.basic.support_level, "standard");

  assert.equal(byKey.pro.monthly_price, 299);
  assert.equal(byKey.pro.max_active_products, 250);
  assert.equal(byKey.pro.max_employee_seats, 25);
  assert.equal(byKey.pro.support_level, "standard");

  assert.equal(byKey.business.monthly_price, 499);
  assert.equal(byKey.business.max_active_products, null); // Unlimited
  assert.equal(byKey.business.max_employee_seats, 50);
  assert.equal(byKey.business.support_level, "priority");
});

test("addCalendarMonths handles month-end clamping and leap years", () => {
  const jan31 = new Date(Date.UTC(2025, 0, 31));
  const febNonLeap = addCalendarMonths(jan31, 1);
  assert.equal(febNonLeap.toISOString().slice(0, 10), "2025-02-28");

  const jan31Leap = new Date(Date.UTC(2024, 0, 31));
  const febLeap = addCalendarMonths(jan31Leap, 1);
  assert.equal(febLeap.toISOString().slice(0, 10), "2024-02-29");

  const mar15 = new Date(Date.UTC(2026, 2, 15));
  assert.equal(addCalendarMonths(mar15, 3).toISOString().slice(0, 10), "2026-06-15");
  assert.equal(addCalendarMonths(mar15, 6).toISOString().slice(0, 10), "2026-09-15");
  assert.equal(addCalendarMonths(mar15, 12).toISOString().slice(0, 10), "2027-03-15");
});

test("calculateExtensionExpiry extends active from existing expiry and expired from now", () => {
  const now = new Date("2026-06-01T00:00:00.000Z");
  const activeExpiry = "2026-06-20T00:00:00.000Z";
  const extendedActive = calculateExtensionExpiry(activeExpiry, 1, now);
  assert.equal(extendedActive.toISOString().slice(0, 10), "2026-07-20");

  const expiredExpiry = "2026-05-01T00:00:00.000Z";
  const extendedExpired = calculateExtensionExpiry(expiredExpiry, 3, now);
  assert.equal(extendedExpired.toISOString().slice(0, 10), "2026-09-01");
});

test("deriveSubscriptionState computes 7-day, 3-day, and expired states with Free fallback", () => {
  const now = new Date("2026-06-10T00:00:00.000Z");

  const sevenDays = deriveSubscriptionState(
    {
      plan_key_snapshot: "pro",
      subscription_status: "active",
      expiry_date: "2026-06-17T00:00:00.000Z",
    },
    now
  );
  assert.equal(sevenDays.derivedStatus, "expiring_soon");
  assert.equal(sevenDays.notificationLevel, "7_days");
  assert.equal(sevenDays.isExpiredFallback, false);

  const twoDays = deriveSubscriptionState(
    {
      plan_key_snapshot: "basic",
      subscription_status: "active",
      expiry_date: "2026-06-12T00:00:00.000Z",
    },
    now
  );
  assert.equal(twoDays.derivedStatus, "expiring_soon");
  assert.equal(twoDays.notificationLevel, "3_days");

  const expired = deriveSubscriptionState(
    {
      plan_key_snapshot: "business",
      subscription_status: "active",
      expiry_date: "2026-06-09T00:00:00.000Z",
    },
    now
  );
  assert.equal(expired.derivedStatus, "expired");
  assert.equal(expired.notificationLevel, "expired");
  assert.equal(expired.isExpiredFallback, true);

  const freePlan = deriveSubscriptionState(
    {
      plan_key_snapshot: "free",
      subscription_status: "active",
      expiry_date: null,
    },
    now
  );
  assert.equal(freePlan.derivedStatus, "active");
  assert.equal(freePlan.notificationLevel, "none");
  assert.equal(freePlan.isExpiredFallback, false);
});

test("normalizeLegacyPlanKey maps legacy plan names cleanly", () => {
  assert.equal(normalizeLegacyPlanKey("starter"), "basic");
  assert.equal(normalizeLegacyPlanKey("enterprise"), "business");
  assert.equal(normalizeLegacyPlanKey("free"), "free");
  assert.equal(normalizeLegacyPlanKey("pro"), "pro");
});

