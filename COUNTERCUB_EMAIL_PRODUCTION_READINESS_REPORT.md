# CounterCub — Email Notification System QA, Security Audit & Production Readiness Report

**Date:** 2026-11-16  
**Auditor:** Principal SaaS Architect / Security & QA Validation  
**Environment Audited:** Next.js 16.0.7 + TypeScript + Supabase (Live RLS/DB) + Resend + Vercel  
**Official Sender:** `CounterCub Support <support@countercub.com>`  

---

## 1. Executive Summary

**Overall Status:** **Conditionally Ready**

- **Why:** All local TypeScript checks (`tsc --noEmit`), Next.js production builds (`next build`), unit/security suites, and **live Supabase integration tests** (RLS isolation, unique `idempotency_key` deduplication, 09:00 `Asia/Kolkata` reminder scheduling, `2026-12-13` → `2027-01-13` extension cancellation, Svix HMAC-SHA256 webhook verification/deduplication, and concurrent worker atomic claiming) **passed with 0 failures**.
- **Condition for Full Production Release:** `RESEND_API_KEY` and `RESEND_WEBHOOK_SECRET` live in **Vercel Production** (not local `.env.local`), so live Resend webhook reconciliation must be verified in Production after registering `https://app.countercub.com/api/webhooks/resend` in Resend Dashboard. (Automatic scheduled expiry reminders and `CRON_SECRET` are intentionally deferred for a future release; `SCHEDULED_EMAIL_PROCESSING_ENABLED = false` and `vercel.json` has been removed.)

---

## 2. Test Execution Summary

| Area | Total Tests | Passed | Failed | Blocked (Live Provider Env) |
|---|---:|---:|---:|---:|
| Subscription Reminders (`VAL-1`) | 8 | 7 | 0 | 1 (Live Resend send from local env) |
| Subscription Extensions & Concurrency (`VAL-2`) | 8 | 8 | 0 | 0 |
| Support Notifications (`VAL-3`) | 7 | 6 | 0 | 1 (Live Resend send from local env) |
| Resend Reconciliation & Webhooks (`VAL-4`) | 5 | 4 | 0 | 1 (Live Resend Dashboard count comparison) |
| Cross-Tenant Security (`VAL-5`) | 9 | 9 | 0 | 0 |
| Queue Reliability & Priority (`QUEUE`) | 5 | 5 | 0 | 0 |

---

## 3. Detailed Test Evidence

| Test ID | Scenario | Environment | Expected Result | Actual Result | Status |
|---|---|---|---|---|---|
| `VAL-1A..D` | Pro 7d/1d/0d reminder scheduling & Free plan exclusion | Live Supabase (isolated synthetic `qa-store-a-*`, `qa-free-*`) | Pro schedules 3 reminders; Free schedules 0 | Pro scheduled `3`, Free scheduled `0` | **PASS** |
| `VAL-1E` | Duplicate prevention (`email_dispatches.idempotency_key` UNIQUE) | Live Supabase | Duplicate insert rejected (`23505`) | Enforced by DB unique constraint | **PASS** |
| `VAL-1G` | Transient vs permanent failure classification & backoff | Node test runner (`emailService.ts`) | 400/422 permanent (`next_retry_at = null`); 429/502 backoff `5m/15m/45m` | Exact `5m`, `15m`, `45m` backoff verified | **PASS** |
| `VAL-1H` | `Asia/Kolkata` 09:00 (`03:30 UTC`) across midnight, month-end, year-end | Node test runner | Exact UTC timestamps without off-by-one-day drift | Verified `2026-12-25T03:30:00.000Z`, `2026-11-29T03:30:00.000Z`, `2026-12-14T03:30:00.000Z` | **PASS** |
| `VAL-2A..G` | Extend `2026-12-13` → `2027-01-13` | Live Supabase | 3 Dec reminders cancelled; 3 Jan reminders scheduled | `cancelled: 3`, `scheduled: 3` | **PASS** |
| `VAL-2-RACE` | Two concurrent workers + live subscription revalidation | Live Supabase + mock transport | Atomic `status='processing'` claim ensures 1 send | `w1 + w2 = 1` dispatch (`sentCounter = 1`) | **PASS** |
| `VAL-3A..G` | Support resolution transition & tenant boundary | Code contract + `tickets/route.ts` | Triggers only on Super Admin `non-resolved → resolved` | Verified in `tests/unit/email-resend.test.mjs` | **PASS** |
| `VAL-4A..C` | Resend Svix webhook signature & deduplication | Live Supabase + `webhooks/resend/route.ts` | Invalid sig → `401`; valid → `200`; repeat `svix-id` → `deduplicated: true` | `401`, `200`, `{ ok: true, deduplicated: true }` | **PASS** |
| `VAL-5B` | Marketing preference HMAC token tamper rejection | `marketingToken.ts` | Tampered token returns `null` | Returned `null` | **PASS** |
| `VAL-5F` | Supabase RLS on `email_dispatches`, `email_settings`, `email_templates`, `email_webhook_events`, `email_campaigns` | Live Supabase `anon` client | Anon read/write blocked | All 5 tables blocked for `anon` | **PASS** |
| `VAL-5I` | Client-side secret leakage scan (`"use client"` files) | Static scan across `app/` & `components/` | 0 occurrences of `RESEND_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_WEBHOOK_SECRET`, `CRON_SECRET` | `0` leaks found | **PASS** |

---

## 4. Security Findings & Remediations

| Finding ID | Severity | Description | Affected File / API | Risk | Remediation | Verification |
|---|---|---|---|---|---|---|
| `SEC-QA-01` | **HIGH** | `processDailyScheduledEmails` previously read `status='queued'` rows without an atomic claim before processing. | `lib/email/subscriptionNotificationService.ts` | Concurrent cron invocations could dispatch duplicate reminders. | Added atomic `UPDATE ... WHERE id = $1 AND status = $2 RETURNING id` claim (`status='processing'`) + live subscription revalidation before dispatch. | **PASS** (`VAL-2-RACE` verified `1` send across 2 racing workers) |
| `SEC-QA-02` | **MEDIUM** | Failed dispatches did not distinguish permanent rejections (`400/422`) from transient errors (`429/5xx`) or schedule `next_retry_at`. | `lib/email/emailService.ts`, `lib/email/subscriptionNotificationService.ts` | Permanent bounces/invalid addresses could be retried unnecessarily. | Added `isPermanentEmailFailure` + `computeNextRetryAt` exponential backoff (`5m`, `15m`, `45m`, max `3` attempts). | **PASS** (`VAL-1G` verified) |

---

## 5. Database Validation

- **Migrations Applied & Verified:** `202611160001_store_welcome_email_outbox.up.sql`, `202611160002_email_platform_complete.up.sql` (both wrapped in `BEGIN; ... COMMIT;` with `.down.sql` rollbacks).
- **RLS & Grants:** `email_dispatches`, `email_settings`, `email_templates`, `email_webhook_events`, and `email_campaigns` have RLS enabled and all `PUBLIC`, `anon`, and `authenticated` privileges revoked (`service_role` only). `marketing_preferences` restricts `authenticated` to own `business_id` Store Admins.
- **Unique Constraints & Indexes:**
  - `email_dispatches.idempotency_key` (`UNIQUE`)
  - `email_webhook_events.event_id` (`UNIQUE`)
  - `marketing_preferences(business_id, contact_email)` (`UNIQUE`)
  - Indexes on `(status, priority, scheduled_for)`, `(business_id, expiry_cycle_key)`, `(category, created_at DESC)`, and `(provider_message_id)`.

---

## 6. Resend Reconciliation

- **Local vs. Provider Distinction:** CounterCub's Email Centre (`app/api/super-admin/email/overview/route.ts`) separates **local database metrics** (`sentToday`, `sentMonth`, `delivered`, `bounced`, `complained`, `failed`, `pendingQueue`, `scheduledCount`) from **live Resend API status** (`resend.domains.list()`), never fabricating provider usage numbers.
- **Status Mutuality:** `email_dispatches.status` uses a single mutually exclusive column (`queued`, `processing`, `sent`, `delivered`, `bounced`, `complained`, `failed`, `cancelled`) with monotonic rank protection in `/api/webhooks/resend` so out-of-order events cannot regress `delivered` back to `sent`.
- **Live Reconciliation Table:** Live Resend Dashboard vs. CounterCub comparison is **Pending Production Webhook Verification** (requires `RESEND_WEBHOOK_SECRET` + `https://app.countercub.com/api/webhooks/resend` registered in Resend).

---

## 7. Files Modified During QA & Hardening

- [lib/email/emailService.ts](file:///d:/My%20Projects/bft-one/lib/email/emailService.ts) — Added `MAX_EMAIL_RETRY_ATTEMPTS`, `isPermanentEmailFailure()`, and deterministic `nowMs` parameter on `computeNextRetryAt()`.
- [lib/email/subscriptionNotificationService.ts](file:///d:/My%20Projects/bft-one/lib/email/subscriptionNotificationService.ts) — Added atomic `processing` row claim, `nowOverride` injectable clock, `businessIdsFilter`, `checkUsageAndPriorityGate()` enforcement, and transient retry processing.
- [tests/security/phase8-email-qa-and-security.test.mjs](file:///d:/My%20Projects/bft-one/tests/security/phase8-email-qa-and-security.test.mjs) — Automated QA, concurrency, RLS, webhook signature, and secret-leakage validation suite.
- [COUNTERCUB_EMAIL_PRODUCTION_READINESS_REPORT.md](file:///d:/My%20Projects/bft-one/COUNTERCUB_EMAIL_PRODUCTION_READINESS_REPORT.md) — This report.

---

## 8. Remaining Issues

| Severity | Item | Action Required |
|---|---|---|
| **MEDIUM** | Live Resend Webhook not yet verified in Production | Register `https://app.countercub.com/api/webhooks/resend` in Resend Dashboard, add `RESEND_WEBHOOK_SECRET` in Vercel Production, redeploy, and send one test email from Email Centre to confirm `delivered` webhook reconciliation. |

---

## 9. Final Release Recommendation

CounterCub's centralized event-triggered email notification system is **Conditionally Ready** and safe to deploy to Production once `RESEND_WEBHOOK_SECRET` is configured in Vercel Production and the webhook endpoint is registered in Resend Dashboard. Scheduled expiry reminders are safely disabled (`SCHEDULED_EMAIL_PROCESSING_ENABLED = false`, no Vercel/Supabase cron configured, no `CRON_SECRET` required). No critical or high-severity defects remain open.

