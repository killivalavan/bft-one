-- ==============================================================================
-- SEYALPRO — ATOMIC POS STOCK ADJUSTMENTS & BOM CONCURRENCY HARDENING
-- ==============================================================================
-- Migration: supabase_atomic_stock_adjust.sql
-- Addresses: APP-01 (Atomic Race Condition on POS Stock Adjustments)
--
-- This script:
-- 1. Creates pos_stock_idempotency table to prevent duplicate/replayed decrements
-- 2. Creates atomic database function adjust_pos_stock_atomic() with row-level locks
--    (FOR UPDATE) ensuring simultaneous requests do not cause lost updates
-- 3. Atomically performs Recipe BOM inventory item deductions and stock_ledger
--    audit trail within the same transactional boundary
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. POS STOCK IDEMPOTENCY TRACKING
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pos_stock_idempotency (
    key TEXT PRIMARY KEY,
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    operation TEXT NOT NULL DEFAULT 'stock_adjust',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pos_stock_idempotency_biz 
    ON public.pos_stock_idempotency(business_id);

ALTER TABLE public.pos_stock_idempotency ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation_pos_stock_idempotency" ON public.pos_stock_idempotency;
CREATE POLICY "tenant_isolation_pos_stock_idempotency" ON public.pos_stock_idempotency
    FOR ALL TO authenticated
    USING (
        business_id = public.get_current_business_id()
        OR public.is_super_admin()
    )
    WITH CHECK (
        business_id = public.get_current_business_id()
        OR public.is_super_admin()
    );

-- ------------------------------------------------------------------------------
-- 2. ATOMIC STOCK ADJUSTMENT RPC FUNCTION
-- ------------------------------------------------------------------------------
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
SET search_path = public, pg_temp
AS $$
DECLARE
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
    -- 1. Idempotency Check: if idempotency key provided and already exists, exit idempotently
    IF p_idempotency_key IS NOT NULL AND trim(p_idempotency_key) <> '' THEN
        INSERT INTO public.pos_stock_idempotency (key, business_id, operation)
        VALUES (trim(p_idempotency_key), p_business_id, 'stock_adjust')
        ON CONFLICT (key) DO NOTHING
        RETURNING key INTO v_inserted_key;

        -- If no row was returned, this operation was already processed
        IF v_inserted_key IS NULL THEN
            RETURN jsonb_build_object(
                'ok', true,
                'already_processed', true,
                'updated', 0,
                'notified', 0,
                'message', 'Idempotent request already processed'
            );
        END IF;
    END IF;

    -- 2. Validate items array
    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RETURN jsonb_build_object('ok', true, 'skipped', true, 'updated', 0, 'notified', 0);
    END IF;

    -- 3. Strict Stock Validation (Optional: prevent sale if insufficient stock)
    IF p_strict_stock THEN
        FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(product_id TEXT, qty NUMERIC)
        LOOP
            IF v_item.product_id IS NOT NULL AND v_item.qty > 0 THEN
                BEGIN
                    v_prod_id := v_item.product_id::uuid;
                EXCEPTION WHEN OTHERS THEN
                    CONTINUE;
                END;

                SELECT available_qty INTO v_before
                FROM public.product_stocks
                WHERE product_id = v_prod_id AND business_id = p_business_id
                FOR UPDATE;

                IF COALESCE(v_before, 0) < v_item.qty THEN
                    v_insufficient_prods := v_insufficient_prods || jsonb_build_object(
                        'product_id', v_item.product_id,
                        'available', COALESCE(v_before, 0),
                        'requested', v_item.qty
                    );
                END IF;
            END IF;
        END LOOP;

        IF jsonb_array_length(v_insufficient_prods) > 0 THEN
            RAISE EXCEPTION 'INSUFFICIENT_STOCK: %', v_insufficient_prods::text;
        END IF;
    END IF;

    -- 4. Process product stock deductions atomically with row-level locks
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(product_id TEXT, qty NUMERIC)
    LOOP
        IF v_item.product_id IS NULL OR v_item.qty IS NULL OR v_item.qty <= 0 THEN
            CONTINUE;
        END IF;

        BEGIN
            v_prod_id := v_item.product_id::uuid;
        EXCEPTION WHEN OTHERS THEN
            CONTINUE;
        END;

        v_use_qty := floor(v_item.qty);

        -- Lock the specific row in product_stocks to serialize concurrent updates
        SELECT available_qty, max_qty, notify_at_count
        INTO v_stock
        FROM public.product_stocks
        WHERE product_id = v_prod_id AND business_id = p_business_id
        FOR UPDATE;

        IF FOUND THEN
            v_before := COALESCE(v_stock.available_qty, 0);
            v_max := COALESCE(v_stock.max_qty, 0);
            v_low_threshold := v_stock.notify_at_count;
            v_after := GREATEST(0, v_before - v_use_qty);

            UPDATE public.product_stocks
            SET available_qty = v_after,
                updated_at = now()
            WHERE product_id = v_prod_id AND business_id = p_business_id;

            v_updated_count := v_updated_count + 1;

            -- Retrieve product name for notification messages
            SELECT name INTO v_prod_name
            FROM public.products
            WHERE id = v_prod_id AND business_id = p_business_id;
            IF v_prod_name IS NULL THEN
                v_prod_name := 'Product';
            END IF;

            -- Low-stock notification trigger
            IF v_low_threshold IS NOT NULL AND v_low_threshold > 0 THEN
                IF v_before > v_low_threshold AND v_after <= v_low_threshold AND v_after > 0 THEN
                    INSERT INTO public.notifications (
                        business_id, product_id, kind, message, meta
                    ) VALUES (
                        p_business_id,
                        v_prod_id,
                        'stock',
                        'Low stock: ' || v_prod_name || ' remaining ' || v_after || ' (threshold ' || v_low_threshold || ')',
                        jsonb_build_object('remaining', v_after, 'threshold', v_low_threshold)
                    );
                    v_notif_count := v_notif_count + 1;
                END IF;
            END IF;

            -- Out-of-stock notification trigger
            IF v_before > 0 AND v_after = 0 THEN
                INSERT INTO public.notifications (
                    business_id, product_id, kind, message, meta
                ) VALUES (
                    p_business_id,
                    v_prod_id,
                    'stock',
                    'Out of stock: ' || v_prod_name,
                    jsonb_build_object('remaining', v_after, 'max', v_max)
                );
                v_notif_count := v_notif_count + 1;
            END IF;

        ELSE
            -- Stock row does not exist; insert row safely
            INSERT INTO public.product_stocks (product_id, business_id, max_qty, available_qty)
            VALUES (v_prod_id, p_business_id, 0, 0)
            ON CONFLICT (product_id) DO UPDATE
            SET available_qty = GREATEST(0, public.product_stocks.available_qty - v_use_qty),
                updated_at = now()
            WHERE public.product_stocks.business_id = p_business_id;

            v_updated_count := v_updated_count + 1;
        END IF;

        -- 5. Recipe BOM Auto-Deductions within the same atomic transaction
        FOR v_recipe IN
            SELECT inventory_item_id, quantity_required, waste_factor_pct
            FROM public.item_recipes
            WHERE product_id = v_prod_id AND business_id = p_business_id
        LOOP
            v_deduct := (v_recipe.quantity_required * v_use_qty * (1 + COALESCE(v_recipe.waste_factor_pct, 0) / 100.0));

            -- Lock and deduct from inventory_items
            UPDATE public.inventory_items
            SET current_stock = GREATEST(0, current_stock - v_deduct),
                updated_at = now()
            WHERE id = v_recipe.inventory_item_id AND business_id = p_business_id
            RETURNING current_stock, cost_per_unit INTO v_cur_inv, v_cost;

            -- Append to stock_ledger audit trail
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
                p_user_id
            );
        END LOOP;

    END LOOP;

    RETURN jsonb_build_object(
        'ok', true,
        'updated', v_updated_count,
        'notified', v_notif_count
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 3. PLATFORM ANALYTICS AGGREGATION RPC & COMPOSITE INDEXES (PERF-01 / DBO-01)
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_daily_sales_biz_date ON public.daily_sales(business_id, sale_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_expenses_biz_date ON public.daily_expenses(business_id, expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_orders_biz_created ON public.orders(business_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.get_platform_business_metrics()
RETURNS TABLE (
    business_id UUID,
    total_sales NUMERIC,
    total_expenses NUMERIC,
    order_count BIGINT,
    user_count BIGINT,
    admin_email TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT
        b.id AS business_id,
        COALESCE(s.total_sales, 0) AS total_sales,
        COALESCE(e.total_expenses, 0) AS total_expenses,
        COALESCE(o.order_count, 0) AS order_count,
        COALESCE(p.user_count, 0) AS user_count,
        p.admin_email
    FROM public.businesses b
    LEFT JOIN (
        SELECT business_id, SUM(COALESCE(total_cash_cents, 0) + COALESCE(upi_amount_cents, 0)) / 100.0 AS total_sales
        FROM public.daily_sales
        WHERE business_id IS NOT NULL
        GROUP BY business_id
    ) s ON s.business_id = b.id
    LEFT JOIN (
        SELECT business_id, SUM(COALESCE(price_cents, 0)) / 100.0 AS total_expenses
        FROM public.daily_expenses
        WHERE business_id IS NOT NULL
        GROUP BY business_id
    ) e ON e.business_id = b.id
    LEFT JOIN (
        SELECT business_id, COUNT(*) AS order_count
        FROM public.orders
        WHERE business_id IS NOT NULL
        GROUP BY business_id
    ) o ON o.business_id = b.id
    LEFT JOIN (
        SELECT
            business_id,
            COUNT(*) AS user_count,
            MIN(email) FILTER (WHERE is_admin = true) AS admin_email
        FROM public.profiles
        WHERE business_id IS NOT NULL
        GROUP BY business_id
    ) p ON p.business_id = b.id;
$$;

COMMIT;

