-- ==============================================================================
-- BFT ONE / SEYALPRO — EMPLOYEE HUB DATABASE MIGRATION SCRIPT
-- ==============================================================================
-- Run this script in the Supabase SQL Editor:
-- https://supabase.com/dashboard/project/ekwiorjhcwrhrpkovyvl/sql/new
--
-- Strictly NON-DESTRUCTIVE and IDEMPOTENT (safe to execute multiple times).
-- Extends profiles with employee journey details and creates tables for:
-- 1. Employee Increments (salary history & policy)
-- 2. Employee Achievements (data-driven badges)
-- 3. Employee Notice Board (staff announcements)
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. EXTEND PROFILES TABLE WITH EMPLOYEE JOURNEY & INCREMENT METADATA
-- ------------------------------------------------------------------------------
ALTER TABLE public.profiles 
    ADD COLUMN IF NOT EXISTS employee_id TEXT,
    ADD COLUMN IF NOT EXISTS designation TEXT,
    ADD COLUMN IF NOT EXISTS department TEXT,
    ADD COLUMN IF NOT EXISTS date_of_joining DATE,
    ADD COLUMN IF NOT EXISTS joining_salary_cents BIGINT,
    ADD COLUMN IF NOT EXISTS increment_amount_cents BIGINT DEFAULT 200000,
    ADD COLUMN IF NOT EXISTS increment_frequency_months INTEGER DEFAULT 12,
    ADD COLUMN IF NOT EXISTS next_increment_date DATE,
    ADD COLUMN IF NOT EXISTS increment_policy_note TEXT,
    ADD COLUMN IF NOT EXISTS blood_group TEXT;

CREATE INDEX IF NOT EXISTS idx_profiles_employee_id ON public.profiles(employee_id);
CREATE INDEX IF NOT EXISTS idx_profiles_date_of_joining ON public.profiles(date_of_joining);

-- ------------------------------------------------------------------------------
-- 2. CREATE EMPLOYEE INCREMENTS TABLE
-- ------------------------------------------------------------------------------
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
CREATE INDEX IF NOT EXISTS idx_employee_increments_biz ON public.employee_increments(business_id);

-- ------------------------------------------------------------------------------
-- 3. CREATE EMPLOYEE ACHIEVEMENTS TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.employee_achievements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES public.businesses(id),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    badge_key TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT DEFAULT 'milestone',
    achieved_date DATE,
    is_unlocked BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employee_achievements_user ON public.employee_achievements(user_id, is_unlocked);
CREATE INDEX IF NOT EXISTS idx_employee_achievements_biz ON public.employee_achievements(business_id);

-- ------------------------------------------------------------------------------
-- 4. CREATE EMPLOYEE NOTICE BOARD TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.employee_notices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES public.businesses(id),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    priority TEXT DEFAULT 'normal', -- 'urgent' | 'high' | 'normal' | 'low'
    target_audience_type TEXT DEFAULT 'all', -- 'all' | 'role' | 'department' | 'employee'
    target_audience_value TEXT, -- role name, department name, or user email/id
    is_pinned BOOLEAN DEFAULT false,
    expires_at TIMESTAMPTZ,
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employee_notices_biz ON public.employee_notices(business_id, is_pinned, created_at DESC);

-- ------------------------------------------------------------------------------
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- ------------------------------------------------------------------------------
ALTER TABLE public.employee_increments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_notices ENABLE ROW LEVEL SECURITY;

-- 5.1 Increments RLS: Users can view their own, Admins can view/manage all in their tenant
DROP POLICY IF EXISTS "increments_select_own_or_admin" ON public.employee_increments;
CREATE POLICY "increments_select_own_or_admin" ON public.employee_increments
FOR SELECT TO authenticated
USING (
    user_id = auth.uid() 
    OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid()) = true
    OR (SELECT is_super_admin FROM public.profiles WHERE id = auth.uid()) = true
);

DROP POLICY IF EXISTS "increments_admin_manage" ON public.employee_increments;
CREATE POLICY "increments_admin_manage" ON public.employee_increments
FOR ALL TO authenticated
USING (
    (SELECT is_admin FROM public.profiles WHERE id = auth.uid()) = true
    OR (SELECT is_super_admin FROM public.profiles WHERE id = auth.uid()) = true
);

-- 5.2 Achievements RLS: Users can view their own, Admins can view/manage all in their tenant
DROP POLICY IF EXISTS "achievements_select_own_or_admin" ON public.employee_achievements;
CREATE POLICY "achievements_select_own_or_admin" ON public.employee_achievements
FOR SELECT TO authenticated
USING (
    user_id = auth.uid() 
    OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid()) = true
    OR (SELECT is_super_admin FROM public.profiles WHERE id = auth.uid()) = true
);

DROP POLICY IF EXISTS "achievements_admin_manage" ON public.employee_achievements;
CREATE POLICY "achievements_admin_manage" ON public.employee_achievements
FOR ALL TO authenticated
USING (
    (SELECT is_admin FROM public.profiles WHERE id = auth.uid()) = true
    OR (SELECT is_super_admin FROM public.profiles WHERE id = auth.uid()) = true
);

-- 5.3 Notice Board RLS: Authenticated users can view active notices for their tenant
DROP POLICY IF EXISTS "notices_select_tenant" ON public.employee_notices;
CREATE POLICY "notices_select_tenant" ON public.employee_notices
FOR SELECT TO authenticated
USING (
    (business_id = public.get_current_business_id() OR (SELECT is_super_admin FROM public.profiles WHERE id = auth.uid()) = true)
);

DROP POLICY IF EXISTS "notices_admin_manage" ON public.employee_notices;
CREATE POLICY "notices_admin_manage" ON public.employee_notices
FOR ALL TO authenticated
USING (
    (SELECT is_admin FROM public.profiles WHERE id = auth.uid()) = true
    OR (SELECT is_super_admin FROM public.profiles WHERE id = auth.uid()) = true
);

-- ------------------------------------------------------------------------------
-- 6. INITIAL BACKFILL & SEEDING (SAMPLE DATA TO MAKE HUB IMMEDIATELY VIBRANT)
-- ------------------------------------------------------------------------------

-- Backfill Vasanth Kumar (vasanth@bft.com) with exemplary employee profile
UPDATE public.profiles
SET 
    full_name = COALESCE(full_name, 'Vasanth Kumar'),
    employee_id = COALESCE(employee_id, 'BFT-101'),
    designation = COALESCE(designation, 'Senior Barista & Shift Lead'),
    department = COALESCE(department, 'Beverage & Operations'),
    date_of_joining = COALESCE(date_of_joining, '2022-06-14'),
    joining_salary_cents = COALESCE(joining_salary_cents, 1500000), -- Joined at ₹15,000
    base_salary_cents = COALESCE(base_salary_cents, 2100000),       -- Current ₹21,000
    increment_amount_cents = COALESCE(increment_amount_cents, 200000), -- ₹2,000 yearly
    increment_frequency_months = COALESCE(increment_frequency_months, 12),
    next_increment_date = COALESCE(next_increment_date, '2027-06-14'),
    increment_policy_note = COALESCE(increment_policy_note, 'Standard annual performance appraisal (+₹2,000 / yr)')
WHERE email = 'vasanth@bft.com';

-- Backfill Muthamil (muthamil@bft.com)
UPDATE public.profiles
SET 
    full_name = COALESCE(full_name, 'Muthamil Selvan'),
    employee_id = COALESCE(employee_id, 'BFT-102'),
    designation = COALESCE(designation, 'Floor Supervisor'),
    department = COALESCE(department, 'Store Operations'),
    date_of_joining = COALESCE(date_of_joining, '2023-02-10'),
    joining_salary_cents = COALESCE(joining_salary_cents, 1000000),
    increment_amount_cents = COALESCE(increment_amount_cents, 200000),
    increment_frequency_months = COALESCE(increment_frequency_months, 12),
    next_increment_date = COALESCE(next_increment_date, '2027-02-10')
WHERE email = 'muthamil@bft.com';

-- Backfill Joel (joel@bft.com)
UPDATE public.profiles
SET 
    full_name = COALESCE(full_name, 'Joel Mathew'),
    employee_id = COALESCE(employee_id, 'BFT-103'),
    designation = COALESCE(designation, 'Service Specialist'),
    department = COALESCE(department, 'Customer Experience'),
    date_of_joining = COALESCE(date_of_joining, '2023-12-09'),
    joining_salary_cents = COALESCE(joining_salary_cents, 1000000),
    increment_amount_cents = COALESCE(increment_amount_cents, 200000),
    increment_frequency_months = COALESCE(increment_frequency_months, 12),
    next_increment_date = COALESCE(next_increment_date, '2026-12-09')
WHERE email = 'joel@bft.com';

-- Backfill default joining dates for remaining non-admin profiles if null
UPDATE public.profiles
SET 
    date_of_joining = COALESCE(date_of_joining, created_at::DATE),
    joining_salary_cents = COALESCE(joining_salary_cents, base_salary_cents, 1200000),
    designation = COALESCE(designation, 'Operations Executive'),
    department = COALESCE(department, 'Store Operations'),
    increment_amount_cents = COALESCE(increment_amount_cents, 200000),
    increment_frequency_months = COALESCE(increment_frequency_months, 12),
    next_increment_date = COALESCE(next_increment_date, (created_at::DATE + INTERVAL '1 year')::DATE)
WHERE is_admin = false AND date_of_joining IS NULL;

-- 6.1 Seed Sample Increments for Vasanth (to showcase increment history)
INSERT INTO public.employee_increments (business_id, user_id, effective_date, previous_salary_cents, new_salary_cents, increment_amount_cents, reason, approved_by)
SELECT 
    p.business_id,
    p.id,
    '2023-06-14',
    1500000,
    1700000,
    200000,
    '1 Year Milestone Appraisal (+₹2,000)',
    'Store Administrator'
FROM public.profiles p WHERE p.email = 'vasanth@bft.com'
AND NOT EXISTS (SELECT 1 FROM public.employee_increments WHERE user_id = p.id AND effective_date = '2023-06-14');

INSERT INTO public.employee_increments (business_id, user_id, effective_date, previous_salary_cents, new_salary_cents, increment_amount_cents, reason, approved_by)
SELECT 
    p.business_id,
    p.id,
    '2024-06-14',
    1700000,
    1900000,
    200000,
    'Annual Service Increment (+₹2,000)',
    'Store Administrator'
FROM public.profiles p WHERE p.email = 'vasanth@bft.com'
AND NOT EXISTS (SELECT 1 FROM public.employee_increments WHERE user_id = p.id AND effective_date = '2024-06-14');

INSERT INTO public.employee_increments (business_id, user_id, effective_date, previous_salary_cents, new_salary_cents, increment_amount_cents, reason, approved_by)
SELECT 
    p.business_id,
    p.id,
    '2025-06-14',
    1900000,
    2100000,
    200000,
    '3 Years Milestone Performance Increment (+₹2,000)',
    'Store Administrator'
FROM public.profiles p WHERE p.email = 'vasanth@bft.com'
AND NOT EXISTS (SELECT 1 FROM public.employee_increments WHERE user_id = p.id AND effective_date = '2025-06-14');

-- 6.2 Seed Sample Achievements for Vasanth
INSERT INTO public.employee_achievements (business_id, user_id, badge_key, title, description, category, achieved_date, is_unlocked)
SELECT p.business_id, p.id, 'first_year', 'First Year Milestone', 'Completed 1 full year of dedicated service.', 'tenure', '2023-06-14', true
FROM public.profiles p WHERE p.email = 'vasanth@bft.com'
AND NOT EXISTS (SELECT 1 FROM public.employee_achievements WHERE user_id = p.id AND badge_key = 'first_year');

INSERT INTO public.employee_achievements (business_id, user_id, badge_key, title, description, category, achieved_date, is_unlocked)
SELECT p.business_id, p.id, 'three_years', '3 Years Completed', 'Consistently contributing to store excellence for 3 years.', 'tenure', '2025-06-14', true
FROM public.profiles p WHERE p.email = 'vasanth@bft.com'
AND NOT EXISTS (SELECT 1 FROM public.employee_achievements WHERE user_id = p.id AND badge_key = 'three_years');

INSERT INTO public.employee_achievements (business_id, user_id, badge_key, title, description, category, achieved_date, is_unlocked)
SELECT p.business_id, p.id, 'outstanding_attendance', 'Outstanding Attendance', 'Zero late check-ins for 3 consecutive months.', 'excellence', '2026-03-01', true
FROM public.profiles p WHERE p.email = 'vasanth@bft.com'
AND NOT EXISTS (SELECT 1 FROM public.employee_achievements WHERE user_id = p.id AND badge_key = 'outstanding_attendance');

INSERT INTO public.employee_achievements (business_id, user_id, badge_key, title, description, category, achieved_date, is_unlocked)
SELECT p.business_id, p.id, 'five_years', '5 Year Milestone', 'Half a decade of loyalty and leadership.', 'tenure', NULL, false
FROM public.profiles p WHERE p.email = 'vasanth@bft.com'
AND NOT EXISTS (SELECT 1 FROM public.employee_achievements WHERE user_id = p.id AND badge_key = 'five_years');

INSERT INTO public.employee_achievements (business_id, user_id, badge_key, title, description, category, achieved_date, is_unlocked)
SELECT p.business_id, p.id, 'ten_years', '10 Year Legend', 'A full decade of building the company.', 'tenure', NULL, false
FROM public.profiles p WHERE p.email = 'vasanth@bft.com'
AND NOT EXISTS (SELECT 1 FROM public.employee_achievements WHERE user_id = p.id AND badge_key = 'ten_years');

-- 6.3 Seed Default Notice Board Announcements
INSERT INTO public.employee_notices (business_id, title, message, priority, target_audience_type, is_pinned)
SELECT 
    'a0000000-0000-0000-0000-000000000001',
    'Festival Announcement',
    'Festival bonus will be credited along with this month''s salary cycle. Thank you all for your extraordinary dedication and hard work!',
    'high',
    'all',
    true
WHERE NOT EXISTS (SELECT 1 FROM public.employee_notices WHERE title = 'Festival Announcement');

INSERT INTO public.employee_notices (business_id, title, message, priority, target_audience_type, is_pinned)
SELECT 
    'a0000000-0000-0000-0000-000000000001',
    'Important Notice: Tomorrow Store Opening',
    'Tomorrow''s store opening briefing will be held promptly at 8:00 AM. Please ensure on-time attendance.',
    'urgent',
    'all',
    false
WHERE NOT EXISTS (SELECT 1 FROM public.employee_notices WHERE title = 'Important Notice: Tomorrow Store Opening');

INSERT INTO public.employee_notices (business_id, title, message, priority, target_audience_type, is_pinned)
SELECT 
    'a0000000-0000-0000-0000-000000000001',
    'Monthly Staff Sync & Review',
    'Monthly all-hands staff meeting is scheduled for Friday at 5:30 PM in the break room. Refreshments will be served.',
    'normal',
    'all',
    false
WHERE NOT EXISTS (SELECT 1 FROM public.employee_notices WHERE title = 'Monthly Staff Sync & Review');

COMMIT;
