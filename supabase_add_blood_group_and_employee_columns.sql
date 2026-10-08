-- ==============================================================================
-- BFT ONE — ADD BLOOD GROUP & EMPLOYEE HUB COLUMNS
-- ==============================================================================
-- Run this script in your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/ekwiorjhcwrhrpkovyvl/sql/new
--
-- This script safely adds the blood_group column and employee journey columns
-- to the profiles table, and creates the employee_increments, employee_achievements,
-- and employee_notices tables if they don't already exist.
-- ==============================================================================

-- 1. ADD FIRST NAME, LAST NAME, AADHAAR, BLOOD GROUP & EMPLOYEE COLUMNS TO PROFILES
ALTER TABLE public.profiles 
    ADD COLUMN IF NOT EXISTS first_name TEXT,
    ADD COLUMN IF NOT EXISTS last_name TEXT,
    ADD COLUMN IF NOT EXISTS aadhaar_number TEXT,
    ADD COLUMN IF NOT EXISTS blood_group TEXT,
    ADD COLUMN IF NOT EXISTS employee_id TEXT,
    ADD COLUMN IF NOT EXISTS designation TEXT,
    ADD COLUMN IF NOT EXISTS department TEXT,
    ADD COLUMN IF NOT EXISTS date_of_joining DATE,
    ADD COLUMN IF NOT EXISTS joining_salary_cents BIGINT,
    ADD COLUMN IF NOT EXISTS increment_amount_cents BIGINT DEFAULT 200000,
    ADD COLUMN IF NOT EXISTS increment_frequency_months INTEGER DEFAULT 12,
    ADD COLUMN IF NOT EXISTS next_increment_date DATE,
    ADD COLUMN IF NOT EXISTS increment_policy_note TEXT;

CREATE INDEX IF NOT EXISTS idx_profiles_employee_id ON public.profiles(employee_id);
CREATE INDEX IF NOT EXISTS idx_profiles_blood_group ON public.profiles(blood_group);
CREATE INDEX IF NOT EXISTS idx_profiles_first_name ON public.profiles(first_name);

-- Multi-Tenant Protection: Employee ID must be unique per store (each business can have its own EMP-001 without collision)
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_business_employee_id 
    ON public.profiles(business_id, employee_id) 
    WHERE employee_id IS NOT NULL AND employee_id != '';

-- Backfill first_name and last_name from existing full_name if first_name is empty
UPDATE public.profiles
SET 
    first_name = COALESCE(first_name, NULLIF(split_part(full_name, ' ', 1), '')),
    last_name = COALESCE(last_name, NULLIF(trim(substr(full_name, length(split_part(full_name, ' ', 1)) + 1)), ''))
WHERE full_name IS NOT NULL AND first_name IS NULL;

-- 2. CREATE EMPLOYEE INCREMENTS TABLE
CREATE TABLE IF NOT EXISTS public.employee_increments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES public.businesses(id),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    effective_date DATE NOT NULL,
    previous_salary_cents BIGINT,
    new_salary_cents BIGINT NOT NULL,
    increment_amount_cents BIGINT NOT NULL,
    reason TEXT,
    approved_by TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employee_increments_user ON public.employee_increments(user_id, effective_date DESC);

-- 3. CREATE EMPLOYEE ACHIEVEMENTS TABLE
CREATE TABLE IF NOT EXISTS public.employee_achievements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES public.businesses(id),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    badge_key TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT DEFAULT 'milestone',
    achieved_date DATE DEFAULT CURRENT_DATE,
    is_unlocked BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, badge_key)
);

CREATE INDEX IF NOT EXISTS idx_employee_achievements_user ON public.employee_achievements(user_id);

-- 4. CREATE EMPLOYEE NOTICES TABLE
CREATE TABLE IF NOT EXISTS public.employee_notices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES public.businesses(id),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    priority TEXT DEFAULT 'normal',
    target_audience_type TEXT DEFAULT 'all',
    target_audience_value TEXT,
    is_pinned BOOLEAN DEFAULT false,
    expires_at TIMESTAMPTZ,
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.employee_increments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_notices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "increments_select_all" ON public.employee_increments;
CREATE POLICY "increments_select_all" ON public.employee_increments FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "increments_all_admin" ON public.employee_increments;
CREATE POLICY "increments_all_admin" ON public.employee_increments FOR ALL TO authenticated USING (true);

DROP POLICY IF EXISTS "achievements_select_all" ON public.employee_achievements;
CREATE POLICY "achievements_select_all" ON public.employee_achievements FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "achievements_all_admin" ON public.employee_achievements;
CREATE POLICY "achievements_all_admin" ON public.employee_achievements FOR ALL TO authenticated USING (true);

DROP POLICY IF EXISTS "notices_select_all" ON public.employee_notices;
CREATE POLICY "notices_select_all" ON public.employee_notices FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "notices_all_admin" ON public.employee_notices;
CREATE POLICY "notices_all_admin" ON public.employee_notices FOR ALL TO authenticated USING (true);

-- 6. EXTEND SALARY SETTLEMENTS (TRACK SETTLED AMOUNT, CARRY FORWARD & PAYMENT METHOD)
ALTER TABLE public.salary_settlements 
    ADD COLUMN IF NOT EXISTS settled_amount_cents BIGINT,
    ADD COLUMN IF NOT EXISTS carry_forward_cents BIGINT,
    ADD COLUMN IF NOT EXISTS payment_mode TEXT,
    ADD COLUMN IF NOT EXISTS notes TEXT,
    ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ DEFAULT now();
