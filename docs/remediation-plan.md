# SeyalPro — Remediation Plan

**Phased Execution Strategy for Production Hardening & Dedicated Super Admin Security**

---

## Phase B: Critical Security & Tenant Isolation (Highest Priority)
1. **Fix SEC-01 (Navalur Fallback):**
   - Update `middleware.ts`: If tenant resolution fails, do not silently set `bft-navalur`. Allow request to pass with `x-tenant-slug: null` and let client/API fail closed.
   - Update `lib/context/TenantContext.tsx`: Remove fallback to `DEFAULT_BUSINESS.id`. If no business is resolved, set `NEUTRAL_BUSINESS` and render the neutral "Workspace Unavailable" screen.
   - Update `lib/hooks/useProfile.ts`: Remove `DEFAULT_BUSINESS_ID` fallback.
   - Update `app/(protected)/billing/page.tsx`: Prevent checkout if `business?.id` is not ready.
2. **Fix SEC-02 & SEC-03 (PostgreSQL RLS Policies):**
   - Create migration `supabase_security_hardening.sql`:
     - Fix `profiles_tenant_update`: Restrict update of `is_admin`, `is_super_admin`, and `business_id` exclusively to super admins.
     - Add trigger `prevent_profile_privilege_escalation` to reject unauthorized role changes.
     - Restrict `businesses` public read: Create `public_businesses_summary` view exposing only `id, name, slug, logo_url, currency_symbol` for login branding, leaving `enabled_modules` protected.
3. **Fix SEC-06 & SEC-07 (User Management & Deletion Safety):**
   - In `app/api/admin-users/route.ts`:
     - Disallow deleting users if `targetProfile.business_id !== caller.businessId` (including when `targetProfile.business_id` is null).
     - Protect `daily_sales` by setting `cash_submitted_by = null` instead of deleting financial rows.
   - In `app/api/seed-admin/route.ts`:
     - Prevent updating passwords or modifying accounts if `targetProfile.business_id !== assignedBusinessId`.
4. **Fix SEC-08 (Missing Admin Check on `/api/migrate`):**
   - Require `{ requireAdmin: true }` in `authenticateRequest()`.
5. **Fix SEC-09 (Deductions Fallback Leak):**
   - Add `business_id.eq.${businessId}` to fallback query in `app/api/deductions/route.ts`.

---

## Phase B.2: Dedicated Super Admin Authentication & Authorization (Mandatory)
1. **Mandatory Server-Side TOTP MFA & AAL2 Assurance (`lib/auth/serverAuth.ts`):**
   - Update `authenticateRequest()`:
     - Add `requireAAL2: true` for all administrative routes.
     - Decode JWT payload claims and assert `aal === 'aal2'` when `requireSuperAdmin` is set.
     - Reject `aal1` (password-only) sessions with `403 Forbidden: MFA AAL2 Required`.
     - Remove hardcoded email strings (`admin@seyalpro.com`, `admin@bft.com`). Super Admin authority derives exclusively from `profile.is_super_admin === true` in PostgreSQL.
2. **Dedicated Super Admin Login Experience (`app/super-admin/login/page.tsx`):**
   - Complete TOTP MFA enrollment and verification loop.
   - Enforce immediate redirection to challenge step when TOTP factor is verified.
   - Present QR code & secret key for first-time enrollments with clear instructions.
   - Ensure unsuccessful MFA attempts log `SUPER_ADMIN_MFA_FAILED` and do not issue session cookies.
3. **Server-Side Super Admin Provisioning Script (`scripts/bootstrap-super-admin.mjs`):**
   - Server-side administrative script using service-role credentials to bootstrap the initial Super Admin.
   - Sets `is_super_admin: true`, `is_admin: true`, `business_id: null`.
   - Disables public self-registration.
4. **Privilege-Granting Protection & Reauthentication:**
   - In `app/api/seed-admin/route.ts` and `app/api/admin-users/route.ts`:
     - Block ordinary store admins from setting `is_super_admin: true`.
     - Enforce recent authentication check (session within last 15 minutes) for destructive operations like password resets and tenant suspension.
5. **Super Admin MFA Device Management & Recovery:**
   - Create route `/api/super-admin/mfa-reset`: Allows an authenticated `aal2` super admin or a CLI administrator (`scripts/reset-super-admin-mfa.mjs`) to unenroll an MFA factor for account recovery without emergency passwords or backdoors.
6. **Immutable Audit Logging (`lib/services/auditLogger.ts`):**
   - Extend `AuditAction` with `SUPER_ADMIN_LOGIN`, `SUPER_ADMIN_MFA_CHALLENGE`, `SUPER_ADMIN_MFA_ENROLLED`, `SUPER_ADMIN_MFA_FAILED`, `SUPER_ADMIN_BOOTSTRAP`, `PRIVILEGE_ELEVATION_ATTEMPT`.
   - Log all administrative events with client metadata (IP, user agent).

---

## Phase C: Financial Integrity & Offline Safety
1. **Fix SEC-04 (Offline Queue Tenant Isolation):**
   - Update `lib/offline/db.ts`: Add `user_id: string` to `SyncQueueItem`.
   - Update `lib/offline/syncEngine.ts`: Check that `session.user.id === op.user_id` and `caller.businessId === op.business_id` before executing. Quarantine mismatched items.
   - Remove `DEFAULT_BUSINESS_UUID = "a0000000-0000-0000-0000-000000000001"` fallback.
2. **Fix SEC-05 (Cross-Tenant Stock Adjustment):**
   - Update `app/api/stock/adjust/route.ts`: Enforce `business_id = callerBusinessId` on `product_stocks` selects and upserts.
3. **Fix POS Billing Safety:**
   - In `app/(protected)/billing/page.tsx`, disallow order placement if tenant is not loaded.

---

## Phase D: Cache Isolation & Security Headers
1. **Fix SEC-11 (Logout Eviction):**
   - In `AdminSidebar.tsx` / `handleLogout()`: Call `queryClient.clear()`, purge `seyalpro_offline_v1` and tenant-specific `localStorage`.
2. **Fix SEC-12 (Security Headers & Cache-Control):**
   - Configure security headers in `next.config.ts`: CSP, HSTS, Permissions-Policy, Referrer-Policy.
   - Inject `Cache-Control: private, no-store, no-cache, max-age=0, must-revalidate` in `middleware.ts` for all `/api/*` routes.
   - Add `export const dynamic = 'force-dynamic'` across authenticated route handlers.

---

## Phase E: Performance Optimization
1. Dynamic import of `jspdf` in PDF utilities to reduce initial bundle.
2. Add pagination parameters to large list queries in `/api/b2b/dispatches` and `/api/invoices`.

---

## Phase F: Automated Security & Regression Suite
1. Create automated test script `scripts/test-tenant-isolation.mjs` verifying T01-T14 from `docs/tenant-isolation-test-matrix.md`.
2. Create automated test script `scripts/test-super-admin-security.mjs` verifying:
   - Unauthenticated access blocked (401)
   - Store admin access blocked (403)
   - Password-only session without MFA (AAL1) blocked (403)
   - Super admin with MFA (AAL2) allowed (200)
   - Privilege escalation blocked.
