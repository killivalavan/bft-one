-- ==============================================================================
-- COUNTERCUB — ROLLBACK STORE ADMIN WELCOME EMAIL OUTBOX & CONTACT EMAIL
-- Rollback:  202611160001_store_welcome_email_outbox.down.sql
-- ==============================================================================

BEGIN;

DROP TABLE IF EXISTS public.email_dispatches;

DROP INDEX IF EXISTS public.idx_profiles_contact_email;

ALTER TABLE public.profiles
    DROP COLUMN IF EXISTS contact_email;

COMMIT;

