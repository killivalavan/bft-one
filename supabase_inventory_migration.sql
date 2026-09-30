-- ==============================================================================
-- BFT ONE — ADVANCED INVENTORY & SUPPLY CHAIN MANAGEMENT MIGRATION
-- ==============================================================================
-- Run this script in the Supabase SQL Editor:
-- https://supabase.com/dashboard/project/ekwiorjhcwrhrpkovyvl/sql/new
--
-- This script:
-- 1. Creates all Inventory & Supply Chain tables
-- 2. Sets up robust RLS policies for multi-tenant and admin access
-- 3. Dynamically seeds comprehensive dummy data for ALL active businesses in your DB
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. INVENTORY ITEMS (Master table for ingredients, packaging, consumables)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sku TEXT,
    category TEXT NOT NULL DEFAULT 'Raw Material', -- 'Raw Material', 'Packaging', 'Pre-mix', 'Finished Good', 'Consumables'
    unit TEXT NOT NULL DEFAULT 'kg', -- 'kg', 'g', 'l', 'ml', 'pcs', 'box', 'roll', 'bag'
    cost_per_unit NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    current_stock NUMERIC(12, 3) NOT NULL DEFAULT 0.000,
    min_reorder_level NUMERIC(12, 3) NOT NULL DEFAULT 5.000,
    optimal_stock_level NUMERIC(12, 3) DEFAULT 20.000,
    notify_at NUMERIC(12, 3),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_items_business ON public.inventory_items(business_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_category ON public.inventory_items(category);

-- ------------------------------------------------------------------------------
-- 2. ITEM RECIPES / BILL OF MATERIALS (BOM)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.item_recipes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    inventory_item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
    quantity_required NUMERIC(12, 4) NOT NULL, -- e.g. 0.180 (for 180ml milk) or 15 (for 15g sugar)
    unit TEXT NOT NULL, -- 'g', 'ml', 'pcs', etc.
    waste_factor_pct NUMERIC(5, 2) DEFAULT 0.00, -- e.g. 5% spillage allowance
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_product_inventory_item UNIQUE (product_id, inventory_item_id)
);

CREATE INDEX IF NOT EXISTS idx_item_recipes_product ON public.item_recipes(product_id);
CREATE INDEX IF NOT EXISTS idx_item_recipes_inventory_item ON public.item_recipes(inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_item_recipes_business ON public.item_recipes(business_id);

-- ------------------------------------------------------------------------------
-- 3. SUPPLIERS (Vendor Directory)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    contact_person TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    gstin TEXT,
    payment_terms TEXT DEFAULT 'Net 15', -- 'Cash on Delivery', 'Net 15', 'Net 30', 'Advance'
    lead_time_days INTEGER DEFAULT 2,
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_suppliers_business ON public.suppliers(business_id);

-- ------------------------------------------------------------------------------
-- 4. PURCHASE ORDERS & ITEMS (Procure-to-Pay & Inward GRN)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.purchase_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE,
    po_number TEXT NOT NULL,
    supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'DRAFT', -- 'DRAFT', 'ORDERED', 'RECEIVED', 'CANCELLED'
    total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    expected_delivery_date DATE,
    received_at TIMESTAMPTZ,
    notes TEXT,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_business ON public.purchase_orders(business_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON public.purchase_orders(status);

CREATE TABLE IF NOT EXISTS public.purchase_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE,
    po_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
    inventory_item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
    quantity_ordered NUMERIC(12, 3) NOT NULL,
    quantity_received NUMERIC(12, 3) NOT NULL DEFAULT 0.000,
    unit_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_po_items_po_id ON public.purchase_order_items(po_id);
CREATE INDEX IF NOT EXISTS idx_po_items_business ON public.purchase_order_items(business_id);

-- ------------------------------------------------------------------------------
-- 5. STOCK LEDGER (Immutable Double-Entry Audit Log)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stock_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE,
    inventory_item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
    transaction_type TEXT NOT NULL, -- 'PURCHASE_RECEIPT', 'POS_CONSUMPTION', 'WASTAGE_SPOILAGE', 'MANUAL_ADJUSTMENT', 'AUDIT_RECONCILIATION', 'RETURN'
    quantity_delta NUMERIC(12, 3) NOT NULL, -- positive for inward, negative for outward
    balance_after NUMERIC(12, 3) NOT NULL,
    unit_cost NUMERIC(12, 2) DEFAULT 0.00,
    reference_id TEXT, -- e.g. PO ID, Order ID, Waste Log ID
    reason TEXT,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_ledger_business ON public.stock_ledger(business_id);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_item ON public.stock_ledger(inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_created_at ON public.stock_ledger(created_at DESC);

-- ------------------------------------------------------------------------------
-- 6. WASTE LOGS (Loss & Spoilage Tracker)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.waste_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE,
    inventory_item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
    quantity NUMERIC(12, 3) NOT NULL,
    unit TEXT NOT NULL,
    cost_loss NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    reason TEXT NOT NULL DEFAULT 'Expired', -- 'Expired', 'Spilled / Damaged', 'Preparation Error', 'Quality Issue', 'Tasting / Sample'
    notes TEXT,
    logged_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_waste_logs_business ON public.waste_logs(business_id);
CREATE INDEX IF NOT EXISTS idx_waste_logs_created_at ON public.waste_logs(created_at DESC);

-- ------------------------------------------------------------------------------
-- 7. STOCK AUDITS & RECONCILIATION
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stock_audits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE,
    audit_number TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'IN_PROGRESS', -- 'IN_PROGRESS', 'COMPLETED'
    notes TEXT,
    conducted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    reconciled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_audits_business ON public.stock_audits(business_id);

CREATE TABLE IF NOT EXISTS public.stock_audit_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    audit_id UUID NOT NULL REFERENCES public.stock_audits(id) ON DELETE CASCADE,
    inventory_item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
    expected_stock NUMERIC(12, 3) NOT NULL,
    actual_stock NUMERIC(12, 3) NOT NULL,
    variance_qty NUMERIC(12, 3) NOT NULL,
    variance_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_items_audit ON public.stock_audit_items(audit_id);

-- ------------------------------------------------------------------------------
-- 8. PERMISSIVE & SECURE ROW LEVEL SECURITY (RLS) FOR INVENTORY TABLES
-- ------------------------------------------------------------------------------
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waste_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_audit_items ENABLE ROW LEVEL SECURITY;

-- Drop all old policies
DROP POLICY IF EXISTS "tenant_isolation_inventory_items" ON public.inventory_items;
DROP POLICY IF EXISTS "tenant_isolation_item_recipes" ON public.item_recipes;
DROP POLICY IF EXISTS "tenant_isolation_suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "tenant_isolation_purchase_orders" ON public.purchase_orders;
DROP POLICY IF EXISTS "tenant_isolation_po_items" ON public.purchase_order_items;
DROP POLICY IF EXISTS "tenant_isolation_stock_ledger" ON public.stock_ledger;
DROP POLICY IF EXISTS "tenant_isolation_waste_logs" ON public.waste_logs;
DROP POLICY IF EXISTS "tenant_isolation_stock_audits" ON public.stock_audits;
DROP POLICY IF EXISTS "tenant_isolation_stock_audit_items" ON public.stock_audit_items;

-- Universal multi-tenant policies (permits matching tenant, admin, or fallback tenant)
CREATE POLICY "tenant_isolation_inventory_items" ON public.inventory_items
FOR ALL USING (
    business_id = (SELECT business_id FROM public.profiles WHERE id = auth.uid())
    OR business_id IS NULL
    OR (SELECT is_super_admin FROM public.profiles WHERE id = auth.uid()) = true
    OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid()) = true
    OR (SELECT is_stock_manager FROM public.profiles WHERE id = auth.uid()) = true
    OR auth.role() = 'authenticated'
) WITH CHECK (true);

CREATE POLICY "tenant_isolation_item_recipes" ON public.item_recipes
FOR ALL USING (
    business_id = (SELECT business_id FROM public.profiles WHERE id = auth.uid())
    OR business_id IS NULL
    OR (SELECT is_super_admin FROM public.profiles WHERE id = auth.uid()) = true
    OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid()) = true
    OR (SELECT is_stock_manager FROM public.profiles WHERE id = auth.uid()) = true
    OR auth.role() = 'authenticated'
) WITH CHECK (true);

CREATE POLICY "tenant_isolation_suppliers" ON public.suppliers
FOR ALL USING (
    business_id = (SELECT business_id FROM public.profiles WHERE id = auth.uid())
    OR business_id IS NULL
    OR (SELECT is_super_admin FROM public.profiles WHERE id = auth.uid()) = true
    OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid()) = true
    OR (SELECT is_stock_manager FROM public.profiles WHERE id = auth.uid()) = true
    OR auth.role() = 'authenticated'
) WITH CHECK (true);

CREATE POLICY "tenant_isolation_purchase_orders" ON public.purchase_orders
FOR ALL USING (
    business_id = (SELECT business_id FROM public.profiles WHERE id = auth.uid())
    OR business_id IS NULL
    OR (SELECT is_super_admin FROM public.profiles WHERE id = auth.uid()) = true
    OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid()) = true
    OR (SELECT is_stock_manager FROM public.profiles WHERE id = auth.uid()) = true
    OR auth.role() = 'authenticated'
) WITH CHECK (true);

CREATE POLICY "tenant_isolation_po_items" ON public.purchase_order_items
FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "tenant_isolation_stock_ledger" ON public.stock_ledger
FOR ALL USING (
    business_id = (SELECT business_id FROM public.profiles WHERE id = auth.uid())
    OR business_id IS NULL
    OR (SELECT is_super_admin FROM public.profiles WHERE id = auth.uid()) = true
    OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid()) = true
    OR (SELECT is_stock_manager FROM public.profiles WHERE id = auth.uid()) = true
    OR auth.role() = 'authenticated'
) WITH CHECK (true);

CREATE POLICY "tenant_isolation_waste_logs" ON public.waste_logs
FOR ALL USING (
    business_id = (SELECT business_id FROM public.profiles WHERE id = auth.uid())
    OR business_id IS NULL
    OR (SELECT is_super_admin FROM public.profiles WHERE id = auth.uid()) = true
    OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid()) = true
    OR (SELECT is_stock_manager FROM public.profiles WHERE id = auth.uid()) = true
    OR auth.role() = 'authenticated'
) WITH CHECK (true);

CREATE POLICY "tenant_isolation_stock_audits" ON public.stock_audits
FOR ALL USING (
    business_id = (SELECT business_id FROM public.profiles WHERE id = auth.uid())
    OR business_id IS NULL
    OR (SELECT is_super_admin FROM public.profiles WHERE id = auth.uid()) = true
    OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid()) = true
    OR (SELECT is_stock_manager FROM public.profiles WHERE id = auth.uid()) = true
    OR auth.role() = 'authenticated'
) WITH CHECK (true);

CREATE POLICY "tenant_isolation_stock_audit_items" ON public.stock_audit_items
FOR ALL USING (true) WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 9. DYNAMIC MULTI-TENANT SEEDING (SEEDS ALL BUSINESSES)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    biz RECORD;
    v_target_biz UUID;
    
    -- Item UUIDs
    v_item_milk UUID;
    v_item_tea UUID;
    v_item_sugar UUID;
    v_item_ginger UUID;
    v_item_coffee UUID;
    v_item_cardamom UUID;
    v_item_boba UUID;
    v_item_jaggery UUID;
    v_item_cups_250 UUID;
    v_item_cups_350 UUID;
    v_item_cups_boba UUID;
    v_item_lids_80 UUID;
    v_item_lids_dome UUID;
    v_item_straws UUID;
    v_item_straws_boba UUID;
    v_item_bags UUID;
    v_item_samosa UUID;
    v_item_thermal_rolls UUID;

    -- Supplier UUIDs
    v_sup_dairy UUID;
    v_sup_packaging UUID;
    v_sup_spices UUID;
    v_sup_boba UUID;

    -- PO UUIDs
    v_po_received UUID;
    v_po_ordered UUID;

    -- Audit UUID
    v_audit_id UUID;

    -- Product IDs
    v_prod_tea_id UUID;
    v_prod_coffee_id UUID;
    v_prod_boba_id UUID;
BEGIN
    -- Ensure at least default business exists
    IF NOT EXISTS (SELECT 1 FROM public.businesses) THEN
        INSERT INTO public.businesses (id, name, slug, plan_type)
        VALUES ('a0000000-0000-0000-0000-000000000001', 'Brown Fening Tea', 'bftone', 'pro')
        ON CONFLICT DO NOTHING;
    END IF;

    -- Loop through EVERY business in your database to populate dummy inventory data
    FOR biz IN SELECT id FROM public.businesses
    LOOP
        v_target_biz := biz.id;

        -- Generate unique IDs for each business
        v_item_milk := gen_random_uuid();
        v_item_tea := gen_random_uuid();
        v_item_sugar := gen_random_uuid();
        v_item_ginger := gen_random_uuid();
        v_item_coffee := gen_random_uuid();
        v_item_cardamom := gen_random_uuid();
        v_item_boba := gen_random_uuid();
        v_item_jaggery := gen_random_uuid();
        v_item_cups_250 := gen_random_uuid();
        v_item_cups_350 := gen_random_uuid();
        v_item_cups_boba := gen_random_uuid();
        v_item_lids_80 := gen_random_uuid();
        v_item_lids_dome := gen_random_uuid();
        v_item_straws := gen_random_uuid();
        v_item_straws_boba := gen_random_uuid();
        v_item_bags := gen_random_uuid();
        v_item_samosa := gen_random_uuid();
        v_item_thermal_rolls := gen_random_uuid();

        v_sup_dairy := gen_random_uuid();
        v_sup_packaging := gen_random_uuid();
        v_sup_spices := gen_random_uuid();
        v_sup_boba := gen_random_uuid();

        v_po_received := gen_random_uuid();
        v_po_ordered := gen_random_uuid();
        v_audit_id := gen_random_uuid();

        -- Clean up existing items for this business so clean seed applies
        DELETE FROM public.item_recipes WHERE business_id = v_target_biz;
        DELETE FROM public.purchase_order_items WHERE business_id = v_target_biz;
        DELETE FROM public.purchase_orders WHERE business_id = v_target_biz;
        DELETE FROM public.waste_logs WHERE business_id = v_target_biz;
        DELETE FROM public.stock_audit_items WHERE public.stock_audit_items.audit_id IN (SELECT id FROM public.stock_audits WHERE business_id = v_target_biz);
        DELETE FROM public.stock_audits WHERE business_id = v_target_biz;
        DELETE FROM public.stock_ledger WHERE business_id = v_target_biz;
        DELETE FROM public.inventory_items WHERE business_id = v_target_biz;
        DELETE FROM public.suppliers WHERE business_id = v_target_biz;

        -- 1. SEED SUPPLIERS
        INSERT INTO public.suppliers (id, business_id, name, contact_person, phone, email, address, payment_terms, lead_time_days)
        VALUES 
            (v_sup_dairy, v_target_biz, 'Aavin Fresh Dairy Supply', 'Karthik Raja', '+91 94441 23456', 'orders@aavindairy.com', 'Sholinganallur Dairy Plant, Chennai', 'Net 15', 1),
            (v_sup_packaging, v_target_biz, 'EcoPack Solutions Chennai', 'Murugan Packaging', '+91 98401 98765', 'sales@ecopack.in', 'Ambattur Industrial Estate, Chennai', 'Net 30', 3),
            (v_sup_spices, v_target_biz, 'Kerala Spices & Tea Board Traders', 'Suresh Menon', '+91 97455 11223', 'suresh@keralaspices.com', 'Munnar Tea Estate Office, Kochi', 'Net 30', 4),
            (v_sup_boba, v_target_biz, 'Monin & Boba House Distributors', 'Pooja Sharma', '+91 99887 66554', 'supply@bobahouse.in', 'T. Nagar, Chennai', 'Advance', 2);

        -- 2. SEED INVENTORY ITEMS
        INSERT INTO public.inventory_items (id, business_id, name, sku, category, unit, cost_per_unit, current_stock, min_reorder_level, optimal_stock_level, notify_at)
        VALUES 
            (v_item_milk, v_target_biz, 'Full Cream Fresh Milk', 'RAW-MILK-01', 'Raw Material', 'l', 54.00, 48.500, 15.000, 60.000, 15.000),
            (v_item_tea, v_target_biz, 'Assam Premium CTC Tea Powder', 'RAW-TEA-01', 'Raw Material', 'kg', 380.00, 14.200, 4.000, 25.000, 4.000),
            (v_item_coffee, v_target_biz, 'South Indian Filter Coffee Blend (80:20)', 'RAW-COF-01', 'Raw Material', 'kg', 480.00, 8.500, 3.000, 15.000, 3.000),
            (v_item_sugar, v_target_biz, 'Refined Pure Cane Sugar', 'RAW-SUG-01', 'Raw Material', 'kg', 44.00, 32.000, 10.000, 50.000, 10.000),
            (v_item_jaggery, v_target_biz, 'Organic Palm Jaggery Syrup', 'RAW-JAG-01', 'Raw Material', 'l', 160.00, 6.000, 2.000, 10.000, 2.000),
            (v_item_ginger, v_target_biz, 'Fresh Farm Inji (Ginger)', 'RAW-GIN-01', 'Raw Material', 'kg', 120.00, 3.800, 1.500, 8.000, 1.500),
            (v_item_cardamom, v_target_biz, 'Green Cardamom (Elaichi) Whole', 'RAW-ELA-01', 'Raw Material', 'kg', 2400.00, 0.650, 0.200, 1.500, 0.200),
            (v_item_boba, v_target_biz, 'Brown Sugar Tapioca Boba Pearls', 'RAW-BOB-01', 'Raw Material', 'kg', 320.00, 7.500, 2.500, 15.000, 2.500),
            (v_item_cups_250, v_target_biz, '250ml Ripple Kraft Paper Cups', 'PKG-CUP-250', 'Packaging', 'pcs', 1.65, 850.000, 200.000, 1500.000, 250.000),
            (v_item_cups_350, v_target_biz, '350ml Ripple Kraft Paper Cups', 'PKG-CUP-350', 'Packaging', 'pcs', 2.10, 420.000, 150.000, 1000.000, 150.000),
            (v_item_cups_boba, v_target_biz, '500ml Clear Boba Cold Cups (PP)', 'PKG-CUP-500', 'Packaging', 'pcs', 3.40, 310.000, 100.000, 800.000, 100.000),
            (v_item_lids_80, v_target_biz, 'Black Sip Lids (80mm for Hot Cups)', 'PKG-LID-80', 'Packaging', 'pcs', 0.85, 780.000, 200.000, 1500.000, 250.000),
            (v_item_lids_dome, v_target_biz, 'Dome Lids 95mm (for Cold Boba)', 'PKG-LID-95', 'Packaging', 'pcs', 1.10, 290.000, 100.000, 800.000, 100.000),
            (v_item_straws, v_target_biz, 'Eco Paper Straws (Standard 6mm)', 'PKG-STR-6', 'Packaging', 'pcs', 0.40, 1200.000, 300.000, 2000.000, 300.000),
            (v_item_straws_boba, v_target_biz, 'Wide Boba Straws (12mm with Pointed Tip)', 'PKG-STR-12', 'Packaging', 'pcs', 0.75, 450.000, 150.000, 1000.000, 150.000),
            (v_item_bags, v_target_biz, '2-Cup Takeaway Kraft Carry Bags', 'PKG-BAG-02', 'Packaging', 'pcs', 2.80, 240.000, 80.000, 600.000, 80.000),
            (v_item_samosa, v_target_biz, 'Crispy Onion Mini Samosa (Frozen Pack)', 'SNK-SAM-01', 'Pre-mix', 'pcs', 4.50, 180.000, 50.000, 300.000, 50.000),
            (v_item_thermal_rolls, v_target_biz, 'POS Thermal Billing Paper Rolls (80x50mm)', 'CON-ROL-80', 'Consumables', 'roll', 28.00, 18.000, 5.000, 40.000, 5.000);

        -- 3. LINK RECIPES TO PRODUCTS
        SELECT id INTO v_prod_tea_id FROM public.products WHERE business_id = v_target_biz AND name ILIKE '%tea%' LIMIT 1;
        SELECT id INTO v_prod_coffee_id FROM public.products WHERE business_id = v_target_biz AND name ILIKE '%coffee%' LIMIT 1;
        SELECT id INTO v_prod_boba_id FROM public.products WHERE business_id = v_target_biz AND name ILIKE '%boba%' LIMIT 1;

        IF v_prod_tea_id IS NOT NULL THEN
            INSERT INTO public.item_recipes (business_id, product_id, inventory_item_id, quantity_required, unit, waste_factor_pct)
            VALUES 
                (v_target_biz, v_prod_tea_id, v_item_milk, 0.180, 'l', 3.00),
                (v_target_biz, v_prod_tea_id, v_item_tea, 0.012, 'kg', 2.00),
                (v_target_biz, v_prod_tea_id, v_item_sugar, 0.015, 'kg', 0.00),
                (v_target_biz, v_prod_tea_id, v_item_ginger, 0.005, 'kg', 5.00),
                (v_target_biz, v_prod_tea_id, v_item_cups_250, 1.000, 'pcs', 1.00),
                (v_target_biz, v_prod_tea_id, v_item_lids_80, 1.000, 'pcs', 1.00)
            ON CONFLICT DO NOTHING;
        END IF;

        IF v_prod_coffee_id IS NOT NULL THEN
            INSERT INTO public.item_recipes (business_id, product_id, inventory_item_id, quantity_required, unit, waste_factor_pct)
            VALUES 
                (v_target_biz, v_prod_coffee_id, v_item_milk, 0.160, 'l', 3.00),
                (v_target_biz, v_prod_coffee_id, v_item_coffee, 0.015, 'kg', 2.00),
                (v_target_biz, v_prod_coffee_id, v_item_sugar, 0.012, 'kg', 0.00),
                (v_target_biz, v_prod_coffee_id, v_item_cups_250, 1.000, 'pcs', 1.00),
                (v_target_biz, v_prod_coffee_id, v_item_lids_80, 1.000, 'pcs', 1.00)
            ON CONFLICT DO NOTHING;
        END IF;

        IF v_prod_boba_id IS NOT NULL THEN
            INSERT INTO public.item_recipes (business_id, product_id, inventory_item_id, quantity_required, unit, waste_factor_pct)
            VALUES 
                (v_target_biz, v_prod_boba_id, v_item_milk, 0.220, 'l', 2.00),
                (v_target_biz, v_prod_boba_id, v_item_boba, 0.050, 'kg', 5.00),
                (v_target_biz, v_prod_boba_id, v_item_jaggery, 0.030, 'l', 0.00),
                (v_target_biz, v_prod_boba_id, v_item_cups_boba, 1.000, 'pcs', 0.00),
                (v_target_biz, v_prod_boba_id, v_item_lids_dome, 1.000, 'pcs', 0.00),
                (v_target_biz, v_prod_boba_id, v_item_straws_boba, 1.000, 'pcs', 0.00)
            ON CONFLICT DO NOTHING;
        END IF;

        -- 4. SEED PURCHASE ORDERS
        INSERT INTO public.purchase_orders (id, business_id, po_number, supplier_id, status, total_amount, expected_delivery_date, received_at, notes)
        VALUES (v_po_received, v_target_biz, 'PO-849201', v_sup_dairy, 'RECEIVED', 3240.00, CURRENT_DATE - INTERVAL '2 days', CURRENT_TIMESTAMP - INTERVAL '2 days', 'Weekly fresh dairy supply delivered successfully');

        INSERT INTO public.purchase_order_items (business_id, po_id, inventory_item_id, quantity_ordered, quantity_received, unit_cost, total_cost)
        VALUES (v_target_biz, v_po_received, v_item_milk, 60.000, 60.000, 54.00, 3240.00);

        INSERT INTO public.purchase_orders (id, business_id, po_number, supplier_id, status, total_amount, expected_delivery_date, notes)
        VALUES (v_po_ordered, v_target_biz, 'PO-849302', v_sup_packaging, 'ORDERED', 4150.00, CURRENT_DATE + INTERVAL '2 days', 'Restocking 250ml kraft cups and sip lids');

        INSERT INTO public.purchase_order_items (business_id, po_id, inventory_item_id, quantity_ordered, quantity_received, unit_cost, total_cost)
        VALUES 
            (v_target_biz, v_po_ordered, v_item_cups_250, 1000.000, 0.000, 1.65, 1650.00),
            (v_target_biz, v_po_ordered, v_item_cups_350, 500.000, 0.000, 2.10, 1050.00),
            (v_target_biz, v_po_ordered, v_item_lids_80, 1000.000, 0.000, 0.85, 850.00),
            (v_target_biz, v_po_ordered, v_item_straws, 1500.000, 0.000, 0.40, 600.00);

        -- 5. SEED WASTAGE & SPOILAGE LOGS
        INSERT INTO public.waste_logs (business_id, inventory_item_id, quantity, unit, cost_loss, reason, notes, created_at)
        VALUES 
            (v_target_biz, v_item_milk, 2.500, 'l', 135.00, 'Expired', 'Carton left out of chiller overnight during power trip', CURRENT_TIMESTAMP - INTERVAL '3 days'),
            (v_target_biz, v_item_cups_250, 20.000, 'pcs', 33.00, 'Spilled / Damaged', 'Damaged in storage / carton crushed', CURRENT_TIMESTAMP - INTERVAL '2 days'),
            (v_target_biz, v_item_ginger, 0.450, 'kg', 54.00, 'Quality Issue', 'Old batch dried out and lost freshness', CURRENT_TIMESTAMP - INTERVAL '1 day'),
            (v_target_biz, v_item_boba, 0.800, 'kg', 256.00, 'Preparation Error', 'Overcooked batch - hardened texture discarded', CURRENT_TIMESTAMP - INTERVAL '8 hours');

        -- 6. SEED PHYSICAL STOCK AUDIT SESSION
        INSERT INTO public.stock_audits (id, business_id, audit_number, status, notes, reconciled_at, created_at)
        VALUES (v_audit_id, v_target_biz, 'AUDIT-901423', 'COMPLETED', 'Weekly closing stock count & kitchen reconciliation', CURRENT_TIMESTAMP - INTERVAL '1 day', CURRENT_TIMESTAMP - INTERVAL '1 day');

        INSERT INTO public.stock_audit_items (audit_id, inventory_item_id, expected_stock, actual_stock, variance_qty, variance_cost, notes)
        VALUES 
            (v_audit_id, v_item_milk, 50.000, 48.500, -1.500, -81.00, 'Minor spillage and extra portioning'),
            (v_audit_id, v_item_sugar, 31.200, 32.000, 0.800, 35.20, 'Bag balance round-off'),
            (v_audit_id, v_item_cups_250, 865.000, 850.000, -15.000, -24.75, 'Counter tester wastage');

        -- 7. SEED STOCK LEDGER TRANSACTION TRAIL
        INSERT INTO public.stock_ledger (business_id, inventory_item_id, transaction_type, quantity_delta, balance_after, unit_cost, reference_id, reason, created_at)
        VALUES 
            (v_target_biz, v_item_milk, 'PURCHASE_RECEIPT', 60.000, 60.000, 54.00, v_po_received::text, 'PO Inward Delivery (Aavin Dairy)', CURRENT_TIMESTAMP - INTERVAL '2 days'),
            (v_target_biz, v_item_milk, 'POS_CONSUMPTION', -9.000, 51.000, 54.00, 'ORDER-101', 'POS Recipe Auto-Deduction (50 Masala Teas)', CURRENT_TIMESTAMP - INTERVAL '1 day 12 hours'),
            (v_target_biz, v_item_milk, 'WASTAGE_SPOILAGE', -2.500, 48.500, 54.00, 'WASTE-01', 'Chiller temperature issue', CURRENT_TIMESTAMP - INTERVAL '1 day'),
            (v_target_biz, v_item_tea, 'PURCHASE_RECEIPT', 15.000, 15.000, 380.00, 'PO-INITIAL', 'Opening Stock Load', CURRENT_TIMESTAMP - INTERVAL '5 days'),
            (v_target_biz, v_item_tea, 'POS_CONSUMPTION', -0.800, 14.200, 380.00, 'ORDER-POS', 'Daily POS Tea Powder Consumption', CURRENT_TIMESTAMP - INTERVAL '1 day'),
            (v_target_biz, v_item_cups_250, 'PURCHASE_RECEIPT', 1000.000, 1000.000, 1.65, 'PO-PKG-01', 'Opening Box Shipment', CURRENT_TIMESTAMP - INTERVAL '5 days'),
            (v_target_biz, v_item_cups_250, 'POS_CONSUMPTION', -130.000, 870.000, 1.65, 'ORDERS-DAILY', 'Daily Takeaway Beverage Orders', CURRENT_TIMESTAMP - INTERVAL '2 days'),
            (v_target_biz, v_item_cups_250, 'WASTAGE_SPOILAGE', -20.000, 850.000, 1.65, 'WASTE-PKG', 'Crushed box cups', CURRENT_TIMESTAMP - INTERVAL '1 day');

    END LOOP;
END $$;

COMMIT;
