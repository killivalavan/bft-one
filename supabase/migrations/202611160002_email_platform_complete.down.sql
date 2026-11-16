-- ==============================================================================
-- COUNTERCUB — ROLLBACK COMPLETE EMAIL PLATFORM MIGRATION
-- Rollback: 202611160002_email_platform_complete.down.sql
-- ==============================================================================

BEGIN;

DROP POLICY IF EXISTS "store_admin_manage_own_marketing_prefs" ON public.marketing_preferences;
DROP TABLE IF EXISTS public.email_campaigns;
DROP TABLE IF EXISTS public.marketing_preferences;
DROP TABLE IF EXISTS public.email_webhook_events;
DROP TABLE IF EXISTS public.email_settings;
DROP TABLE IF EXISTS public.email_templates;

DROP INDEX IF EXISTS public.idx_email_dispatches_category_created;
DROP INDEX IF EXISTS public.idx_email_dispatches_expiry_cycle;
DROP INDEX IF EXISTS public.idx_email_dispatches_scheduled_queue;

ALTER TABLE public.email_dispatches
    DROP CONSTRAINT IF EXISTS email_dispatches_status_check;

ALTER TABLE public.email_dispatches
    ADD CONSTRAINT email_dispatches_status_check
    CHECK (status IN ('queued', 'sending', 'sent', 'failed'));

ALTER TABLE public.email_dispatches
    DROP COLUMN IF EXISTS next_retry_at,
    DROP COLUMN IF EXISTS complained_at,
    DROP COLUMN IF EXISTS bounced_at,
    DROP COLUMN IF EXISTS delivered_at,
    DROP COLUMN IF EXISTS cancel_reason,
    DROP COLUMN IF EXISTS cancelled_at,
    DROP COLUMN IF EXISTS campaign_id,
    DROP COLUMN IF EXISTS expiry_cycle_key,
    DROP COLUMN IF EXISTS scheduled_for,
    DROP COLUMN IF EXISTS category,
    DROP COLUMN IF EXISTS priority;

COMMIT;

