-- Hotfix: Replace invalid `pg_catalog.current_user` with standard SQL `current_user`
-- Fixes error: `missing FROM-clause entry for table "pg_catalog"` when inserting/updating profiles.

BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_profile_security_invariants()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_role TEXT;
BEGIN
    v_role := COALESCE(pg_catalog.current_setting('role', true), '');

    -- Allow trusted backend service_role or database superuser migrations
    IF v_role = 'service_role' OR current_user IN ('postgres', 'supabase_admin') THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        NEW.is_super_admin := false;
        IF NOT public.is_current_tenant_admin() THEN
            RAISE EXCEPTION 'FORBIDDEN: Only Store Administrators can create profiles in their workspace.'
                USING ERRCODE = '42501';
        END IF;
        IF NEW.business_id IS NULL OR NEW.business_id IS DISTINCT FROM public.get_current_business_id() THEN
            RAISE EXCEPTION 'TENANT_ISOLATION_VIOLATION: Cannot create a profile for another business workspace.'
                USING ERRCODE = '42501';
        END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF NEW.is_super_admin IS DISTINCT FROM OLD.is_super_admin THEN
            RAISE EXCEPTION 'PRIVILEGE_ESCALATION_BLOCKED: Cannot modify is_super_admin flag.'
                USING ERRCODE = '42501';
        END IF;

        IF NEW.business_id IS DISTINCT FROM OLD.business_id THEN
            RAISE EXCEPTION 'TENANT_ISOLATION_VIOLATION: Cannot reassign profile business_id.'
                USING ERRCODE = '42501';
        END IF;

        IF NOT public.is_current_tenant_admin() THEN
            IF NEW.is_admin IS DISTINCT FROM OLD.is_admin
               OR NEW.is_stock_manager IS DISTINCT FROM OLD.is_stock_manager
               OR NEW.base_salary_cents IS DISTINCT FROM OLD.base_salary_cents
               OR NEW.joining_salary_cents IS DISTINCT FROM OLD.joining_salary_cents
               OR NEW.increment_amount_cents IS DISTINCT FROM OLD.increment_amount_cents THEN
                RAISE EXCEPTION 'PRIVILEGE_ESCALATION_BLOCKED: Staff cannot modify role flags or salary configuration.'
                    USING ERRCODE = '42501';
            END IF;
        END IF;

        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$;

COMMIT;

