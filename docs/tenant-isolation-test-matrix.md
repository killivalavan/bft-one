# SeyalPro — Two-Tenant Isolation Test Matrix

**Purpose:** Repeatable multi-tenant isolation testing between two independent test tenants:
- **Tenant A (Store A):** `store-alpha` (`id: 11111111-1111-1111-1111-111111111111`)
- **Tenant B (Store B):** `store-beta` (`id: 22222222-2222-2222-2222-222222222222`)

---

## Access Path Test Matrix

| # | Attack / Access Vector | Action Under Test | Expected Result | Pass Criteria |
| :---: | :--- | :--- | :--- | :--- |
| **T01** | Direct API Scoping | Store A user calls `GET /api/invoices?business_id=store-beta-id` | `403 Forbidden` | Zero Store B invoices returned |
| **T02** | Direct API Write | Store A user calls `POST /api/invoices` with Store B's `business_id` | `403 Forbidden` | No invoice created in Store B |
| **T03** | B2B Dispatches Read | Store A user calls `GET /api/b2b/dispatches?business_id=store-beta-id` | `403 Forbidden` | Zero Store B dispatches returned |
| **T04** | Stock Depletion | Store A user calls `POST /api/stock/adjust` with Store B's `product_id` | `200 OK` (skipped) or `403` | Store B's `available_qty` unchanged |
| **T05** | Order Cancellation | Store A user calls `POST /api/orders/cancel` with Store B's `order_id` | `403 Forbidden` | Store B's order remains active |
| **T06** | User Deletion | Store A Admin calls `DELETE /api/admin-users` with Store B's `userId` | `403 Forbidden` | Store B employee not deleted |
| **T07** | Deductions Query | Store A Admin calls `GET /api/deductions` | `200 OK` | Only Store A deductions returned |
| **T08** | Offline Sync Replay | Store A user enqueues offline order, logs out; Store B user logs in and syncs | Quarantined / Rejected | Store A order NOT written to Store B |
| **T09** | Subdomain Manipulation | Store A user navigates to `beta.seyalpro.in` while logged in | Blocked / Redirected | User cannot access Store B workspace |
| **T10** | Database RLS Select | Store A authenticated client runs `supabase.from('daily_sales').select()` | Returns only Store A rows | 0 Store B rows visible |
| **T11** | Database RLS Insert | Store A authenticated client runs `supabase.from('invoices').insert({ business_id: store-beta-id })` | PostgreSQL RLS Violation | Insert rejected by database |
| **T12** | Privilege Escalation | Store A regular staff runs `supabase.from('profiles').update({ is_admin: true })` | Blocked / RLS Violation | `is_admin` remains `false` |
| **T13** | Anonymous Config Read | Unauthenticated visitor queries `supabase.from('businesses').select('*')` | Restricted / Filtered | `_b2b_data` invoices NOT exposed |
| **T14** | Cache Leakage | User switches from Store A to Store B in same browser session | All caches evicted | Store A data absent from memory & UI |
