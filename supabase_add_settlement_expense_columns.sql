-- ============================================================================
-- CASH SETTLEMENT WITH DAILY EXPENSES MIGRATION
-- Adds granular drawer cash and daily expense snapshot columns to daily_sales
-- to preserve physical cash drawer closing vs paid daily expenses vouchers.
-- ============================================================================

-- 1. Add drawer_cash_cents and daily_expense_cents columns
ALTER TABLE public.daily_sales 
  ADD COLUMN IF NOT EXISTS drawer_cash_cents BIGINT,
  ADD COLUMN IF NOT EXISTS daily_expense_cents BIGINT DEFAULT 0;

-- 2. Backfill existing records: set drawer_cash_cents equal to total_cash_cents
UPDATE public.daily_sales 
SET drawer_cash_cents = total_cash_cents 
WHERE drawer_cash_cents IS NULL AND total_cash_cents IS NOT NULL;

-- 3. Enhance index for rapid date and store queries
CREATE INDEX IF NOT EXISTS idx_daily_sales_biz_date_drawer 
  ON public.daily_sales(business_id, sale_date, drawer_cash_cents);

