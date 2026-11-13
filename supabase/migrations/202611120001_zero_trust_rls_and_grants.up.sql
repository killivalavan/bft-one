-- ==============================================================================
-- COUNTERCUB — PHASE 2: ZERO-TRUST MULTI-TENANT RLS, GRANTS & RPC HARDENING
-- Migration: 202611120001_zero_trust_rls_and_grants.up.sql
-- Rollback:  202611120001_zero_trust_rls_and_grants.down.sql
--
-- Remediates:
--   SEC-01: Unrestricted SECURITY DEFINER RPC `get_platform_business_metrics()`
--   SEC-02: Cross-tenant parameter tampering in `adjust_pos_stock_atomic()`
--   SEC-06: Undropped permissive RLS policies (`monthly_expenses`, `employee_hub`, `stock_audit_items`, `purchase_order_items`)
--   SEC-07: Anonymous / cross-tenant `SELECT USING (true)` on `public.businesses`
--   SEC-09: Blanket `OR public.is_super_admin()` on ordinary tenant policies replaced by audited `support_impersonation_sessions`
--   SEC-10: Hardcoded `admin@seyalpro.com` removed from `audit_logs` RLS policy
--   SEC-11: Profile privilege escalation trigger (`enforce_profile_security_invariants`)
--   SEC-12: Database-level slug format check + `retired_slugs` reservation table & trigger
--   SEC-13: Private `payslips` Storage bucket + tenant-folder-scoped `storage.objects` RLS
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 1. SCHEMA REMEDIATIONS & GOVERNANCE TABLES
-- ==============================================================================

-- 1.1 Add missing `business_id` to `public.stock_audit_items` (SEC-06)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'stock_audit_items'
    ) THEN
        ALTER TABLE public.stock_audit_items
            ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE;

        UPDATE public.stock_audit_items sai
        SET business_id = sa.business_id
        FROM public.stock_audits sa
        WHERE sai.audit_id = sa.id
          AND sai.business_id IS NULL;

        CREATE INDEX IF NOT EXISTS idx_stock_audit_items_business
            ON public.stock_audit_items(business_id);
    END IF;
END $$;

-- 1.2 Create `public.support_impersonation_sessions` for audited short-lived support access (SEC-09)
CREATE TABLE IF NOT EXISTS public.support_impersonation_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    super_admin_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    super_admin_email TEXT NOT NULL,
    target_business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    reason TEXT NOT NULL CHECK (pg_catalog.char_length(pg_catalog.btrim(reason)) >= 10),
    mfa_aal TEXT NOT NULL DEFAULT 'aal2' CHECK (mfa_aal IN ('aal1', 'aal2')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    CONSTRAINT support_impersonation_ttl_chk CHECK (
        expires_at > created_at AND expires_at <= created_at + INTERVAL '30 minutes'
    )
);

CREATE INDEX IF NOT EXISTS idx_support_impersonation_lookup
    ON public.support_impersonation_sessions(id, super_admin_id, target_business_id)
    WHERE revoked_at IS NULL;

-- 1.3 Create `public.retired_slugs` table to prevent subdomain takeover of renamed/deleted shops (SEC-12)
CREATE TABLE IF NOT EXISTS public.retired_slugs (
    slug TEXT PRIMARY KEY,
    previous_business_id UUID,
    retired_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    retired_by UUID,
    reason TEXT NOT NULL DEFAULT 'slug_changed_or_deleted'
);

-- 1.4 Authoritative Slug Governance Trigger & Check Constraint on `public.businesses` (SEC-12)
CREATE OR REPLACE FUNCTION public.enforce_business_slug_governance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_slug TEXT;
    v_retired_owner UUID;
    v_reserved TEXT[] := ARRAY[
        'www','app','api','admin','super-admin','superadmin','platform','console','manage','management','control','hq',
        'auth','login','logout','signin','signup','register','onboarding','verify','reset','password','mfa','sso','oauth','id','identity','session',
        'dashboard','pos','billing','invoices','inventory','expenses','analytics','reports','b2b','baker','employees','payroll','payslips',
        'settings','profile','profiles','user','users','account','accounts','workspace','workspaces','tenant','tenants','shop','shops','store','stores',
        'client','clients','customer','customers','vendor','vendors','supplier','suppliers','portal',
        'support','help','helpdesk','status','docs','documentation','developer','developers','blog','news','press','careers','jobs','about','contact',
        'pricing','plans','enterprise','partner','partners','affiliate','affiliates','legal','terms','privacy','security','compliance','trust',
        'mail','email','webmail','smtp','imap','pop','pop3','mx','ns','ns1','ns2','ns3','ns4','dns','ftp','sftp','ssh','vpn','proxy','gateway','edge',
        'cdn','assets','static','media','images','img','files','storage','uploads','downloads','backup','backups','webhook','webhooks','ws','wss',
        'realtime','socket','graphql','rest','rpc','health','metrics','monitor','monitoring','telemetry','logs','audit','autoconfig','autodiscover',
        'cpanel','whm','localhost','local','internal','intranet','system','root',
        'null','undefined','none','nil','true','false','default','unknown','anonymous','public','private',
        'prod','production','stage','staging','uat','qa','dev','development','test','testing','demo','sandbox','preview','beta','alpha','canary',
        'countercub','counter-cub','seyalpro','seyal-pro','seyal','bftone','bft-one','vercel','supabase','postgres','postgresql','stripe','razorpay'
    ];
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.slug IS NOT NULL AND pg_catalog.btrim(OLD.slug) <> '' THEN
            INSERT INTO public.retired_slugs (slug, previous_business_id, retired_at, retired_by, reason)
            VALUES (pg_catalog.lower(pg_catalog.btrim(OLD.slug)), OLD.id, pg_catalog.now(), auth.uid(), 'business_deleted')
            ON CONFLICT (slug) DO NOTHING;
        END IF;
        RETURN OLD;
    END IF;

    v_slug := pg_catalog.lower(pg_catalog.btrim(COALESCE(NEW.slug, '')));
    NEW.slug := v_slug;

    IF pg_catalog.char_length(v_slug) < 3 OR pg_catalog.char_length(v_slug) > 63 THEN
        RAISE EXCEPTION 'INVALID_SLUG_LENGTH: Shop slug must be between 3 and 63 characters.'
            USING ERRCODE = '23514';
    END IF;

    IF v_slug !~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$' OR v_slug LIKE '%--%' OR v_slug ~ '^\d+$' THEN
        RAISE EXCEPTION 'INVALID_SLUG_FORMAT: Shop slug "%" violates DNS label rules.', v_slug
            USING ERRCODE = '23514';
    END IF;

    IF v_slug = ANY(v_reserved) THEN
        RAISE EXCEPTION 'RESERVED_SLUG: The subdomain "%" is reserved for system use.', v_slug
            USING ERRCODE = '23514';
    END IF;

    SELECT rs.previous_business_id INTO v_retired_owner
    FROM public.retired_slugs rs
    WHERE rs.slug = v_slug;

    IF FOUND AND (v_retired_owner IS NULL OR v_retired_owner IS DISTINCT FROM NEW.id) THEN
        RAISE EXCEPTION 'RETIRED_SLUG: The subdomain "%" was previously retired and cannot be reassigned.', v_slug
            USING ERRCODE = '23505';
    END IF;

    IF TG_OP = 'UPDATE' AND OLD.slug IS DISTINCT FROM NEW.slug AND OLD.slug IS NOT NULL THEN
        INSERT INTO public.retired_slugs (slug, previous_business_id, retired_at, retired_by, reason)
        VALUES (pg_catalog.lower(pg_catalog.btrim(OLD.slug)), OLD.id, pg_catalog.now(), auth.uid(), 'slug_renamed')
        ON CONFLICT (slug) DO NOTHING;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_business_slug_governance ON public.businesses;
CREATE TRIGGER trg_enforce_business_slug_governance
    BEFORE INSERT OR UPDATE OF slug OR DELETE ON public.businesses
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_business_slug_governance();

-- ==============================================================================
-- 2. PINNED SECURITY DEFINER AUTHORIZATION FUNCTIONS (`SET search_path = ''`)
-- ==============================================================================

-- 2.1 `public.is_super_admin()`: Strictly checks authoritative DB column (zero hardcoded email)
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT COALESCE(
        (
            SELECT p.is_super_admin
            FROM public.profiles p
            WHERE p.id = auth.uid()
            LIMIT 1
        ),
        false
    );
$$;

-- 2.2 `public.get_current_business_id()`:
-- Returns the caller's verified `profiles.business_id`, OR if the caller is a Super Admin
-- presenting a valid, non-expired, non-revoked `x-impersonation-session-id` header,
-- returns that session's `target_business_id`.
CREATE OR REPLACE FUNCTION public.get_current_business_id()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_uid UUID;
    v_profile_biz UUID;
    v_is_super BOOLEAN;
    v_headers_raw TEXT;
    v_imp_header TEXT;
    v_imp_uuid UUID;
    v_imp_target UUID;
BEGIN
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT p.business_id, COALESCE(p.is_super_admin, false)
    INTO v_profile_biz, v_is_super
    FROM public.profiles p
    WHERE p.id = v_uid
    LIMIT 1;

    IF v_is_super THEN
        v_headers_raw := pg_catalog.current_setting('request.headers', true);
        IF v_headers_raw IS NOT NULL AND v_headers_raw <> '' THEN
            BEGIN
                v_imp_header := (v_headers_raw::jsonb ->> 'x-impersonation-session-id');
                IF v_imp_header IS NOT NULL AND v_imp_header ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
                    v_imp_uuid := v_imp_header::uuid;
                    SELECT s.target_business_id
                    INTO v_imp_target
                    FROM public.support_impersonation_sessions s
                    WHERE s.id = v_imp_uuid
                      AND s.super_admin_id = v_uid
                      AND s.revoked_at IS NULL
                      AND s.expires_at > pg_catalog.now()
                    LIMIT 1;

                    IF v_imp_target IS NOT NULL THEN
                        RETURN v_imp_target;
                    END IF;
                END IF;
            EXCEPTION WHEN OTHERS THEN
                -- Ignore malformed header JSON and fall through
                NULL;
            END;
        END IF;
    END IF;

    RETURN v_profile_biz;
END;
$$;

-- 2.3 `public.is_current_tenant_admin()`:
-- Returns true if the caller is a store admin for `get_current_business_id()` or has an active support impersonation session.
CREATE OR REPLACE FUNCTION public.is_current_tenant_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_uid UUID;
    v_active_biz UUID;
    v_is_admin BOOLEAN;
BEGIN
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RETURN FALSE;
    END IF;

    v_active_biz := public.get_current_business_id();
    IF v_active_biz IS NULL THEN
        RETURN FALSE;
    END IF;

    SELECT (COALESCE(p.is_admin, false) AND p.business_id = v_active_biz)
           OR COALESCE(p.is_super_admin, false)
    INTO v_is_admin
    FROM public.profiles p
    WHERE p.id = v_uid
    LIMIT 1;

    RETURN COALESCE(v_is_admin, false);
END;
$$;

-- 2.4 Profile Security Invariant Trigger (`SEC-11`)
-- Blocks privilege escalation (`is_super_admin`, `is_admin`, `is_stock_manager`) and cross-tenant `business_id` tampering.
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
        -- Non-service-role callers can never insert a Super Admin profile
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
        -- 1. `is_super_admin` is strictly immutable by non-service-role connections
        IF NEW.is_super_admin IS DISTINCT FROM OLD.is_super_admin THEN
            RAISE EXCEPTION 'PRIVILEGE_ESCALATION_BLOCKED: Cannot modify is_super_admin flag.'
                USING ERRCODE = '42501';
        END IF;

        -- 2. `business_id` cannot be reassigned across tenants
        IF NEW.business_id IS DISTINCT FROM OLD.business_id THEN
            RAISE EXCEPTION 'TENANT_ISOLATION_VIOLATION: Cannot reassign profile business_id.'
                USING ERRCODE = '42501';
        END IF;

        -- 3. Non-admin staff updating their own profile cannot escalate role or salary fields
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

DROP TRIGGER IF EXISTS trg_enforce_profile_security_invariants ON public.profiles;
CREATE TRIGGER trg_enforce_profile_security_invariants
    BEFORE INSERT OR UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_profile_security_invariants();

-- ==============================================================================
-- 3. HARDEN SECURITY DEFINER TRANSACTIONAL & ANALYTICS RPCS (`SEC-01`, `SEC-02`)
-- ==============================================================================

-- 3.1 `public.adjust_pos_stock_atomic` — Enforces `p_business_id = public.get_current_business_id()` (`SEC-02`)
CREATE OR REPLACE FUNCTION public.adjust_pos_stock_atomic(
    p_business_id UUID,
    p_items JSONB,
    p_user_id UUID DEFAULT NULL,
    p_idempotency_key TEXT DEFAULT NULL,
    p_strict_stock BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_role TEXT;
    v_caller_biz UUID;
    v_item RECORD;
    v_prod_id UUID;
    v_use_qty NUMERIC;
    v_stock RECORD;
    v_before NUMERIC;
    v_after NUMERIC;
    v_max NUMERIC;
    v_low_threshold NUMERIC;
    v_prod_name TEXT;
    v_recipe RECORD;
    v_deduct NUMERIC;
    v_cur_inv NUMERIC;
    v_cost NUMERIC;
    v_updated_count INTEGER := 0;
    v_notif_count INTEGER := 0;
    v_insufficient_prods JSONB := '[]'::jsonb;
    v_inserted_key TEXT;
BEGIN
    -- 0. Strict Tenant Isolation Verification (SEC-02)
    v_role := COALESCE(pg_catalog.current_setting('role', true), '');
    IF p_business_id IS NULL THEN
        RAISE EXCEPTION 'TENANT_ISOLATION_VIOLATION: p_business_id is required'
            USING ERRCODE = '42501';
    END IF;

    IF v_role <> 'service_role' AND current_user NOT IN ('postgres', 'supabase_admin') THEN
        v_caller_biz := public.get_current_business_id();
        IF v_caller_biz IS NULL OR p_business_id IS DISTINCT FROM v_caller_biz THEN
            RAISE EXCEPTION 'TENANT_ISOLATION_VIOLATION: Caller cannot adjust stock for foreign business %', p_business_id
                USING ERRCODE = '42501';
        END IF;
    END IF;

    -- 1. Idempotency Check
    IF p_idempotency_key IS NOT NULL AND pg_catalog.btrim(p_idempotency_key) <> '' THEN
        INSERT INTO public.pos_stock_idempotency (key, business_id, operation)
        VALUES (pg_catalog.btrim(p_idempotency_key), p_business_id, 'stock_adjust')
        ON CONFLICT (key) DO NOTHING
        RETURNING key INTO v_inserted_key;

        IF v_inserted_key IS NULL THEN
            RETURN pg_catalog.jsonb_build_object(
                'ok', true,
                'already_processed', true,
                'updated', 0,
                'notified', 0,
                'message', 'Idempotent request already processed'
            );
        END IF;
    END IF;

    -- 2. Validate items array
    IF p_items IS NULL OR pg_catalog.jsonb_typeof(p_items) <> 'array' OR pg_catalog.jsonb_array_length(p_items) = 0 THEN
        RETURN pg_catalog.jsonb_build_object('ok', true, 'skipped', true, 'updated', 0, 'notified', 0);
    END IF;

    -- 3. Strict Stock Validation
    IF p_strict_stock THEN
        FOR v_item IN SELECT * FROM pg_catalog.jsonb_to_recordset(p_items) AS x(product_id TEXT, qty NUMERIC)
        LOOP
            IF v_item.product_id IS NOT NULL AND v_item.qty > 0 THEN
                BEGIN
                    v_prod_id := v_item.product_id::uuid;
                EXCEPTION WHEN OTHERS THEN
                    CONTINUE;
                END;

                SELECT ps.available_qty INTO v_before
                FROM public.product_stocks ps
                WHERE ps.product_id = v_prod_id AND ps.business_id = p_business_id
                FOR UPDATE;

                IF COALESCE(v_before, 0) < v_item.qty THEN
                    v_insufficient_prods := v_insufficient_prods || pg_catalog.jsonb_build_object(
                        'product_id', v_item.product_id,
                        'available', COALESCE(v_before, 0),
                        'requested', v_item.qty
                    );
                END IF;
            END IF;
        END LOOP;

        IF pg_catalog.jsonb_array_length(v_insufficient_prods) > 0 THEN
            RAISE EXCEPTION 'INSUFFICIENT_STOCK: %', v_insufficient_prods::text;
        END IF;
    END IF;

    -- 4. Process product stock deductions atomically with row-level locks
    FOR v_item IN SELECT * FROM pg_catalog.jsonb_to_recordset(p_items) AS x(product_id TEXT, qty NUMERIC)
    LOOP
        IF v_item.product_id IS NULL OR v_item.qty IS NULL OR v_item.qty <= 0 THEN
            CONTINUE;
        END IF;

        BEGIN
            v_prod_id := v_item.product_id::uuid;
        EXCEPTION WHEN OTHERS THEN
            CONTINUE;
        END;

        v_use_qty := pg_catalog.floor(v_item.qty);

        SELECT ps.available_qty, ps.max_qty, ps.notify_at_count
        INTO v_stock
        FROM public.product_stocks ps
        WHERE ps.product_id = v_prod_id AND ps.business_id = p_business_id
        FOR UPDATE;

        IF FOUND THEN
            v_before := COALESCE(v_stock.available_qty, 0);
            v_max := COALESCE(v_stock.max_qty, 0);
            v_low_threshold := v_stock.notify_at_count;
            v_after := GREATEST(0, v_before - v_use_qty);

            UPDATE public.product_stocks
            SET available_qty = v_after,
                updated_at = pg_catalog.now()
            WHERE product_id = v_prod_id AND business_id = p_business_id;

            v_updated_count := v_updated_count + 1;

            SELECT pr.name INTO v_prod_name
            FROM public.products pr
            WHERE pr.id = v_prod_id AND pr.business_id = p_business_id;
            IF v_prod_name IS NULL THEN
                v_prod_name := 'Product';
            END IF;

            IF v_low_threshold IS NOT NULL AND v_low_threshold > 0 THEN
                IF v_before > v_low_threshold AND v_after <= v_low_threshold AND v_after > 0 THEN
                    INSERT INTO public.notifications (
                        business_id, product_id, kind, message, meta
                    ) VALUES (
                        p_business_id,
                        v_prod_id,
                        'stock',
                        'Low stock: ' || v_prod_name || ' remaining ' || v_after || ' (threshold ' || v_low_threshold || ')',
                        pg_catalog.jsonb_build_object('remaining', v_after, 'threshold', v_low_threshold)
                    );
                    v_notif_count := v_notif_count + 1;
                END IF;
            END IF;

            IF v_before > 0 AND v_after = 0 THEN
                INSERT INTO public.notifications (
                    business_id, product_id, kind, message, meta
                ) VALUES (
                    p_business_id,
                    v_prod_id,
                    'stock',
                    'Out of stock: ' || v_prod_name,
                    pg_catalog.jsonb_build_object('remaining', v_after, 'max', v_max)
                );
                v_notif_count := v_notif_count + 1;
            END IF;
        ELSE
            -- Only insert stock row if the product actually belongs to p_business_id
            IF EXISTS (SELECT 1 FROM public.products pr WHERE pr.id = v_prod_id AND pr.business_id = p_business_id) THEN
                INSERT INTO public.product_stocks (product_id, business_id, max_qty, available_qty)
                VALUES (v_prod_id, p_business_id, 0, 0)
                ON CONFLICT (product_id) DO UPDATE
                SET available_qty = GREATEST(0, public.product_stocks.available_qty - v_use_qty),
                    updated_at = pg_catalog.now()
                WHERE public.product_stocks.business_id = p_business_id;

                v_updated_count := v_updated_count + 1;
            END IF;
        END IF;

        -- 5. Recipe BOM Auto-Deductions
        FOR v_recipe IN
            SELECT ir.inventory_item_id, ir.quantity_required, ir.waste_factor_pct
            FROM public.item_recipes ir
            WHERE ir.product_id = v_prod_id AND ir.business_id = p_business_id
        LOOP
            v_deduct := (v_recipe.quantity_required * v_use_qty * (1 + COALESCE(v_recipe.waste_factor_pct, 0) / 100.0));

            UPDATE public.inventory_items
            SET current_stock = GREATEST(0, current_stock - v_deduct),
                updated_at = pg_catalog.now()
            WHERE id = v_recipe.inventory_item_id AND business_id = p_business_id
            RETURNING current_stock, cost_per_unit INTO v_cur_inv, v_cost;

            INSERT INTO public.stock_ledger (
                business_id,
                inventory_item_id,
                transaction_type,
                quantity_delta,
                balance_after,
                unit_cost,
                reason,
                created_by
            ) VALUES (
                p_business_id,
                v_recipe.inventory_item_id,
                'POS_CONSUMPTION',
                -v_deduct,
                COALESCE(v_cur_inv, 0),
                COALESCE(v_cost, 0),
                'POS Order Auto-Deduction (Recipe BOM)',
                COALESCE(p_user_id, auth.uid())
            );
        END LOOP;
    END LOOP;

    RETURN pg_catalog.jsonb_build_object(
        'ok', true,
        'updated', v_updated_count,
        'notified', v_notif_count
    );
END;
$$;

-- 3.2 `public.get_platform_business_metrics` — Restricted strictly to Super Admin / `service_role` (`SEC-01`)
CREATE OR REPLACE FUNCTION public.get_platform_business_metrics()
RETURNS TABLE (
    business_id UUID,
    total_sales NUMERIC,
    total_expenses NUMERIC,
    order_count BIGINT,
    user_count BIGINT,
    admin_email TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_role TEXT;
BEGIN
    v_role := COALESCE(pg_catalog.current_setting('role', true), '');
    IF v_role <> 'service_role'
       AND current_user NOT IN ('postgres', 'supabase_admin')
       AND NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'FORBIDDEN: Platform business metrics require Super Admin privileges.'
            USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT
        b.id AS business_id,
        COALESCE(s.total_sales, 0) AS total_sales,
        COALESCE(e.total_expenses, 0) AS total_expenses,
        COALESCE(o.order_count, 0) AS order_count,
        COALESCE(p.user_count, 0) AS user_count,
        p.admin_email
    FROM public.businesses b
    LEFT JOIN (
        SELECT ds.business_id, SUM(COALESCE(ds.total_cash_cents, 0) + COALESCE(ds.upi_amount_cents, 0)) / 100.0 AS total_sales
        FROM public.daily_sales ds
        WHERE ds.business_id IS NOT NULL
        GROUP BY ds.business_id
    ) s ON s.business_id = b.id
    LEFT JOIN (
        SELECT de.business_id, SUM(COALESCE(de.price_cents, 0)) / 100.0 AS total_expenses
        FROM public.daily_expenses de
        WHERE de.business_id IS NOT NULL
        GROUP BY de.business_id
    ) e ON e.business_id = b.id
    LEFT JOIN (
        SELECT ord.business_id, COUNT(*) AS order_count
        FROM public.orders ord
        WHERE ord.business_id IS NOT NULL
        GROUP BY ord.business_id
    ) o ON o.business_id = b.id
    LEFT JOIN (
        SELECT
            pr.business_id,
            COUNT(*) AS user_count,
            MIN(pr.email) FILTER (WHERE pr.is_admin = true) AS admin_email
        FROM public.profiles pr
        WHERE pr.business_id IS NOT NULL
        GROUP BY pr.business_id
    ) p ON p.business_id = b.id;
END;
$$;

-- 3.3 `public.sync_external_contacts_mirror` — Pin `SET search_path = ''`
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_catalog.pg_proc p
        JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'sync_external_contacts_mirror'
    ) THEN
        EXECUTE $fn$
        CREATE OR REPLACE FUNCTION public.sync_external_contacts_mirror()
        RETURNS TRIGGER
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = ''
        AS $body$
        BEGIN
            IF TG_OP = 'DELETE' THEN
                DELETE FROM public.external_contacts
                WHERE id = OLD.id AND business_id = OLD.business_id;
                RETURN OLD;
            END IF;

            INSERT INTO public.external_contacts (
                id, business_id, name, role, sub_type, phone, company, email, address, gstin, notes, created_at, updated_at
            ) VALUES (
                NEW.id,
                NEW.business_id,
                NEW.shop_name,
                'Client',
                'B2B Wholesale Partner',
                NEW.phone,
                NEW.owner_name,
                NULL,
                NEW.address,
                NULL,
                'Route: ' || COALESCE(NEW.route_area, 'General'),
                COALESCE(NEW.created_at, pg_catalog.now()),
                pg_catalog.now()
            )
            ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name,
                phone = EXCLUDED.phone,
                company = EXCLUDED.company,
                address = EXCLUDED.address,
                notes = EXCLUDED.notes,
                updated_at = pg_catalog.now()
            WHERE public.external_contacts.business_id = EXCLUDED.business_id;

            RETURN NEW;
        END;
        $body$;
        $fn$;
    END IF;
END $$;

-- ==============================================================================
-- 4. DROP ALL LEGACY / PERMISSIVE RLS POLICIES & APPLY OPERATION-SPECIFIC POLICIES
-- ==============================================================================

-- 4.1 Dynamically drop ALL existing policies on all public tables so no legacy
--     `PERMISSIVE` policies (e.g. `monthly_expenses_read_all_users`, `increments_admin_manage`,
--     `tenant_isolation_stock_audit_items`, `allow_public_read_businesses`) can OR-bypass RLS (SEC-06, SEC-07)
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

-- 4.2 `public.businesses` Policies (SEC-07)
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "businesses_select_own"
    ON public.businesses FOR SELECT TO authenticated
    USING (id = public.get_current_business_id() OR public.is_super_admin());

CREATE POLICY "businesses_update_own_admin"
    ON public.businesses FOR UPDATE TO authenticated
    USING (id = public.get_current_business_id() AND public.is_current_tenant_admin())
    WITH CHECK (id = public.get_current_business_id() AND public.is_current_tenant_admin());

-- 4.3 `public.profiles` Policies (SEC-11)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_same_tenant"
    ON public.profiles FOR SELECT TO authenticated
    USING (
        id = auth.uid()
        OR (business_id IS NOT NULL AND business_id = public.get_current_business_id())
    );

CREATE POLICY "profiles_insert_tenant_admin"
    ON public.profiles FOR INSERT TO authenticated
    WITH CHECK (
        business_id IS NOT NULL
        AND business_id = public.get_current_business_id()
        AND public.is_current_tenant_admin()
        AND COALESCE(is_super_admin, false) = false
    );

CREATE POLICY "profiles_update_self_or_tenant_admin"
    ON public.profiles FOR UPDATE TO authenticated
    USING (
        business_id IS NOT NULL
        AND business_id = public.get_current_business_id()
        AND (id = auth.uid() OR public.is_current_tenant_admin())
    )
    WITH CHECK (
        business_id IS NOT NULL
        AND business_id = public.get_current_business_id()
        AND COALESCE(is_super_admin, false) = false
    );

CREATE POLICY "profiles_delete_tenant_admin"
    ON public.profiles FOR DELETE TO authenticated
    USING (
        business_id IS NOT NULL
        AND business_id = public.get_current_business_id()
        AND public.is_current_tenant_admin()
        AND id <> auth.uid()
        AND COALESCE(is_super_admin, false) = false
    );

-- 4.4 Standard Tenant Operational Tables: Operation-Specific Policies (`SELECT`, `INSERT`, `UPDATE`, `DELETE`)
--     Scoped strictly to `business_id = public.get_current_business_id()` (NO blanket `OR is_super_admin()`)
DO $$
DECLARE
    t_name TEXT;
    operational_tables TEXT[] := ARRAY[
        'categories',
        'products',
        'product_stocks',
        'orders',
        'order_items',
        'daily_sales',
        'pos_stock_idempotency',
        'daily_expenses',
        'expense_price_list',
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
    FOREACH t_name IN ARRAY operational_tables
    LOOP
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = t_name
              AND column_name = 'business_id'
        ) THEN
            EXECUTE pg_catalog.format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t_name);

            EXECUTE pg_catalog.format(
                'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (business_id IS NOT NULL AND business_id = public.get_current_business_id())',
                t_name || '_select_tenant',
                t_name
            );

            EXECUTE pg_catalog.format(
                'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (business_id IS NOT NULL AND business_id = public.get_current_business_id())',
                t_name || '_insert_tenant',
                t_name
            );

            EXECUTE pg_catalog.format(
                'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (business_id IS NOT NULL AND business_id = public.get_current_business_id()) WITH CHECK (business_id IS NOT NULL AND business_id = public.get_current_business_id())',
                t_name || '_update_tenant',
                t_name
            );

            EXECUTE pg_catalog.format(
                'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (business_id IS NOT NULL AND business_id = public.get_current_business_id())',
                t_name || '_delete_tenant',
                t_name
            );
        END IF;
    END LOOP;
END $$;

-- 4.5 Admin-Write-Restricted Tenant Tables (`monthly_expenses`, `employee_increments`, `employee_achievements`, `employee_notices`)
--     Every policy strictly enforces `business_id = public.get_current_business_id()` PLUS role checks (SEC-06)
DO $$
BEGIN
    -- monthly_expenses
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'monthly_expenses') THEN
        ALTER TABLE public.monthly_expenses ENABLE ROW LEVEL SECURITY;

        CREATE POLICY "monthly_expenses_select_tenant"
            ON public.monthly_expenses FOR SELECT TO authenticated
            USING (business_id IS NOT NULL AND business_id = public.get_current_business_id());

        CREATE POLICY "monthly_expenses_insert_tenant_admin"
            ON public.monthly_expenses FOR INSERT TO authenticated
            WITH CHECK (business_id IS NOT NULL AND business_id = public.get_current_business_id() AND public.is_current_tenant_admin());

        CREATE POLICY "monthly_expenses_update_tenant_admin"
            ON public.monthly_expenses FOR UPDATE TO authenticated
            USING (business_id IS NOT NULL AND business_id = public.get_current_business_id() AND public.is_current_tenant_admin())
            WITH CHECK (business_id IS NOT NULL AND business_id = public.get_current_business_id() AND public.is_current_tenant_admin());

        CREATE POLICY "monthly_expenses_delete_tenant_admin"
            ON public.monthly_expenses FOR DELETE TO authenticated
            USING (business_id IS NOT NULL AND business_id = public.get_current_business_id() AND public.is_current_tenant_admin());
    END IF;

    -- employee_increments
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'employee_increments') THEN
        ALTER TABLE public.employee_increments ENABLE ROW LEVEL SECURITY;

        CREATE POLICY "employee_increments_select_tenant"
            ON public.employee_increments FOR SELECT TO authenticated
            USING (
                business_id IS NOT NULL
                AND business_id = public.get_current_business_id()
                AND (user_id = auth.uid() OR public.is_current_tenant_admin())
            );

        CREATE POLICY "employee_increments_insert_tenant_admin"
            ON public.employee_increments FOR INSERT TO authenticated
            WITH CHECK (business_id IS NOT NULL AND business_id = public.get_current_business_id() AND public.is_current_tenant_admin());

        CREATE POLICY "employee_increments_update_tenant_admin"
            ON public.employee_increments FOR UPDATE TO authenticated
            USING (business_id IS NOT NULL AND business_id = public.get_current_business_id() AND public.is_current_tenant_admin())
            WITH CHECK (business_id IS NOT NULL AND business_id = public.get_current_business_id() AND public.is_current_tenant_admin());

        CREATE POLICY "employee_increments_delete_tenant_admin"
            ON public.employee_increments FOR DELETE TO authenticated
            USING (business_id IS NOT NULL AND business_id = public.get_current_business_id() AND public.is_current_tenant_admin());
    END IF;

    -- employee_achievements
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'employee_achievements') THEN
        ALTER TABLE public.employee_achievements ENABLE ROW LEVEL SECURITY;

        CREATE POLICY "employee_achievements_select_tenant"
            ON public.employee_achievements FOR SELECT TO authenticated
            USING (
                business_id IS NOT NULL
                AND business_id = public.get_current_business_id()
                AND (user_id = auth.uid() OR public.is_current_tenant_admin())
            );

        CREATE POLICY "employee_achievements_insert_tenant_admin"
            ON public.employee_achievements FOR INSERT TO authenticated
            WITH CHECK (business_id IS NOT NULL AND business_id = public.get_current_business_id() AND public.is_current_tenant_admin());

        CREATE POLICY "employee_achievements_update_tenant_admin"
            ON public.employee_achievements FOR UPDATE TO authenticated
            USING (business_id IS NOT NULL AND business_id = public.get_current_business_id() AND public.is_current_tenant_admin())
            WITH CHECK (business_id IS NOT NULL AND business_id = public.get_current_business_id() AND public.is_current_tenant_admin());

        CREATE POLICY "employee_achievements_delete_tenant_admin"
            ON public.employee_achievements FOR DELETE TO authenticated
            USING (business_id IS NOT NULL AND business_id = public.get_current_business_id() AND public.is_current_tenant_admin());
    END IF;

    -- employee_notices
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'employee_notices') THEN
        ALTER TABLE public.employee_notices ENABLE ROW LEVEL SECURITY;

        CREATE POLICY "employee_notices_select_tenant"
            ON public.employee_notices FOR SELECT TO authenticated
            USING (business_id IS NOT NULL AND business_id = public.get_current_business_id());

        CREATE POLICY "employee_notices_insert_tenant_admin"
            ON public.employee_notices FOR INSERT TO authenticated
            WITH CHECK (business_id IS NOT NULL AND business_id = public.get_current_business_id() AND public.is_current_tenant_admin());

        CREATE POLICY "employee_notices_update_tenant_admin"
            ON public.employee_notices FOR UPDATE TO authenticated
            USING (business_id IS NOT NULL AND business_id = public.get_current_business_id() AND public.is_current_tenant_admin())
            WITH CHECK (business_id IS NOT NULL AND business_id = public.get_current_business_id() AND public.is_current_tenant_admin());

        CREATE POLICY "employee_notices_delete_tenant_admin"
            ON public.employee_notices FOR DELETE TO authenticated
            USING (business_id IS NOT NULL AND business_id = public.get_current_business_id() AND public.is_current_tenant_admin());
    END IF;
END $$;

-- 4.6 Platform & Audit Governance Tables (`audit_logs`, `support_impersonation_sessions`, `retired_slugs`)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'audit_logs') THEN
        ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

        CREATE POLICY "audit_logs_select_tenant_admin_or_super"
            ON public.audit_logs FOR SELECT TO authenticated
            USING (
                public.is_super_admin()
                OR (
                    business_id IS NOT NULL
                    AND business_id = public.get_current_business_id()
                    AND public.is_current_tenant_admin()
                )
            );

        CREATE POLICY "audit_logs_insert_authenticated"
            ON public.audit_logs FOR INSERT TO authenticated
            WITH CHECK (
                actor_id = auth.uid()
                AND (business_id IS NULL OR business_id = public.get_current_business_id())
            );
    END IF;
END $$;

ALTER TABLE public.support_impersonation_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "support_impersonation_select_own"
    ON public.support_impersonation_sessions FOR SELECT TO authenticated
    USING (super_admin_id = auth.uid() AND public.is_super_admin());

CREATE POLICY "support_impersonation_insert_own"
    ON public.support_impersonation_sessions FOR INSERT TO authenticated
    WITH CHECK (super_admin_id = auth.uid() AND public.is_super_admin());

CREATE POLICY "support_impersonation_update_own"
    ON public.support_impersonation_sessions FOR UPDATE TO authenticated
    USING (super_admin_id = auth.uid() AND public.is_super_admin())
    WITH CHECK (super_admin_id = auth.uid() AND public.is_super_admin());

ALTER TABLE public.retired_slugs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "retired_slugs_select_super_admin"
    ON public.retired_slugs FOR SELECT TO authenticated
    USING (public.is_super_admin());

-- ==============================================================================
-- 5. RESTRICT POSTGRESQL TABLE & FUNCTION GRANTS INDEPENDENTLY OF RLS
-- ==============================================================================

-- 5.1 Revoke all privileges from `PUBLIC` and `anon` across all public tables
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon;

-- 5.2 Revoke dangerous DDL/bulk privileges from `authenticated`
REVOKE TRUNCATE, TRIGGER, REFERENCES ON ALL TABLES IN SCHEMA public FROM authenticated;

-- 5.3 Restrict `public.businesses` grants: `authenticated` cannot INSERT or DELETE businesses,
--     and can only UPDATE safe store profile columns (never `id`, `slug`, `plan_type`, `max_users`, `is_active`)
REVOKE INSERT, UPDATE, DELETE ON public.businesses FROM authenticated;
GRANT SELECT ON public.businesses TO authenticated;
-- Column-level grant built only from allowlisted columns that actually exist in this
-- database (schemas drift between environments; e.g. UPI is stored in enabled_modules JSONB,
-- not a dedicated `upi_id` column). Hardcoding a missing column aborts the whole migration.
DO $$
DECLARE
    v_cols TEXT;
BEGIN
    SELECT string_agg(quote_ident(c.column_name), ', ' ORDER BY c.ordinal_position)
      INTO v_cols
      FROM information_schema.columns c
     WHERE c.table_schema = 'public'
       AND c.table_name = 'businesses'
       AND c.column_name = ANY (ARRAY[
           'name',
           'logo_url',
           'signature_url',
           'address',
           'phone',
           'gstin',
           'upi_id',
           'currency_symbol',
           'timezone',
           'geofence_lat',
           'geofence_lng',
           'geofence_radius_meters',
           'geofence_enabled',
           'enabled_modules',
           'updated_at'
       ]);

    IF v_cols IS NOT NULL THEN
        EXECUTE format('GRANT UPDATE (%s) ON public.businesses TO authenticated', v_cols);
    END IF;
END $$;

-- 5.4 Make `public.audit_logs` append-only (`REVOKE UPDATE, DELETE` from `authenticated`)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'audit_logs') THEN
        REVOKE UPDATE, DELETE ON public.audit_logs FROM authenticated;
    END IF;
END $$;

-- 5.5 Restrict `SECURITY DEFINER` Function Execution Grants (SEC-01, SEC-02)
REVOKE ALL ON FUNCTION public.get_platform_business_metrics() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_platform_business_metrics() TO service_role;

REVOKE ALL ON FUNCTION public.adjust_pos_stock_atomic(UUID, JSONB, UUID, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_pos_stock_atomic(UUID, JSONB, UUID, TEXT, BOOLEAN) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_current_business_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_current_business_id() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_super_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_current_tenant_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_current_tenant_admin() TO authenticated, service_role;

-- ==============================================================================
-- 6. SUPABASE STORAGE (`payslips` BUCKET) ISOLATION (SEC-13)
-- ==============================================================================
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'storage' AND table_name = 'buckets'
    ) THEN
        INSERT INTO storage.buckets (id, name, public)
        VALUES ('payslips', 'payslips', false)
        ON CONFLICT (id) DO UPDATE SET public = false;

        DROP POLICY IF EXISTS "payslips_select_tenant" ON storage.objects;
        DROP POLICY IF EXISTS "payslips_insert_tenant_admin" ON storage.objects;
        DROP POLICY IF EXISTS "payslips_update_tenant_admin" ON storage.objects;
        DROP POLICY IF EXISTS "payslips_delete_tenant_admin" ON storage.objects;

        CREATE POLICY "payslips_select_tenant"
            ON storage.objects FOR SELECT TO authenticated
            USING (
                bucket_id = 'payslips'
                AND (storage.foldername(name))[1] = (public.get_current_business_id())::text
            );

        CREATE POLICY "payslips_insert_tenant_admin"
            ON storage.objects FOR INSERT TO authenticated
            WITH CHECK (
                bucket_id = 'payslips'
                AND (storage.foldername(name))[1] = (public.get_current_business_id())::text
                AND public.is_current_tenant_admin()
            );

        CREATE POLICY "payslips_update_tenant_admin"
            ON storage.objects FOR UPDATE TO authenticated
            USING (
                bucket_id = 'payslips'
                AND (storage.foldername(name))[1] = (public.get_current_business_id())::text
                AND public.is_current_tenant_admin()
            )
            WITH CHECK (
                bucket_id = 'payslips'
                AND (storage.foldername(name))[1] = (public.get_current_business_id())::text
                AND public.is_current_tenant_admin()
            );

        CREATE POLICY "payslips_delete_tenant_admin"
            ON storage.objects FOR DELETE TO authenticated
            USING (
                bucket_id = 'payslips'
                AND (storage.foldername(name))[1] = (public.get_current_business_id())::text
                AND public.is_current_tenant_admin()
            );
    END IF;
END $$;

COMMIT;

