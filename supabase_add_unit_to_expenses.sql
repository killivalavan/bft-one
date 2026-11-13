-- ============================================================================
-- ADD UNIT COLUMN TO EXPENSE PRICE LIST AND DAILY EXPENSES
-- Enables setting units like 'kg', 'pcs', 'each', 'pkt', 'ltr' for products
-- in Fixed Price Items and recording units on daily expense entries.
-- ============================================================================

-- 1. Add unit column to expense_price_list
ALTER TABLE public.expense_price_list 
  ADD COLUMN IF NOT EXISTS unit TEXT DEFAULT 'each';

-- 2. Add unit column to daily_expenses
ALTER TABLE public.daily_expenses 
  ADD COLUMN IF NOT EXISTS unit TEXT DEFAULT 'each';

-- 3. Backfill common units based on existing item names (optional smart seed)
UPDATE public.expense_price_list 
SET unit = 'kg' 
WHERE unit IS NULL AND (item_name ILIKE '%kg%' OR item_name ILIKE '%kilo%');

UPDATE public.expense_price_list 
SET unit = 'pcs' 
WHERE unit IS NULL AND (item_name ILIKE '%pcs%' OR item_name ILIKE '%piece%');

UPDATE public.expense_price_list 
SET unit = 'pkt' 
WHERE unit IS NULL AND (item_name ILIKE '%pkt%' OR item_name ILIKE '%packet%');

UPDATE public.expense_price_list 
SET unit = 'ltr' 
WHERE unit IS NULL AND (item_name ILIKE '%ltr%' OR item_name ILIKE '%litre%' OR item_name ILIKE '%liter%');

UPDATE public.expense_price_list 
SET unit = 'each' 
WHERE unit IS NULL;

-- 4. Backfill existing daily_expenses
UPDATE public.daily_expenses 
SET unit = 'each' 
WHERE unit IS NULL;

-- 5. Create index for fast filtering
CREATE INDEX IF NOT EXISTS idx_expense_price_list_unit 
  ON public.expense_price_list(business_id, unit);

CREATE INDEX IF NOT EXISTS idx_daily_expenses_unit 
  ON public.daily_expenses(business_id, unit);

