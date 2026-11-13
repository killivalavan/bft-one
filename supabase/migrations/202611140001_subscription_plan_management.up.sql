-- ==============================================================================
-- COUNTERCUB — ENTERPRISE SUBSCRIPTION & PLAN MANAGEMENT
-- Migration: 202611140001_subscription_plan_management.up.sql
-- Rollback:  202611140001_subscription_plan_management.down.sql
--
-- Additive migration introducing:
--   1. public.subscription_plans (configurable global plans)
--   2. public.tenant_subscriptions (per-business subscription & entitlement snapshots)
--   3. public.subscription_events (append-only administrative audit history)
--   4. public.subscription_requests (Store Admin renewal / upgrade requests)
--   5. Zero-trust RLS policies & grants
--   6. Atomic SECURITY DEFINER enforcement functions & concurrency-safe triggers
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 1. TABLES
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.subscription_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_key TEXT NOT NULL UNIQUE,
    plan_name TEXT NOT NULL,
    monthly_price NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (monthly_price >= 0),
    currency TEXT NOT NULL DEFAULT 'INR',
    max_active_products INTEGER NULL CHECK (max_active_products IS NULL OR max_active_products >= 0),
    max_employee_seats INTEGER NOT NULL DEFAULT 0 CHECK (max_employee_seats >= 0),
    support_level TEXT NOT NULL DEFAULT 'standard' CHECK (support_level IN ('standard', 'priority')),
    feature_entitlements JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT true,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
);

CREATE TABLE IF NOT EXISTS public.tenant_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES public.subscription_plans(id) ON DELETE RESTRICT,
    plan_key_snapshot TEXT NOT NULL,
    plan_name_snapshot TEXT NOT NULL,
    subscription_status TEXT NOT NULL DEFAULT 'active'
        CHECK (subscription_status IN ('active', 'pending', 'suspended', 'expired')),
    start_date TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    expiry_date TIMESTAMPTZ NULL,
    billing_duration_months INTEGER NULL CHECK (billing_duration_months IS NULL OR billing_duration_months > 0),
    price_snapshot NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (price_snapshot >= 0),
    product_limit_snapshot INTEGER NULL CHECK (product_limit_snapshot IS NULL OR product_limit_snapshot >= 0),
    employee_limit_snapshot INTEGER NOT NULL DEFAULT 0 CHECK (employee_limit_snapshot >= 0),
    support_level_snapshot TEXT NOT NULL DEFAULT 'standard' CHECK (support_level_snapshot IN ('standard', 'priority')),
    custom_limit_overrides JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_current BOOLEAN NOT NULL DEFAULT true,
    created_by UUID NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_subscriptions_current_biz
    ON public.tenant_subscriptions(business_id)
    WHERE is_current = true;

CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_business
    ON public.tenant_subscriptions(business_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.subscription_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    subscription_id UUID NULL REFERENCES public.tenant_subscriptions(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,
    previous_values JSONB NOT NULL DEFAULT '{}'::jsonb,
    new_values JSONB NOT NULL DEFAULT '{}'::jsonb,
    admin_id UUID NULL,
    admin_email TEXT NULL,
    reason TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
);

CREATE INDEX IF NOT EXISTS idx_subscription_events_business
    ON public.subscription_events(business_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.subscription_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    current_subscription_id UUID NULL REFERENCES public.tenant_subscriptions(id) ON DELETE SET NULL,
    current_plan_key TEXT NOT NULL DEFAULT 'free',
    requested_plan_id UUID NOT NULL REFERENCES public.subscription_plans(id) ON DELETE RESTRICT,
    requested_duration_months INTEGER NOT NULL CHECK (requested_duration_months IN (1, 3, 6, 12)),
    current_expiry_date TIMESTAMPTZ NULL,
    request_note TEXT NULL,
    request_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (request_status IN ('pending', 'approved', 'rejected')),
    admin_note TEXT NULL,
    reviewed_by UUID NULL,
    reviewed_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
);

CREATE INDEX IF NOT EXISTS idx_subscription_requests_business
    ON public.subscription_requests(business_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_subscription_requests_status
    ON public.subscription_requests(request_status, created_at DESC);

-- ==============================================================================
-- 2. SEED INITIAL 4 SUBSCRIPTION PLANS
-- ==============================================================================

INSERT INTO public.subscription_plans (
    plan_key, plan_name, monthly_price, currency,
    max_active_products, max_employee_seats, support_level,
    feature_entitlements, is_active, sort_order
) VALUES
(
    'free', 'Free', 0.00, 'INR',
    5, 0, 'standard',
    '{"store_admin_logins": 1, "historical_sales_unlimited": true}'::jsonb,
    true, 1
),
(
    'basic', 'Basic', 199.00, 'INR',
    20, 5, 'standard',
    '{"store_admin_logins": 1, "historical_sales_unlimited": true}'::jsonb,
    true, 2
),
(
    'pro', 'Pro', 299.00, 'INR',
    250, 25, 'standard',
    '{"store_admin_logins": 1, "historical_sales_unlimited": true}'::jsonb,
    true, 3
),
(
    'business', 'Business', 499.00, 'INR',
    NULL, 50, 'priority',
    '{"store_admin_logins": 1, "historical_sales_unlimited": true, "priority_support": true}'::jsonb,
    true, 4
)
ON CONFLICT (plan_key) DO NOTHING;

-- ==============================================================================
-- 3. BACKFILL EXISTING BUSINESSES INTO tenant_subscriptions
-- ==============================================================================

INSERT INTO public.tenant_subscriptions (
    business_id,
    plan_id,
    plan_key_snapshot,
    plan_name_snapshot,
    subscription_status,
    start_date,
    expiry_date,
    billing_duration_months,
    price_snapshot,
    product_limit_snapshot,
    employee_limit_snapshot,
    support_level_snapshot,
    custom_limit_overrides,
    is_current
)
SELECT
    b.id,
    sp.id,
    sp.plan_key,
    sp.plan_name,
    CASE WHEN COALESCE(b.is_active, true) THEN 'active' ELSE 'suspended' END,
    COALESCE(b.created_at, pg_catalog.now()),
    NULL,
    NULL,
    sp.monthly_price,
    sp.max_active_products,
    CASE
        WHEN b.max_users IS NOT NULL AND b.max_users <> sp.max_employee_seats
            THEN GREATEST(0, b.max_users)
        ELSE sp.max_employee_seats
    END,
    sp.support_level,
    CASE
        WHEN b.max_users IS NOT NULL AND b.max_users <> sp.max_employee_seats
            THEN jsonb_build_object('max_employee_seats', GREATEST(0, b.max_users), 'migrated_from_plan_type', b.plan_type)
        ELSE jsonb_build_object('migrated_from_plan_type', b.plan_type)
    END,
    true
FROM public.businesses b
JOIN public.subscription_plans sp ON sp.plan_key = CASE
    WHEN lower(COALESCE(b.plan_type, 'pro')) = 'free' THEN 'free'
    WHEN lower(COALESCE(b.plan_type, 'pro')) IN ('starter', 'basic') THEN 'basic'
    WHEN lower(COALESCE(b.plan_type, 'pro')) IN ('enterprise', 'business') THEN 'business'
    ELSE 'pro'
END
WHERE NOT EXISTS (
    SELECT 1 FROM public.tenant_subscriptions ts
    WHERE ts.business_id = b.id AND ts.is_current = true
);

-- ==============================================================================
-- 4. RLS POLICIES & GRANTS (ZERO-TRUST)
-- ==============================================================================

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_requests ENABLE ROW LEVEL SECURITY;

-- 4.1 subscription_plans: readable by authenticated users (active plans or super admin)
DROP POLICY IF EXISTS "subscription_plans_select_authenticated" ON public.subscription_plans;
CREATE POLICY "subscription_plans_select_authenticated"
    ON public.subscription_plans FOR SELECT TO authenticated
    USING (is_active = true OR public.is_super_admin());

REVOKE INSERT, UPDATE, DELETE ON public.subscription_plans FROM authenticated;
GRANT SELECT ON public.subscription_plans TO authenticated;

-- 4.2 tenant_subscriptions: readable only by own tenant or super admin; immutable by authenticated
DROP POLICY IF EXISTS "tenant_subscriptions_select_own" ON public.tenant_subscriptions;
CREATE POLICY "tenant_subscriptions_select_own"
    ON public.tenant_subscriptions FOR SELECT TO authenticated
    USING (business_id = public.get_current_business_id() OR public.is_super_admin());

REVOKE INSERT, UPDATE, DELETE ON public.tenant_subscriptions FROM authenticated;
GRANT SELECT ON public.tenant_subscriptions TO authenticated;

-- 4.3 subscription_events: append-only audit log, readable by own tenant admin or super admin
DROP POLICY IF EXISTS "subscription_events_select_own_admin" ON public.subscription_events;
CREATE POLICY "subscription_events_select_own_admin"
    ON public.subscription_events FOR SELECT TO authenticated
    USING (
        (business_id = public.get_current_business_id() AND public.is_current_tenant_admin())
        OR public.is_super_admin()
    );

REVOKE INSERT, UPDATE, DELETE ON public.subscription_events FROM authenticated;
GRANT SELECT ON public.subscription_events TO authenticated;

-- 4.4 subscription_requests: Store Admin can view own & insert pending request; cannot approve/modify
DROP POLICY IF EXISTS "subscription_requests_select_own" ON public.subscription_requests;
CREATE POLICY "subscription_requests_select_own"
    ON public.subscription_requests FOR SELECT TO authenticated
    USING (business_id = public.get_current_business_id() OR public.is_super_admin());

DROP POLICY IF EXISTS "subscription_requests_insert_own_admin" ON public.subscription_requests;
CREATE POLICY "subscription_requests_insert_own_admin"
    ON public.subscription_requests FOR INSERT TO authenticated
    WITH CHECK (
        business_id = public.get_current_business_id()
        AND public.is_current_tenant_admin()
        AND request_status = 'pending'
        AND reviewed_by IS NULL
        AND reviewed_at IS NULL
    );

REVOKE UPDATE, DELETE ON public.subscription_requests FROM authenticated;
GRANT SELECT, INSERT ON public.subscription_requests TO authenticated;

-- ==============================================================================
-- 5. ATOMIC ENFORCEMENT FUNCTIONS & CONCURRENCY-SAFE TRIGGERS
-- ==============================================================================

-- 5.1 Resolve effective entitlements for a business (with automatic Free fallback on expiry)
CREATE OR REPLACE FUNCTION public.get_effective_tenant_entitlements(p_business_id UUID)
RETURNS TABLE (
    effective_plan_key TEXT,
    effective_status TEXT,
    max_active_products INTEGER,
    max_employee_seats INTEGER,
    support_level TEXT,
    is_expired_fallback BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_sub RECORD;
    v_free RECORD;
    v_is_expired BOOLEAN := false;
BEGIN
    SELECT
        ts.plan_key_snapshot,
        ts.subscription_status,
        ts.expiry_date,
        ts.product_limit_snapshot,
        ts.employee_limit_snapshot,
        ts.support_level_snapshot
    INTO v_sub
    FROM public.tenant_subscriptions ts
    WHERE ts.business_id = p_business_id
      AND ts.is_current = true
    LIMIT 1;

    SELECT
        sp.plan_key,
        sp.max_active_products,
        sp.max_employee_seats,
        sp.support_level
    INTO v_free
    FROM public.subscription_plans sp
    WHERE sp.plan_key = 'free'
    LIMIT 1;

    IF NOT FOUND OR v_sub IS NULL THEN
        RETURN QUERY SELECT
            COALESCE(v_free.plan_key, 'free'),
            'active'::TEXT,
            COALESCE(v_free.max_active_products, 5),
            COALESCE(v_free.max_employee_seats, 0),
            COALESCE(v_free.support_level, 'standard'),
            false;
        RETURN;
    END IF;

    v_is_expired := (
        v_sub.subscription_status = 'expired'
        OR (
            v_sub.plan_key_snapshot <> 'free'
            AND v_sub.expiry_date IS NOT NULL
            AND v_sub.expiry_date <= pg_catalog.now()
        )
    );

    IF v_is_expired THEN
        RETURN QUERY SELECT
            'free'::TEXT,
            'expired'::TEXT,
            COALESCE(v_free.max_active_products, 5),
            COALESCE(v_free.max_employee_seats, 0),
            COALESCE(v_free.support_level, 'standard'),
            true;
        RETURN;
    END IF;

    RETURN QUERY SELECT
        v_sub.plan_key_snapshot,
        v_sub.subscription_status,
        v_sub.product_limit_snapshot,
        v_sub.employee_limit_snapshot,
        v_sub.support_level_snapshot,
        false;
END;
$$;

-- 5.2 Enforce active product limit atomically across public.products & public.b2b_products
CREATE OR REPLACE FUNCTION public.enforce_product_subscription_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_business_id UUID;
    v_is_becoming_active BOOLEAN := false;
    v_max_products INTEGER;
    v_eff_plan TEXT;
    v_eff_status TEXT;
    v_pos_count INTEGER := 0;
    v_b2b_count INTEGER := 0;
    v_total_active INTEGER := 0;
BEGIN
    v_business_id := NEW.business_id;
    IF v_business_id IS NULL THEN
        RETURN NEW;
    END IF;

    IF TG_TABLE_NAME = 'products' THEN
        v_is_becoming_active := COALESCE(NEW.active, true) = true
            AND (TG_OP = 'INSERT' OR COALESCE(OLD.active, true) = false);
    ELSIF TG_TABLE_NAME = 'b2b_products' THEN
        v_is_becoming_active := COALESCE(NEW.is_active, true) = true
            AND (TG_OP = 'INSERT' OR COALESCE(OLD.is_active, true) = false);
    END IF;

    IF NOT v_is_becoming_active THEN
        RETURN NEW;
    END IF;

    -- Serialize concurrent product creations per tenant
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('prod_limit_' || v_business_id::text));

    SELECT ent.effective_plan_key, ent.effective_status, ent.max_active_products
    INTO v_eff_plan, v_eff_status, v_max_products
    FROM public.get_effective_tenant_entitlements(v_business_id) ent;

    -- NULL means Unlimited active products
    IF v_max_products IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT COUNT(*) INTO v_pos_count
    FROM public.products p
    WHERE p.business_id = v_business_id
      AND COALESCE(p.active, true) = true;

    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'b2b_products'
    ) THEN
        SELECT COUNT(*) INTO v_b2b_count
        FROM public.b2b_products bp
        WHERE bp.business_id = v_business_id
          AND COALESCE(bp.is_active, true) = true;
    END IF;

    v_total_active := v_pos_count + v_b2b_count;

    IF v_total_active >= v_max_products THEN
        RAISE EXCEPTION 'SUBSCRIPTION_PRODUCT_LIMIT_REACHED: Active product limit (%/% on % plan) reached. Please upgrade or archive existing products.',
            v_total_active, v_max_products, pg_catalog.upper(v_eff_plan)
            USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'products'
    ) THEN
        DROP TRIGGER IF EXISTS trg_enforce_products_subscription_limit ON public.products;
        CREATE TRIGGER trg_enforce_products_subscription_limit
            BEFORE INSERT OR UPDATE OF active ON public.products
            FOR EACH ROW
            EXECUTE FUNCTION public.enforce_product_subscription_limit();
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'b2b_products'
    ) THEN
        DROP TRIGGER IF EXISTS trg_enforce_b2b_products_subscription_limit ON public.b2b_products;
        CREATE TRIGGER trg_enforce_b2b_products_subscription_limit
            BEFORE INSERT OR UPDATE OF is_active ON public.b2b_products
            FOR EACH ROW
            EXECUTE FUNCTION public.enforce_product_subscription_limit();
    END IF;
END $$;

-- 5.3 Enforce employee login seat limit atomically on public.profiles
-- Store Admin logins (is_admin = true) and Super Admins NEVER consume an employee seat.
CREATE OR REPLACE FUNCTION public.enforce_employee_seat_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_business_id UUID;
    v_is_employee_seat BOOLEAN := false;
    v_was_employee_seat BOOLEAN := false;
    v_max_seats INTEGER;
    v_eff_plan TEXT;
    v_current_seats INTEGER := 0;
BEGIN
    v_business_id := NEW.business_id;
    IF v_business_id IS NULL THEN
        RETURN NEW;
    END IF;

    v_is_employee_seat := COALESCE(NEW.is_admin, false) = false
        AND COALESCE(NEW.is_super_admin, false) = false;

    IF NOT v_is_employee_seat THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        v_was_employee_seat := OLD.business_id = NEW.business_id
            AND COALESCE(OLD.is_admin, false) = false
            AND COALESCE(OLD.is_super_admin, false) = false;
        IF v_was_employee_seat THEN
            RETURN NEW;
        END IF;
    END IF;

    -- Serialize concurrent employee login creations per tenant
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('emp_seat_' || v_business_id::text));

    SELECT ent.effective_plan_key, ent.max_employee_seats
    INTO v_eff_plan, v_max_seats
    FROM public.get_effective_tenant_entitlements(v_business_id) ent;

    SELECT COUNT(*) INTO v_current_seats
    FROM public.profiles pr
    WHERE pr.business_id = v_business_id
      AND COALESCE(pr.is_admin, false) = false
      AND COALESCE(pr.is_super_admin, false) = false;

    IF v_current_seats >= COALESCE(v_max_seats, 0) THEN
        RAISE EXCEPTION 'SUBSCRIPTION_SEAT_LIMIT_REACHED: Employee login seat limit (%/% on % plan) reached. Store Admin login remains available, but additional employee logins require a plan upgrade.',
            v_current_seats, COALESCE(v_max_seats, 0), pg_catalog.upper(v_eff_plan)
            USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_employee_seat_limit ON public.profiles;
CREATE TRIGGER trg_enforce_employee_seat_limit
    BEFORE INSERT OR UPDATE OF is_admin, is_super_admin, business_id ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_employee_seat_limit();

COMMIT;

