-- ==============================================================================
-- SEYALPRO: INVOICES & TAX INVOICE TRACKING MIGRATION
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    invoice_number TEXT NOT NULL,
    title TEXT DEFAULT 'INVOICE',
    invoice_date DATE DEFAULT CURRENT_DATE,
    due_date DATE DEFAULT (CURRENT_DATE + INTERVAL '15 days'),
    customer_name TEXT NOT NULL,
    customer_phone TEXT,
    customer_address TEXT,
    customer_gstin TEXT,
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    subtotal_cents BIGINT NOT NULL DEFAULT 0,
    tax_rate NUMERIC(5, 2) DEFAULT 0,
    tax_cents BIGINT DEFAULT 0,
    tds_cents BIGINT DEFAULT 0,
    discount_cents BIGINT DEFAULT 0,
    additional_cents BIGINT DEFAULT 0,
    total_cents BIGINT NOT NULL DEFAULT 0,
    status TEXT DEFAULT 'unpaid', -- 'paid' | 'unpaid' | 'overdue' | 'cancelled'
    payment_mode TEXT DEFAULT 'UPI',
    notes TEXT,
    bank_details JSONB,
    upi_details JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoices_business ON public.invoices(business_id);
CREATE INDEX IF NOT EXISTS idx_invoices_date ON public.invoices(invoice_date);

-- Enable RLS
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoices_tenant_isolation" ON public.invoices
FOR ALL TO authenticated
USING (
    public.is_super_admin() OR 
    business_id = (SELECT business_id FROM public.profiles WHERE id = auth.uid())
)
WITH CHECK (
    public.is_super_admin() OR 
    business_id = (SELECT business_id FROM public.profiles WHERE id = auth.uid())
);
