-- ==============================================================================
-- SEYALPRO MULTI-TENANT ISOLATION FIX: REMOVE GLOBAL SINGLE-TENANT UNIQUE CONSTRAINTS
-- ==============================================================================
-- Problem:
-- When SeyalPro was upgraded from single-store to multi-tenant SaaS, legacy PostgreSQL 
-- tables retained single-column UNIQUE constraints (e.g. daily_sales UNIQUE (sale_date)).
-- This caused Shop B to get "duplicate key value violates unique constraint daily_sales_sale_date_key"
-- when trying to add sales on a date that Shop A had already recorded.
--
-- Solution:
-- Drop all single-tenant unique constraints and replace them with composite unique
-- constraints scoped strictly per tenant: (business_id, ...).
-- ==============================================================================

-- 1. DAILY SALES (Fixes duplicate key on sale_date across shops)
-- ------------------------------------------------------------------------------
-- Drop the legacy single-tenant unique constraint on sale_date
ALTER TABLE public.daily_sales DROP CONSTRAINT IF EXISTS daily_sales_sale_date_key;
ALTER TABLE public.daily_sales DROP CONSTRAINT IF EXISTS daily_sales_business_date_key;
ALTER TABLE public.daily_sales DROP CONSTRAINT IF EXISTS daily_sales_business_id_sale_date_key;

-- Backfill any null business_ids to default store if any exist
UPDATE public.daily_sales 
SET business_id = 'a0000000-0000-0000-0000-000000000001' 
WHERE business_id IS NULL;

-- Make business_id NOT NULL for daily_sales to prevent unassigned sales
ALTER TABLE public.daily_sales ALTER COLUMN business_id SET NOT NULL;

-- Add tenant-scoped composite unique constraint: one record per business per date
ALTER TABLE public.daily_sales 
    ADD CONSTRAINT daily_sales_business_date_key UNIQUE (business_id, sale_date);

CREATE INDEX IF NOT EXISTS idx_daily_sales_business_date 
    ON public.daily_sales(business_id, sale_date);


-- 2. EXPENSE PRICE LIST (Prevents catalog conflicts between different shops)
-- ------------------------------------------------------------------------------
ALTER TABLE public.expense_price_list DROP CONSTRAINT IF EXISTS expense_price_list_item_name_key;
ALTER TABLE public.expense_price_list DROP CONSTRAINT IF EXISTS expense_price_list_business_item_key;
ALTER TABLE public.expense_price_list DROP CONSTRAINT IF EXISTS expense_price_list_business_id_item_name_key;

UPDATE public.expense_price_list 
SET business_id = 'a0000000-0000-0000-0000-000000000001' 
WHERE business_id IS NULL;

ALTER TABLE public.expense_price_list ALTER COLUMN business_id SET NOT NULL;

ALTER TABLE public.expense_price_list 
    ADD CONSTRAINT expense_price_list_business_item_key UNIQUE (business_id, item_name);

CREATE INDEX IF NOT EXISTS idx_expense_price_list_biz_item 
    ON public.expense_price_list(business_id, item_name);


-- 3. MONTHLY EXPENSES (Tenant-isolated monthly fixed commitments)
-- ------------------------------------------------------------------------------
ALTER TABLE public.monthly_expenses DROP CONSTRAINT IF EXISTS monthly_expenses_item_name_key;
ALTER TABLE public.monthly_expenses DROP CONSTRAINT IF EXISTS monthly_expenses_business_item_key;

UPDATE public.monthly_expenses 
SET business_id = 'a0000000-0000-0000-0000-000000000001' 
WHERE business_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_monthly_expenses_biz_cat 
    ON public.monthly_expenses(business_id, category);


-- 4. CATEGORIES & PRODUCTS (POS Catalog Tenant Isolation)
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'categories') THEN
        ALTER TABLE public.categories DROP CONSTRAINT IF EXISTS categories_name_key;
        ALTER TABLE public.categories DROP CONSTRAINT IF EXISTS categories_slug_key;
        ALTER TABLE public.categories DROP CONSTRAINT IF EXISTS categories_business_name_key;
        
        UPDATE public.categories SET business_id = 'a0000000-0000-0000-0000-000000000001' WHERE business_id IS NULL;
        ALTER TABLE public.categories ADD CONSTRAINT categories_business_name_key UNIQUE (business_id, name);
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'products') THEN
        ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_sku_key;
        ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_name_key;
        ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_business_name_key;
        
        UPDATE public.products SET business_id = 'a0000000-0000-0000-0000-000000000001' WHERE business_id IS NULL;
        ALTER TABLE public.products ADD CONSTRAINT products_business_name_key UNIQUE (business_id, name);
    END IF;
END $$;


-- 5. DAILY EXPENSES (Ensure proper index per shop per date)
-- ------------------------------------------------------------------------------
UPDATE public.daily_expenses 
SET business_id = 'a0000000-0000-0000-0000-000000000001' 
WHERE business_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_daily_expenses_biz_date 
    ON public.daily_expenses(business_id, expense_date);


-- 6. SALARY STRUCTURES & ENTRIES (Ensure proper isolation per shop)
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'salary_structures') THEN
        ALTER TABLE public.salary_structures DROP CONSTRAINT IF EXISTS salary_structures_user_key;
        ALTER TABLE public.salary_structures DROP CONSTRAINT IF EXISTS salary_structures_business_user_key;
        
        UPDATE public.salary_structures SET business_id = 'a0000000-0000-0000-0000-000000000001' WHERE business_id IS NULL;
        ALTER TABLE public.salary_structures ADD CONSTRAINT salary_structures_business_user_key UNIQUE (business_id, user_id);
    END IF;
END $$;


-- 7. RE-VERIFY RLS POLICIES FOR TENANT ISOLATION
-- ------------------------------------------------------------------------------
-- Ensure RLS is active on daily_sales so queries with tenant headers / context are isolated
ALTER TABLE public.daily_sales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation_daily_sales" ON public.daily_sales;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.daily_sales;
DROP POLICY IF EXISTS "Allow read for all" ON public.daily_sales;

CREATE POLICY "tenant_isolation_daily_sales" ON public.daily_sales
    FOR ALL
    TO authenticated
    USING (
        business_id = public.get_current_business_id()
        OR public.is_super_admin()
        OR business_id IS NULL
    )
    WITH CHECK (
        business_id = public.get_current_business_id()
        OR public.is_super_admin()
        OR business_id IS NULL
    );

-- ------------------------------------------------------------------------------
-- End of Migration
-- ------------------------------------------------------------------------------
