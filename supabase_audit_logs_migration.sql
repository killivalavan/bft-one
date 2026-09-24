-- ==========================================================
-- SEYALPRO — AUDIT LOGGING & PRODUCTION SECURITY MIGRATION
-- ==========================================================

-- 1. Create audit_logs Table
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES public.businesses(id) ON DELETE SET NULL,
    actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    actor_email TEXT NOT NULL,
    action TEXT NOT NULL,
    target_type TEXT,
    target_id TEXT,
    details JSONB DEFAULT '{}'::jsonb,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Indexes for fast reporting and tenant queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_business_id ON public.audit_logs(business_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_email ON public.audit_logs(actor_email);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);

-- 3. Enable RLS
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies:
-- Service role full access
DROP POLICY IF EXISTS "Service role full access on audit_logs" ON public.audit_logs;
CREATE POLICY "Service role full access on audit_logs"
    ON public.audit_logs
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Super Admins can view all audit logs
DROP POLICY IF EXISTS "Super admins can view all audit logs" ON public.audit_logs;
CREATE POLICY "Super admins can view all audit logs"
    ON public.audit_logs
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND (p.is_super_admin = true OR p.email = 'admin@seyalpro.com')
        )
    );

-- Tenant Admins can view only their business's audit logs
DROP POLICY IF EXISTS "Tenant admins can view own business audit logs" ON public.audit_logs;
CREATE POLICY "Tenant admins can view own business audit logs"
    ON public.audit_logs
    FOR SELECT
    TO authenticated
    USING (
        business_id IS NOT NULL AND
        business_id = (
            SELECT p.business_id FROM public.profiles p
            WHERE p.id = auth.uid() AND p.is_admin = true
        )
    );
