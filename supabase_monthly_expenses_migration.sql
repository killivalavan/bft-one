-- ============================================================
-- Fixed Recurring Monthly Expenses Table Migration
-- Stores master recurring fixed overheads: Rent, Salary, EB electricity, Internet, Water, etc.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.monthly_expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
    category TEXT NOT NULL,               -- e.g. 'Rent', 'Salary', 'Electricity', 'Water', 'Internet', 'Insurance', 'Maintenance', 'Other'
    item_name TEXT NOT NULL,              -- e.g. 'Shop Rent', 'Head Chef Salary', 'EB Bill - Main Meter'
    amount_cents INTEGER NOT NULL DEFAULT 0,
    previous_amount_cents INTEGER,        -- tracks previous price when updated
    is_active BOOLEAN NOT NULL DEFAULT true,
    expense_month TEXT,                   -- optional: if null, applies recurringly to all months
    notes TEXT,                           -- e.g. 'Due 5th of every month', 'Meter #4021'
    submitted_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ
);

-- In case table already exists with NOT NULL on expense_month:
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'monthly_expenses' AND column_name = 'expense_month'
    ) THEN
        ALTER TABLE public.monthly_expenses ALTER COLUMN expense_month DROP NOT NULL;
    END IF;
END $$;

ALTER TABLE public.monthly_expenses ADD COLUMN IF NOT EXISTS previous_amount_cents INTEGER;
ALTER TABLE public.monthly_expenses ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Index for fast lookups by business + active status
CREATE INDEX IF NOT EXISTS idx_monthly_expenses_business_active
    ON public.monthly_expenses(business_id, is_active);

-- Enable Row Level Security (RLS)
ALTER TABLE public.monthly_expenses ENABLE ROW LEVEL SECURITY;

-- Clean up existing policies if any
DROP POLICY IF EXISTS "monthly_expenses_admin_all" ON public.monthly_expenses;
DROP POLICY IF EXISTS "monthly_expenses_read_all_users" ON public.monthly_expenses;

-- Admins can insert, update, delete, view
CREATE POLICY "monthly_expenses_admin_all" ON public.monthly_expenses
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.is_admin = true
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.is_admin = true
        )
    );

-- Read access
CREATE POLICY "monthly_expenses_read_all_users" ON public.monthly_expenses
    FOR SELECT
    USING (true);

-- Reload PostgREST schema cache immediately
NOTIFY pgrst, 'reload schema';
