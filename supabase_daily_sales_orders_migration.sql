-- ============================================================================
-- DAILY SALES & ENHANCED POS ORDERS SCHEMA ENHANCEMENT
-- Adds granular order metadata (payment mode, customer info, taxes, subtotal)
-- to allow high-fidelity itemized daily sales & revenue intelligence.
-- ============================================================================

-- 1. Enhance public.orders with detailed checkout columns
ALTER TABLE public.orders 
  ADD COLUMN IF NOT EXISTS payment_mode TEXT DEFAULT 'cash',
  ADD COLUMN IF NOT EXISTS customer_name TEXT,
  ADD COLUMN IF NOT EXISTS customer_phone TEXT,
  ADD COLUMN IF NOT EXISTS table_number TEXT,
  ADD COLUMN IF NOT EXISTS subtotal_cents BIGINT,
  ADD COLUMN IF NOT EXISTS tax_cents BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_cents BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- 2. Enhance indexes for rapid daily range queries & multi-tenant isolation
CREATE INDEX IF NOT EXISTS idx_orders_biz_created 
  ON public.orders(business_id, created_at);

CREATE INDEX IF NOT EXISTS idx_orders_biz_status_created 
  ON public.orders(business_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_order_items_order_prod 
  ON public.order_items(order_id, product_id);

-- 3. Ensure order_items business_id is backfilled
UPDATE public.order_items oi
SET business_id = o.business_id
FROM public.orders o
WHERE oi.order_id = o.id AND oi.business_id IS NULL AND o.business_id IS NOT NULL;
