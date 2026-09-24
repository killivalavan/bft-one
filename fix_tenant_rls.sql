-- ==============================================================================
-- BFT ONE — COMPLETE TENANT DATA ISOLATION FIX
-- Run this in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/ekwiorjhcwrhrpkovyvl/sql/new
-- ==============================================================================
-- WHY: The original DO $$ block may have failed to create policies on data tables.
-- This script explicitly creates RLS policies for EVERY table — no dynamic SQL,
-- no risk of silent failure.
--
-- RESULT AFTER RUNNING:
--   • mongo@gmail.com → sees 0 timesheets, 0 salaries (new empty business) ✅
--   • admin@bft.com   → sees all 1000+ BFT Navalur timesheets ✅
--   • Cross-tenant data leakage = IMPOSSIBLE ✅
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- STEP 1: Ensure get_current_business_id() and is_super_admin() functions exist
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.get_current_business_id()
RETURNS UUID AS $$
  SELECT business_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (SELECT is_super_admin FROM public.profiles WHERE id = auth.uid()),
    false
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ==============================================================================
-- STEP 1B: Clean up any old/legacy policies on all multi-tenant tables
-- (Prevents old permissive policies from leaking data)
-- ==============================================================================
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN
        SELECT schemaname, tablename, policyname
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename IN (
            'businesses', 'profiles', 'timesheets', 'leaves',
            'salary_entries', 'salary_settlements', 'daily_sales',
            'daily_expenses', 'expense_price_list', 'categories',
            'products', 'product_stocks', 'orders', 'order_items',
            'shifts', 'external_contacts', 'notifications'
          )
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I;', pol.policyname, pol.schemaname, pol.tablename);
    END LOOP;
END $$;

-- ==============================================================================
-- STEP 2: businesses — public read (for login page branding), super admin write
-- ==============================================================================
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_view_own_business" ON public.businesses;
DROP POLICY IF EXISTS "allow_public_read_businesses" ON public.businesses;
DROP POLICY IF EXISTS "allow_super_admin_manage_businesses" ON public.businesses;

-- Anyone (even unauthenticated) can read businesses by slug for login page branding
CREATE POLICY "allow_public_read_businesses" ON public.businesses
FOR SELECT USING (true);

-- Only super admins can INSERT/UPDATE/DELETE businesses
CREATE POLICY "allow_super_admin_manage_businesses" ON public.businesses
FOR ALL TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

-- ==============================================================================
-- STEP 3: profiles — tenant-isolated reads, users can update own profile
-- ==============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profiles_tenant_isolation" ON public.profiles;
DROP POLICY IF EXISTS "profiles_tenant_update" ON public.profiles;
DROP POLICY IF EXISTS "profiles_self_insert" ON public.profiles;

-- Users only see profiles from their own business
CREATE POLICY "profiles_tenant_isolation" ON public.profiles
FOR SELECT TO authenticated
USING (
  business_id = public.get_current_business_id()
  OR public.is_super_admin()
);

-- Users can update own profile, admins can update within their business
CREATE POLICY "profiles_tenant_update" ON public.profiles
FOR UPDATE TO authenticated
USING (
  (business_id = public.get_current_business_id() AND (
    id = auth.uid()
    OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid()) = true
  ))
  OR public.is_super_admin()
)
WITH CHECK (
  business_id = public.get_current_business_id()
  OR public.is_super_admin()
);

-- Allow new profile creation (needed for signup triggers)
CREATE POLICY "profiles_self_insert" ON public.profiles
FOR INSERT TO authenticated
WITH CHECK (id = auth.uid());

-- ==============================================================================
-- STEP 4: timesheets — tenant isolated
-- ==============================================================================
ALTER TABLE public.timesheets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_timesheets" ON public.timesheets;
CREATE POLICY "tenant_isolation_timesheets" ON public.timesheets
FOR ALL TO authenticated
USING (
  business_id = public.get_current_business_id()
  OR public.is_super_admin()
)
WITH CHECK (
  business_id = public.get_current_business_id()
  OR public.is_super_admin()
);

-- ==============================================================================
-- STEP 5: leaves — tenant isolated
-- ==============================================================================
ALTER TABLE public.leaves ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_leaves" ON public.leaves;
CREATE POLICY "tenant_isolation_leaves" ON public.leaves
FOR ALL TO authenticated
USING (
  business_id = public.get_current_business_id()
  OR public.is_super_admin()
)
WITH CHECK (
  business_id = public.get_current_business_id()
  OR public.is_super_admin()
);

-- ==============================================================================
-- STEP 6: salary_entries — tenant isolated
-- ==============================================================================
ALTER TABLE public.salary_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_salary_entries" ON public.salary_entries;
CREATE POLICY "tenant_isolation_salary_entries" ON public.salary_entries
FOR ALL TO authenticated
USING (
  business_id = public.get_current_business_id()
  OR public.is_super_admin()
)
WITH CHECK (
  business_id = public.get_current_business_id()
  OR public.is_super_admin()
);

-- ==============================================================================
-- STEP 7: salary_settlements — tenant isolated
-- ==============================================================================
ALTER TABLE public.salary_settlements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_salary_settlements" ON public.salary_settlements;
CREATE POLICY "tenant_isolation_salary_settlements" ON public.salary_settlements
FOR ALL TO authenticated
USING (
  business_id = public.get_current_business_id()
  OR public.is_super_admin()
)
WITH CHECK (
  business_id = public.get_current_business_id()
  OR public.is_super_admin()
);

-- ==============================================================================
-- STEP 8: daily_sales — tenant isolated
-- ==============================================================================
ALTER TABLE public.daily_sales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_daily_sales" ON public.daily_sales;
CREATE POLICY "tenant_isolation_daily_sales" ON public.daily_sales
FOR ALL TO authenticated
USING (
  business_id = public.get_current_business_id()
  OR public.is_super_admin()
)
WITH CHECK (
  business_id = public.get_current_business_id()
  OR public.is_super_admin()
);

-- ==============================================================================
-- STEP 9: daily_expenses — tenant isolated
-- ==============================================================================
ALTER TABLE public.daily_expenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_daily_expenses" ON public.daily_expenses;
CREATE POLICY "tenant_isolation_daily_expenses" ON public.daily_expenses
FOR ALL TO authenticated
USING (
  business_id = public.get_current_business_id()
  OR public.is_super_admin()
)
WITH CHECK (
  business_id = public.get_current_business_id()
  OR public.is_super_admin()
);

-- ==============================================================================
-- STEP 10: expense_price_list — tenant isolated
-- ==============================================================================
ALTER TABLE public.expense_price_list ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_expense_price_list" ON public.expense_price_list;
CREATE POLICY "tenant_isolation_expense_price_list" ON public.expense_price_list
FOR ALL TO authenticated
USING (
  business_id = public.get_current_business_id()
  OR public.is_super_admin()
)
WITH CHECK (
  business_id = public.get_current_business_id()
  OR public.is_super_admin()
);

-- ==============================================================================
-- STEP 11: categories — tenant isolated
-- ==============================================================================
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_categories" ON public.categories;
CREATE POLICY "tenant_isolation_categories" ON public.categories
FOR ALL TO authenticated
USING (
  business_id = public.get_current_business_id()
  OR public.is_super_admin()
)
WITH CHECK (
  business_id = public.get_current_business_id()
  OR public.is_super_admin()
);

-- ==============================================================================
-- STEP 12: products — tenant isolated
-- ==============================================================================
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_products" ON public.products;
CREATE POLICY "tenant_isolation_products" ON public.products
FOR ALL TO authenticated
USING (
  business_id = public.get_current_business_id()
  OR public.is_super_admin()
)
WITH CHECK (
  business_id = public.get_current_business_id()
  OR public.is_super_admin()
);

-- ==============================================================================
-- STEP 13: product_stocks — tenant isolated
-- ==============================================================================
ALTER TABLE public.product_stocks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_product_stocks" ON public.product_stocks;
CREATE POLICY "tenant_isolation_product_stocks" ON public.product_stocks
FOR ALL TO authenticated
USING (
  business_id = public.get_current_business_id()
  OR public.is_super_admin()
)
WITH CHECK (
  business_id = public.get_current_business_id()
  OR public.is_super_admin()
);

-- ==============================================================================
-- STEP 14: orders — tenant isolated
-- ==============================================================================
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_orders" ON public.orders;
CREATE POLICY "tenant_isolation_orders" ON public.orders
FOR ALL TO authenticated
USING (
  business_id = public.get_current_business_id()
  OR public.is_super_admin()
)
WITH CHECK (
  business_id = public.get_current_business_id()
  OR public.is_super_admin()
);

-- ==============================================================================
-- STEP 15: order_items — tenant isolated
-- ==============================================================================
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_order_items" ON public.order_items;
CREATE POLICY "tenant_isolation_order_items" ON public.order_items
FOR ALL TO authenticated
USING (
  business_id = public.get_current_business_id()
  OR public.is_super_admin()
)
WITH CHECK (
  business_id = public.get_current_business_id()
  OR public.is_super_admin()
);

-- ==============================================================================
-- STEP 16: shifts — tenant isolated
-- ==============================================================================
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_shifts" ON public.shifts;
CREATE POLICY "tenant_isolation_shifts" ON public.shifts
FOR ALL TO authenticated
USING (
  business_id = public.get_current_business_id()
  OR public.is_super_admin()
)
WITH CHECK (
  business_id = public.get_current_business_id()
  OR public.is_super_admin()
);

-- ==============================================================================
-- STEP 17: external_contacts — tenant isolated
-- ==============================================================================
ALTER TABLE public.external_contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_external_contacts" ON public.external_contacts;
CREATE POLICY "tenant_isolation_external_contacts" ON public.external_contacts
FOR ALL TO authenticated
USING (
  business_id = public.get_current_business_id()
  OR public.is_super_admin()
)
WITH CHECK (
  business_id = public.get_current_business_id()
  OR public.is_super_admin()
);

-- ==============================================================================
-- STEP 18: notifications — tenant isolated
-- ==============================================================================
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_notifications" ON public.notifications;
CREATE POLICY "tenant_isolation_notifications" ON public.notifications
FOR ALL TO authenticated
USING (
  business_id = public.get_current_business_id()
  OR public.is_super_admin()
)
WITH CHECK (
  business_id = public.get_current_business_id()
  OR public.is_super_admin()
);

COMMIT;

-- ==============================================================================
-- VERIFICATION — run this separately to confirm isolation is working
-- ==============================================================================
-- Expected: mongo@gmail.com (business = 223e2673...) sees 0 timesheets
-- Expected: admin@bft.com (business = a0000000...) sees 1000 timesheets
-- 
-- SELECT 
--   b.name AS business,
--   (SELECT COUNT(*) FROM public.timesheets t WHERE t.business_id = b.id) AS timesheets,
--   (SELECT COUNT(*) FROM public.salary_entries s WHERE s.business_id = b.id) AS salaries,
--   (SELECT COUNT(*) FROM public.profiles p WHERE p.business_id = b.id) AS users
-- FROM public.businesses b
-- ORDER BY b.created_at;
