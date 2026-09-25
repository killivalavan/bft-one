-- ==============================================================================
-- SEYALPRO — SUPPORT TICKETS & BUG REPORTING SCHEMA
-- Run this in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/ekwiorjhcwrhrpkovyvl/sql/new
-- ==============================================================================

BEGIN;

-- 1. Create Support Tickets Table
CREATE TABLE IF NOT EXISTS public.support_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_number TEXT NOT NULL DEFAULT ('SP-' || LPAD(FLOOR(RANDOM() * 90000 + 10000)::TEXT, 5, '0')),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    created_by_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    creator_email TEXT NOT NULL,
    creator_name TEXT,
    title TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'bug',
    priority TEXT NOT NULL DEFAULT 'medium',
    status TEXT NOT NULL DEFAULT 'open',
    description TEXT NOT NULL,
    attachment_url TEXT,
    resolution_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_support_tickets_business_id ON public.support_tickets(business_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON public.support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created_at ON public.support_tickets(created_at DESC);

-- 3. Enable Row-Level Security
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

-- 4. Clean up legacy policies if any
DROP POLICY IF EXISTS support_tickets_select ON public.support_tickets;
DROP POLICY IF EXISTS support_tickets_insert ON public.support_tickets;
DROP POLICY IF EXISTS support_tickets_update ON public.support_tickets;
DROP POLICY IF EXISTS support_tickets_delete ON public.support_tickets;

-- 5. Strict Tenant Isolation Policies
-- Store Admin/Staff can view tickets belonging to their business; Super Admin sees all
CREATE POLICY support_tickets_select ON public.support_tickets
FOR SELECT TO authenticated
USING (
    business_id = public.get_current_business_id()
    OR public.is_super_admin()
);

-- Authenticated users can insert tickets for their business
CREATE POLICY support_tickets_insert ON public.support_tickets
FOR INSERT TO authenticated
WITH CHECK (
    business_id = public.get_current_business_id()
    OR public.is_super_admin()
);

-- Super Admins can update status, notes, or tickets
CREATE POLICY support_tickets_update ON public.support_tickets
FOR UPDATE TO authenticated
USING (
    business_id = public.get_current_business_id()
    OR public.is_super_admin()
)
WITH CHECK (
    business_id = public.get_current_business_id()
    OR public.is_super_admin()
);

-- Super Admins can delete tickets
CREATE POLICY support_tickets_delete ON public.support_tickets
FOR DELETE TO authenticated
USING (public.is_super_admin());

COMMIT;
