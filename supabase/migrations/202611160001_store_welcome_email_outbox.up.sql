-- ==============================================================================
-- COUNTERCUB — STORE ADMIN WELCOME EMAIL OUTBOX & CONTACT EMAIL
-- Migration: 202611160001_store_welcome_email_outbox.up.sql
-- Rollback:  202611160001_store_welcome_email_outbox.down.sql
--
-- Additive migration introducing:
--   1. public.profiles.contact_email (stores real contact email when login uses custom ID)
--   2. public.email_dispatches (idempotent transactional email outbox & delivery log)
--   3. Zero-trust RLS policies & least-privilege grants
-- ==============================================================================

BEGIN;

-- 1. Add contact_email to public.profiles
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS contact_email TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_contact_email
    ON public.profiles (contact_email)
    WHERE contact_email IS NOT NULL;

-- 2. Create idempotent email_dispatches table
CREATE TABLE IF NOT EXISTS public.email_dispatches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key TEXT NOT NULL UNIQUE,
    email_type TEXT NOT NULL DEFAULT 'store_admin_welcome',
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    user_id UUID NULL,
    recipient_email TEXT NOT NULL,
    from_email TEXT NOT NULL,
    reply_to_email TEXT NOT NULL,
    subject TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'sending', 'sent', 'failed')),
    provider TEXT NOT NULL DEFAULT 'resend',
    provider_message_id TEXT NULL,
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    last_error TEXT NULL,
    last_attempted_at TIMESTAMPTZ NULL,
    sent_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
);

CREATE INDEX IF NOT EXISTS idx_email_dispatches_business_status
    ON public.email_dispatches (business_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_dispatches_provider_msg
    ON public.email_dispatches (provider_message_id)
    WHERE provider_message_id IS NOT NULL;

-- 3. Zero-trust RLS & grants (server-only via service_role)
ALTER TABLE public.email_dispatches ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.email_dispatches FROM PUBLIC;
REVOKE ALL ON TABLE public.email_dispatches FROM anon;
REVOKE ALL ON TABLE public.email_dispatches FROM authenticated;
GRANT ALL ON TABLE public.email_dispatches TO service_role;

COMMIT;

