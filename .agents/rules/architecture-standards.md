# SeyalPro Architecture Standard: Single Source of Truth & Caching

> **MANDATORY ENGINEERING RULE FOR ALL SEYALPRO DEVELOPMENT**  
> Every engineer, subagent, and automated process working in this codebase MUST strictly adhere to these architectural standards.

---

## 1. Supabase is the Single Source of Truth
* All persistent business records (POS orders, tax invoices, B2B delivery slips, wholesale products, customer accounts, payment receipts, operational expenses, inventory, and timesheets) **MUST be persisted directly in Supabase**.
* **NEVER** use `localStorage`, `sessionStorage`, or in-memory arrays as the primary storage for business data.
* `localStorage` and `IndexedDB` are strictly reserved as **high-speed read caches** (for 0ms instant-render on page mount) and **offline-first queues** (when the internet drops).
* A write operation is only complete once it has been successfully persisted to Supabase or queued in an authorized sync engine.

---

## 2. TanStack Query v5 Caching Strategy
* The application runs on a universal `QueryProvider` defined in `components/providers/QueryProvider.tsx` and wrapped at the root in `app/layout.tsx`.
* **Centralized Typed Hooks**: Components must NEVER issue ad-hoc `fetch()` or `supabaseClient.from()` inside isolated `useEffect` blocks if that data is shared or reused during navigation.
* Always define and consume standardized typed hooks in `lib/hooks/`:
  - `useInvoicesQuery(bizId)`
  - `useB2BWorkspace(bizId)`
  - `useB2BDispatches(bizId)`
  - `useB2BProducts(bizId)`
  - `useB2BPayments(bizId)`
  - `useB2BExpenses(bizId)`
  - `useDailySalesQuery(bizId, dateStr)`
* **Stable Query Keys**: Query keys must always be scoped by module and tenant:
  `['<module_name>', bizId, '<entity_name>', ...params]`
* **Default Caching Policy**:
  - `staleTime: 2 * 60 * 1000` (2 minutes): Navigating between pages reuses valid cached data with **zero redundant network calls**.
  - `gcTime: 30 * 60 * 1000` (30 minutes): Inactive cache is held in memory for smooth transitions.
  - `refetchOnWindowFocus: false`: Prevents unnecessary background network bursts.
  - `refetchOnReconnect: true`: Revalidates automatically when device regains connectivity.

---

## 3. Targeted Cache Invalidation on Mutations
* Whenever data is created, updated, or deleted, the corresponding TanStack mutation must invalidate **ONLY** the affected query keys.
* Examples:
  - Creating a delivery slip -> invalidates `['b2b', bizId, 'dispatches']`, `['b2b', bizId, 'workspace']`, `['invoices', bizId]`.
  - Recording a payment -> invalidates `['b2b', bizId, 'payments']`, `['b2b', bizId, 'dispatches']`, `['b2b', bizId, 'workspace']`.
  - Updating a product rate -> invalidates `['b2b', bizId, 'products']`.
  - Recording an expense -> invalidates `['b2b', bizId, 'expenses']`, `['b2b', bizId, 'workspace']`.
* Never globally clear or wipe the entire query cache on a single entity mutation.

---

## 4. Multi-Tenant Row Level Security (RLS) & Authorization
* **Every database table** must have `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`.
* Policies must enforce:
  ```sql
  CREATE POLICY "tenant_isolation" ON public.<table_name>
  FOR ALL TO authenticated
  USING (
      public.is_super_admin() OR 
      business_id = public.get_current_business_id()
  )
  WITH CHECK (
      public.is_super_admin() OR 
      business_id = public.get_current_business_id()
  );
  ```
* Every API route in `app/api/*` must call `authenticateRequest(req)` from `@/lib/auth/serverAuth` to authenticate the user and enforce that non-Super-Admins can only read/write records for their own `business_id`.

---

## 5. Dual-Engine Persistence Resilience
* Server routes must attempt relational table operations first.
* If a table is pending migration in the Supabase Dashboard (`PGRST205: table not found`), the route must seamlessly fall back to `businesses.enabled_modules._<feature_name>` to prevent user-facing crashes and guarantee cross-device parity across mobile phones and desktop browsers.
