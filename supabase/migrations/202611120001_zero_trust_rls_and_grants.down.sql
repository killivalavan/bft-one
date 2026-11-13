-- ==============================================================================
-- COUNTERCUB — PHASE 2 ROLLBACK SCRIPT (NON-DESTRUCTIVE)
-- Rollback Migration: 202611120001_zero_trust_rls_and_grants.down.sql
--
-- Safely reverts the Phase 2 RLS policies, triggers, and grants back to the
-- baseline `supabase_security_hardening.sql` v1 state without dropping any
-- tables or customer data columns.
-- ==============================================================================

BEGIN;

-- 1. Remove Phase 2 Governance Triggers
DROP TRIGGER IF EXISTS trg_enforce_business_slug_governance ON public.businesses;
DROP FUNCTION IF EXISTS public.enforce_business_slug_governance();

DROP TRIGGER IF EXISTS trg_enforce_profile_security_invariants ON public.profiles;
DROP FUNCTION IF EXISTS public.enforce_profile_security_invariants();

-- 2. Restore baseline `get_current_business_id()`
CREATE OR REPLACE FUNCTION public.get_current_business_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT business_id
    FROM public.profiles
    WHERE id = auth.uid()
    LIMIT 1;
$$;

-- 3. Drop Phase 2 operation-specific policies and restore baseline `tenant_isolation_<table_name>`
DO $$
DECLARE
    v_pol RECORD;
BEGIN
    FOR v_pol IN
        SELECT schemaname, tablename, policyname
        FROM pg_catalog.pg_policies
        WHERE schemaname = 'public'
    LOOP
        EXECUTE pg_catalog.format(
            'DROP POLICY IF EXISTS %I ON %I.%I',
            v_pol.policyname,
            v_pol.schemaname,
            v_pol.tablename
        );
    END LOOP;
END $$;

CREATE POLICY "businesses_select_authenticated"
    ON public.businesses FOR SELECT TO authenticated
    USING (id = public.get_current_business_id() OR public.is_super_admin());

CREATE POLICY "businesses_manage_super_admin"
    ON public.businesses FOR ALL TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

CREATE POLICY "profiles_select_policy"
    ON public.profiles FOR SELECT TO authenticated
    USING (
        id = auth.uid()
        OR (business_id IS NOT NULL AND business_id = public.get_current_business_id())
        OR public.is_super_admin()
    );

DO $$
DECLARE
    t_name TEXT;
    tenant_tables TEXT[] := ARRAY[
        'categories',
        'products',
        'product_stocks',
        'orders',
        'order_items',
        'daily_sales',
        'pos_stock_idempotency',
        'daily_expenses',
        'expense_price_list',
        'monthly_expenses',
        'invoices',
        'timesheets',
        'leaves',
        'salary_entries',
        'salary_settlements',
        'inventory_items',
        'item_recipes',
        'suppliers',
        'purchase_orders',
        'purchase_order_items',
        'stock_ledger',
        'waste_logs',
        'stock_audits',
        'stock_audit_items',
        'employee_increments',
        'employee_achievements',
        'employee_notices',
        'b2b_clients',
        'b2b_products',
        'b2b_dispatches',
        'b2b_payments',
        'b2b_expenses',
        'external_contacts',
        'notifications',
        'support_tickets',
        'data_import_jobs',
        'data_import_files',
        'data_import_mappings',
        'data_import_staging',
        'data_import_errors',
        'data_import_logs'
    ];
BEGIN
    FOREACH t_name IN ARRAY tenant_tables
    LOOP
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = t_name
              AND column_name = 'business_id'
        ) THEN
            EXECUTE pg_catalog.format(
                'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING ((business_id IS NOT NULL AND business_id = public.get_current_business_id()) OR public.is_super_admin()) WITH CHECK ((business_id IS NOT NULL AND business_id = public.get_current_business_id()) OR public.is_super_admin())',
                'tenant_isolation_' || t_name,
                t_name
            );
        END IF;
    END LOOP;
END $$;

-- 4. Restore table grants for `authenticated`
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;

COMMIT;

