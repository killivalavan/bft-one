# SeyalPro — Security Audit Report

**Date:** October 2026  
**Auditor:** Application Security Lead & Supabase/PostgreSQL Security Specialist  
**Classification:** Proprietary / Confidential  
**Scope:** `bft-one` (All API Routes, RLS Policies, Middleware, Client State, Offline Engine)  

---

## Vulnerability Inventory Summary

| ID | Title | Severity | Status | Affected Component |
| :--- | :--- | :---: | :---: | :--- |
| **SEC-01** | Hardcoded Navalur Tenant Fallback in Middleware, Context & POS | **CRITICAL** | Verified | `middleware.ts`, `TenantContext.tsx`, `billing/page.tsx` |
| **SEC-02** | Client-Side Privilege Escalation via Unrestricted `profiles` Update | **CRITICAL** | Verified | `fix_tenant_rls.sql` (`profiles_tenant_update`) |
| **SEC-03** | Public Read Policy on `businesses` Exposing Embedded B2B Invoices | **CRITICAL** | Verified | `fix_tenant_rls.sql` (`allow_public_read_businesses`) |
| **SEC-04** | Offline Sync Queue Replay & Cross-Tenant Reassignment | **HIGH** | Verified | `lib/offline/syncEngine.ts`, `lib/offline/db.ts` |
| **SEC-05** | Cross-Tenant Stock Depletion via Unscoped `product_stocks` Query | **HIGH** | Verified | `app/api/stock/adjust/route.ts` |
| **SEC-06** | Null-BusinessID Bypass in User Management & Account Takeover | **HIGH** | Verified | `app/api/seed-admin/route.ts`, `app/api/admin-users/route.ts` |
| **SEC-07** | Destructive Deletion of Historical `daily_sales` on User Removal | **HIGH** | Verified | `app/api/admin-users/route.ts` |
| **SEC-08** | Missing Admin Role Authorization on Data Migration Endpoint | **HIGH** | Verified | `app/api/migrate/route.ts` |
| **SEC-09** | Cross-Tenant Data Leak in Deductions Fallback Query | **HIGH** | Verified | `app/api/deductions/route.ts` |
| **SEC-10** | Hardcoded Super Admin Email Heuristic Bypass in `serverAuth.ts` | **MEDIUM** | Verified | `lib/auth/serverAuth.ts` |
| **SEC-11** | Inadequate Browser State Eviction & Cache Retention on Logout | **MEDIUM** | Verified | `components/admin-dashboard/AdminSidebar.tsx` |
| **SEC-12** | Missing `Cache-Control: private, no-store` on Authenticated APIs | **MEDIUM** | Verified | `app/api/*` |

---

## Detailed Vulnerability Analysis

### [SEC-01] Hardcoded Navalur Tenant Fallback (CRITICAL)
- **Files:** `middleware.ts` (L56), `lib/context/TenantContext.tsx` (L331), `lib/hooks/useProfile.ts` (L12), `lib/offline/syncEngine.ts` (L285), `app/(protected)/billing/page.tsx` (L614).
- **Mechanism:** When a request has an unresolvable subdomain or missing session/profile, it silently assigns the caller to the Navalur store (`a0000000-0000-0000-0000-000000000001`). When an offline POS order is placed while the tenant is resolving, `bizId` defaults to `DEFAULT_BUSINESS.id`.
- **Impact:** Complete breakdown of multi-tenant isolation; unassigned users or offline cashiers contaminate Navalur's production database.
- **Remediation:** Remove `DEFAULT_BUSINESS` fallbacks. Enforce fail-closed state (`Workspace Unavailable` / 403 Forbidden) when tenant identity cannot be authoritatively resolved.

### [SEC-02] Client-Side Privilege Escalation in `profiles` RLS (CRITICAL)
- **File:** `fix_tenant_rls.sql` (L93-L110)
- **Mechanism:** `profiles_tenant_update` allows users to update their own row (`id = auth.uid()`). The `WITH CHECK` clause only validates `business_id = public.get_current_business_id()`. There is no check preventing the user from setting `is_admin = true` or `is_super_admin = true`.
- **Impact:** Any authenticated employee can execute `supabase.from('profiles').update({ is_admin: true, is_super_admin: true }).eq('id', auth.uid())` and become a Super Admin.
- **Remediation:** Create a PostgreSQL trigger or enforce column-level security ensuring non-super-admins cannot alter `is_admin`, `is_super_admin`, or `business_id`.

### [SEC-03] Public Read Policy on `businesses` Table (CRITICAL)
- **File:** `fix_tenant_rls.sql` (L67-L68)
- **Mechanism:** Policy `allow_public_read_businesses` is `FOR SELECT USING (true)` for all visitors (even anonymous). The `businesses` table holds `enabled_modules`, which in many stores contains `_b2b_data` (invoices, client names, phones, addresses, and order histories).
- **Impact:** Anyone on the internet can query `supabase.from('businesses').select('*')` and harvest private B2B invoices and customer PII across all tenants.
- **Remediation:** Restrict public `SELECT` on `businesses` to non-sensitive fields (`id`, `name`, `slug`, `logo_url`, `currency_symbol`) or create a separate `public_business_profiles` view. Restrict `enabled_modules` access strictly to authenticated members of that business.

### [SEC-04] Offline Sync Queue Replay & Cross-Tenant Reassignment (HIGH)
- **Files:** `lib/offline/syncEngine.ts`, `lib/offline/db.ts`
- **Mechanism:** `SyncQueueItem` does not record the originating `user_id`. When `getEffectiveBusinessId` runs upon reconnection, it inspects whoever is *currently* authenticated in the browser and reassigns `payload.business_id = prof.business_id`.
- **Impact:** If User A from Store A goes offline, logs out, and User B from Store B logs in on that shared terminal, Store A's pending orders are synced into Store B's database.
- **Remediation:** Bind each queue item to `user_id` and `business_id`. Before executing cloud mutation, verify `op.business_id === caller.business_id && op.user_id === caller.id`. Quarantine mismatched operations.

### [SEC-05] Cross-Tenant Stock Depletion via Unscoped `product_stocks` Query (HIGH)
- **File:** `app/api/stock/adjust/route.ts` (L29-L32, L78)
- **Mechanism:** `stock/adjust` queries `product_stocks` and `products` using `in("product_id", ids)` without filtering by `business_id = callerBusinessId`. It then executes an upsert without `business_id`.
- **Impact:** A caller in Store A passing `product_id`s belonging to Store B can deplete Store B's stock and trigger false out-of-stock alerts.
- **Remediation:** Enforce `eq("business_id", callerBusinessId)` on all reads and writes in `stock/adjust`.
