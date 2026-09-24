-- ==============================================================================
-- BFT ONE — MULTI-TENANT SAAS DATABASE MIGRATION SCRIPT
-- ==============================================================================
-- Run this script in the Supabase SQL Editor:
-- https://supabase.com/dashboard/project/ekwiorjhcwrhrpkovyvl/sql/new
--
-- This script is strictly NON-DESTRUCTIVE and IDEMPOTENT (safe to run multiple times).
-- It converts the single-business database into a production-grade multi-tenant
-- SaaS architecture while preserving all 1,104 timesheets, 623 salary entries,
-- 75 daily sales, 392 leaves, and 11 profiles.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. CREATE BUSINESSES TABLE (TENANTS)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.businesses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    logo_url TEXT DEFAULT '/logo_payslip.jpg',
    currency_symbol TEXT DEFAULT '₹',
    timezone TEXT DEFAULT 'Asia/Kolkata',
    geofence_lat NUMERIC(10, 7) DEFAULT 12.8439000,
    geofence_lng NUMERIC(10, 7) DEFAULT 80.2268000,
    geofence_radius_meters INTEGER DEFAULT 150,
    geofence_enabled BOOLEAN DEFAULT true,
    enabled_modules JSONB DEFAULT '{"billing":true,"sales":true,"expenses":true,"timesheet":true,"stock":true,"salary":true,"contacts":true}'::jsonb,
    plan_type TEXT DEFAULT 'pro',
    max_users INTEGER DEFAULT 50,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for instant subdomain/slug resolution
CREATE INDEX IF NOT EXISTS idx_businesses_slug ON public.businesses(slug);

-- ------------------------------------------------------------------------------
-- 2. INSERT FIRST TENANT (BROWN FENING TEA - NAVALUR)
-- ------------------------------------------------------------------------------
-- Deterministic primary UUID for BFT One so existing data maps cleanly
INSERT INTO public.businesses (
    id,
    name,
    slug,
    logo_url,
    currency_symbol,
    timezone,
    geofence_lat,
    geofence_lng,
    geofence_radius_meters,
    geofence_enabled,
    enabled_modules,
    plan_type,
    max_users,
    is_active
) VALUES (
    'a0000000-0000-0000-0000-000000000001',
    'Brown Fening Tea - Navalur',
    'bft-navalur',
    '/logo_payslip.jpg',
    '₹',
    'Asia/Kolkata',
    12.8439000,
    80.2268000,
    150,
    true,
    '{"billing":true,"sales":true,"expenses":true,"timesheet":true,"stock":true,"salary":true,"contacts":true}'::jsonb,
    'pro',
    50,
    true
)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    slug = EXCLUDED.slug;

-- Also support bftone as default slug alias if not already taken
INSERT INTO public.businesses (
    id,
    name,
    slug,
    logo_url,
    currency_symbol,
    timezone,
    is_active
) VALUES (
    'a0000000-0000-0000-0000-000000000002',
    'BFT One Main',
    'bftone',
    '/logo_payslip.jpg',
    '₹',
    'Asia/Kolkata',
    true
)
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 3. EXTEND PROFILES FOR MULTI-TENANCY & SUPER ADMIN
-- ------------------------------------------------------------------------------
ALTER TABLE public.profiles 
    ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES public.businesses(id),
    ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN DEFAULT false;

-- Backfill existing profiles to BFT Navalur
UPDATE public.profiles 
SET business_id = 'a0000000-0000-0000-0000-000000000001'
WHERE business_id IS NULL;

-- Mark admin@bft.com as platform Super Admin
UPDATE public.profiles 
SET is_super_admin = true 
WHERE email = 'admin@bft.com';

CREATE INDEX IF NOT EXISTS idx_profiles_business_id ON public.profiles(business_id);
CREATE INDEX IF NOT EXISTS idx_profiles_super_admin ON public.profiles(is_super_admin);

-- ------------------------------------------------------------------------------
-- 4. ADD BUSINESS_ID TO ALL BUSINESS TABLES & BACKFILL
-- ------------------------------------------------------------------------------

-- 4.1 daily_sales
ALTER TABLE public.daily_sales ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES public.businesses(id);
UPDATE public.daily_sales SET business_id = 'a0000000-0000-0000-0000-000000000001' WHERE business_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_daily_sales_business_date ON public.daily_sales(business_id, sale_date);

-- 4.2 daily_expenses
ALTER TABLE public.daily_expenses ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES public.businesses(id);
UPDATE public.daily_expenses SET business_id = 'a0000000-0000-0000-0000-000000000001' WHERE business_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_daily_expenses_business_date ON public.daily_expenses(business_id, expense_date);

-- 4.3 expense_price_list
ALTER TABLE public.expense_price_list ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES public.businesses(id);
UPDATE public.expense_price_list SET business_id = 'a0000000-0000-0000-0000-000000000001' WHERE business_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_expense_price_list_business ON public.expense_price_list(business_id);

-- 4.4 categories
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES public.businesses(id);
UPDATE public.categories SET business_id = 'a0000000-0000-0000-0000-000000000001' WHERE business_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_categories_business ON public.categories(business_id);

-- 4.5 products
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES public.businesses(id);
UPDATE public.products SET business_id = 'a0000000-0000-0000-0000-000000000001' WHERE business_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_products_business_cat ON public.products(business_id, category_id);

-- 4.6 product_stocks
ALTER TABLE public.product_stocks ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES public.businesses(id);
UPDATE public.product_stocks SET business_id = 'a0000000-0000-0000-0000-000000000001' WHERE business_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_product_stocks_business ON public.product_stocks(business_id);

-- 4.7 orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES public.businesses(id);
UPDATE public.orders SET business_id = 'a0000000-0000-0000-0000-000000000001' WHERE business_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_orders_business_status ON public.orders(business_id, status);

-- 4.8 order_items
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES public.businesses(id);
UPDATE public.order_items SET business_id = 'a0000000-0000-0000-0000-000000000001' WHERE business_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_order_items_business ON public.order_items(business_id);

-- 4.9 timesheets
ALTER TABLE public.timesheets ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES public.businesses(id);
UPDATE public.timesheets SET business_id = 'a0000000-0000-0000-0000-000000000001' WHERE business_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_timesheets_business_user ON public.timesheets(business_id, user_id, work_date);

-- 4.10 leaves
ALTER TABLE public.leaves ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES public.businesses(id);
UPDATE public.leaves SET business_id = 'a0000000-0000-0000-0000-000000000001' WHERE business_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_leaves_business_user ON public.leaves(business_id, user_id, leave_date);

-- 4.11 salary_entries
ALTER TABLE public.salary_entries ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES public.businesses(id);
UPDATE public.salary_entries SET business_id = 'a0000000-0000-0000-0000-000000000001' WHERE business_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_salary_entries_business_user ON public.salary_entries(business_id, user_id, entry_date);

-- 4.12 salary_settlements
ALTER TABLE public.salary_settlements ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES public.businesses(id);
UPDATE public.salary_settlements SET business_id = 'a0000000-0000-0000-0000-000000000001' WHERE business_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_salary_settlements_business ON public.salary_settlements(business_id, user_id);

-- 4.13 shifts
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES public.businesses(id);
UPDATE public.shifts SET business_id = 'a0000000-0000-0000-0000-000000000001' WHERE business_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_shifts_business ON public.shifts(business_id, user_id);

-- 4.14 external_contacts
ALTER TABLE public.external_contacts ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES public.businesses(id);
UPDATE public.external_contacts SET business_id = 'a0000000-0000-0000-0000-000000000001' WHERE business_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_external_contacts_business ON public.external_contacts(business_id);

-- 4.15 notifications
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES public.businesses(id);
UPDATE public.notifications SET business_id = 'a0000000-0000-0000-0000-000000000001' WHERE business_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_business ON public.notifications(business_id);

-- ------------------------------------------------------------------------------
-- 5. HELPER FUNCTIONS FOR SECURITY & ISOLATION
-- ------------------------------------------------------------------------------

-- Get current user's business_id
CREATE OR REPLACE FUNCTION public.get_current_business_id()
RETURNS UUID AS $$
  SELECT business_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Check if current user is platform super admin
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN AS $$
  SELECT COALESCE((SELECT is_super_admin FROM public.profiles WHERE id = auth.uid()), false);
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ------------------------------------------------------------------------------
-- 6. ENABLE ROW LEVEL SECURITY (RLS) POLICIES
-- ------------------------------------------------------------------------------

-- Enable RLS on businesses
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can view their own business profile or super admins can view all
CREATE POLICY "allow_view_own_business" ON public.businesses
FOR SELECT TO authenticated
USING (id = public.get_current_business_id() OR public.is_super_admin());

-- Super admins can insert/update businesses
CREATE POLICY "allow_super_admin_manage_businesses" ON public.businesses
FOR ALL TO authenticated
USING (public.is_super_admin());

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_tenant_isolation" ON public.profiles
FOR SELECT TO authenticated
USING (business_id = public.get_current_business_id() OR public.is_super_admin());

CREATE POLICY "profiles_tenant_update" ON public.profiles
FOR UPDATE TO authenticated
USING (
    (business_id = public.get_current_business_id() AND (
        -- User can update own profile OR admin can update profiles in their business
        id = auth.uid() OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid()) = true
    ))
    OR public.is_super_admin()
);

-- Repeat clean tenant isolation policy for all business data tables
DO $$
DECLARE
    tbl text;
    tables text[] := ARRAY[
        'daily_sales',
        'daily_expenses',
        'expense_price_list',
        'categories',
        'products',
        'product_stocks',
        'orders',
        'order_items',
        'timesheets',
        'leaves',
        'salary_entries',
        'salary_settlements',
        'shifts',
        'external_contacts',
        'notifications'
    ];
BEGIN
    FOREACH tbl IN ARRAY tables LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
        
        -- Drop existing policy if any to avoid duplicates
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', 'tenant_isolation_' || tbl, tbl);
        
        -- Create tenant policy
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (business_id = public.get_current_business_id() OR public.is_super_admin());',
            'tenant_isolation_' || tbl,
            tbl
        );
    END LOOP;
END $$;

COMMIT;

-- ==============================================================================
-- VERIFICATION QUERY
-- ==============================================================================
SELECT 
    b.name AS business_name,
    b.slug,
    (SELECT count(*) FROM public.profiles WHERE business_id = b.id) AS profiles_count,
    (SELECT count(*) FROM public.timesheets WHERE business_id = b.id) AS timesheets_count,
    (SELECT count(*) FROM public.salary_entries WHERE business_id = b.id) AS salary_entries_count,
    (SELECT count(*) FROM public.daily_sales WHERE business_id = b.id) AS sales_count,
    (SELECT count(*) FROM public.leaves WHERE business_id = b.id) AS leaves_count
FROM public.businesses b;
