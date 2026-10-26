-- ==============================================================================
-- SEYALPRO — UNIFIED PLATFORM DATA ARCHITECTURE MIGRATION SCRIPT
-- ==============================================================================
-- Run this script in the Supabase SQL Editor:
-- https://supabase.com/dashboard/project/ekwiorjhcwrhrpkovyvl/sql/new
--
-- This script is NON-DESTRUCTIVE and IDEMPOTENT (safe to run multiple times).
-- It establishes dedicated, tenant-isolated relational tables for both Cafe POS
-- and B2B Supply modules, with Row Level Security (RLS) policies.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. UNIVERSAL INVOICES TABLE (CAFE POS TAX INVOICES & B2B DELIVERY INVOICES)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.invoices (
    id TEXT PRIMARY KEY,
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    invoice_number TEXT NOT NULL,
    title TEXT DEFAULT 'TAX INVOICE',
    date DATE DEFAULT CURRENT_DATE,
    due_date DATE DEFAULT (CURRENT_DATE + INTERVAL '15 days'),
    customer_name TEXT NOT NULL,
    customer_phone TEXT,
    customer_address TEXT,
    customer_gstin TEXT,
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
    tax_rate NUMERIC(5, 2) DEFAULT 0,
    tax_amount NUMERIC(12, 2) DEFAULT 0,
    tds_amount NUMERIC(12, 2) DEFAULT 0,
    discount_amount NUMERIC(12, 2) DEFAULT 0,
    total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    paid_amount NUMERIC(12, 2) DEFAULT 0,
    balance_due NUMERIC(12, 2) DEFAULT 0,
    status TEXT DEFAULT 'pending', -- 'paid' | 'pending' | 'partial' | 'overdue' | 'cancelled'
    payment_mode TEXT DEFAULT 'UPI',
    notes TEXT,
    bank_details JSONB,
    upi_details JSONB,
    source TEXT DEFAULT 'cafe_pos', -- 'cafe_pos' | 'b2b_dispatch'
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoices_biz_date ON public.invoices(business_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_number ON public.invoices(business_id, invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(business_id, status);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoices_tenant_isolation" ON public.invoices;
CREATE POLICY "invoices_tenant_isolation" ON public.invoices
FOR ALL TO authenticated
USING (
    public.is_super_admin() OR 
    business_id = public.get_current_business_id()
)
WITH CHECK (
    public.is_super_admin() OR 
    business_id = public.get_current_business_id()
);

-- ------------------------------------------------------------------------------
-- 2. B2B DISPATCHES / DELIVERY SLIPS (WITH RETURN INTAKE TRACKING)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.b2b_dispatches (
    id TEXT PRIMARY KEY,
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    slip_number TEXT NOT NULL,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE,
    client_id TEXT NOT NULL,
    client_name TEXT NOT NULL,
    client_phone TEXT,
    client_address TEXT,
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
    tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    paid_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    balance_due NUMERIC(12, 2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'paid' | 'partial'
    delivery_status TEXT DEFAULT 'dispatched', -- 'dispatched' | 'delivered' | 'returned'
    notes TEXT,
    vehicle_no TEXT,
    driver_name TEXT,
    driver_phone TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_b2b_dispatches_biz_date ON public.b2b_dispatches(business_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_b2b_dispatches_client ON public.b2b_dispatches(business_id, client_id);
CREATE INDEX IF NOT EXISTS idx_b2b_dispatches_status ON public.b2b_dispatches(business_id, status);

ALTER TABLE public.b2b_dispatches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "b2b_dispatches_tenant_isolation" ON public.b2b_dispatches;
CREATE POLICY "b2b_dispatches_tenant_isolation" ON public.b2b_dispatches
FOR ALL TO authenticated
USING (
    public.is_super_admin() OR 
    business_id = public.get_current_business_id()
)
WITH CHECK (
    public.is_super_admin() OR 
    business_id = public.get_current_business_id()
);

-- ------------------------------------------------------------------------------
-- 3. B2B WHOLESALE PRODUCTS CATALOG
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.b2b_products (
    id TEXT PRIMARY KEY,
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    rate NUMERIC(12, 2) NOT NULL DEFAULT 0,
    selling_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
    making_cost NUMERIC(12, 2) NOT NULL DEFAULT 0,
    unit_profit NUMERIC(12, 2) NOT NULL DEFAULT 0,
    profit_margin_pct NUMERIC(6, 2) NOT NULL DEFAULT 0,
    unit TEXT NOT NULL DEFAULT 'Unit',
    is_active BOOLEAN NOT NULL DEFAULT true,
    min_order_qty INTEGER DEFAULT 1,
    stock_available INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_b2b_products_biz_cat ON public.b2b_products(business_id, category);

ALTER TABLE public.b2b_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "b2b_products_tenant_isolation" ON public.b2b_products;
CREATE POLICY "b2b_products_tenant_isolation" ON public.b2b_products
FOR ALL TO authenticated
USING (
    public.is_super_admin() OR 
    business_id = public.get_current_business_id()
)
WITH CHECK (
    public.is_super_admin() OR 
    business_id = public.get_current_business_id()
);

-- ------------------------------------------------------------------------------
-- 4. B2B PAYMENT TRANSACTIONS & ALLOCATIONS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.b2b_payments (
    id TEXT PRIMARY KEY,
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    client_id TEXT NOT NULL,
    client_name TEXT NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    payment_method TEXT NOT NULL DEFAULT 'UPI', -- 'UPI' | 'NEFT' | 'Cash' | 'Cheque'
    reference_no TEXT,
    notes TEXT,
    allocated_slips JSONB DEFAULT '[]'::jsonb,
    recorded_by TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_b2b_payments_biz_date ON public.b2b_payments(business_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_b2b_payments_client ON public.b2b_payments(business_id, client_id);

ALTER TABLE public.b2b_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "b2b_payments_tenant_isolation" ON public.b2b_payments;
CREATE POLICY "b2b_payments_tenant_isolation" ON public.b2b_payments
FOR ALL TO authenticated
USING (
    public.is_super_admin() OR 
    business_id = public.get_current_business_id()
)
WITH CHECK (
    public.is_super_admin() OR 
    business_id = public.get_current_business_id()
);

-- ------------------------------------------------------------------------------
-- 5. B2B BAKERY OPERATIONAL EXPENSES
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.b2b_expenses (
    id TEXT PRIMARY KEY,
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_b2b_expenses_biz_date ON public.b2b_expenses(business_id, date DESC);

ALTER TABLE public.b2b_expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "b2b_expenses_tenant_isolation" ON public.b2b_expenses;
CREATE POLICY "b2b_expenses_tenant_isolation" ON public.b2b_expenses
FOR ALL TO authenticated
USING (
    public.is_super_admin() OR 
    business_id = public.get_current_business_id()
)
WITH CHECK (
    public.is_super_admin() OR 
    business_id = public.get_current_business_id()
);

-- ------------------------------------------------------------------------------
-- 6. B2B BROADCAST NOTIFICATIONS & ADVISORIES
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.b2b_broadcasts (
    id TEXT PRIMARY KEY,
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'general',
    priority TEXT NOT NULL DEFAULT 'normal', -- 'normal' | 'urgent'
    target_stores JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_b2b_broadcasts_biz ON public.b2b_broadcasts(business_id, created_at DESC);

ALTER TABLE public.b2b_broadcasts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "b2b_broadcasts_tenant_isolation" ON public.b2b_broadcasts;
CREATE POLICY "b2b_broadcasts_tenant_isolation" ON public.b2b_broadcasts
FOR ALL TO authenticated
USING (
    public.is_super_admin() OR 
    business_id = public.get_current_business_id()
)
WITH CHECK (
    public.is_super_admin() OR 
    business_id = public.get_current_business_id()
);

-- ------------------------------------------------------------------------------
-- 7. B2B PARTNER STORES / CLIENTS TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.b2b_clients (
    id TEXT PRIMARY KEY,
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT,
    address TEXT,
    linked_business_id UUID REFERENCES public.businesses(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_b2b_clients_biz ON public.b2b_clients(business_id);

ALTER TABLE public.b2b_clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "b2b_clients_tenant_isolation" ON public.b2b_clients;
CREATE POLICY "b2b_clients_tenant_isolation" ON public.b2b_clients
FOR ALL TO authenticated
USING (
    public.is_super_admin() OR 
    business_id = public.get_current_business_id()
)
WITH CHECK (
    public.is_super_admin() OR 
    business_id = public.get_current_business_id()
);

COMMIT;
