-- ==============================================================================
-- B2B CLIENTS / CAFÉ CUSTOMERS MIGRATION
-- ==============================================================================
-- Run this script in the Supabase SQL Editor:
-- https://supabase.com/dashboard/project/ekwiorjhcwrhrpkovyvl/sql/new
--
-- This script creates a dedicated, tenant-isolated table for B2B clients
-- ensuring newly added clients sync seamlessly across all devices, incognito,
-- and mobile sessions.
-- ==============================================================================

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

-- Index for tenant lookups
CREATE INDEX IF NOT EXISTS idx_b2b_clients_business_id ON public.b2b_clients(business_id);
CREATE INDEX IF NOT EXISTS idx_b2b_clients_created_at ON public.b2b_clients(created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE public.b2b_clients ENABLE ROW LEVEL SECURITY;

-- Tenant Isolation Policies
DROP POLICY IF EXISTS "b2b_clients_tenant_isolation" ON public.b2b_clients;
CREATE POLICY "b2b_clients_tenant_isolation" ON public.b2b_clients
FOR ALL TO authenticated
USING (
    public.is_super_admin() OR 
    business_id = (SELECT business_id FROM public.profiles WHERE id = auth.uid())
)
WITH CHECK (
    public.is_super_admin() OR 
    business_id = (SELECT business_id FROM public.profiles WHERE id = auth.uid())
);
