-- ==============================================================================
-- COUNTERCUB — COMPLETE EMAIL NOTIFICATION, SCHEDULER, CAMPAIGNS & WEBHOOKS
-- Migration: 202611160002_email_platform_complete.up.sql
-- Rollback:  202611160002_email_platform_complete.down.sql
--
-- Additive migration extending Phase 1 (public.email_dispatches) and adding:
--   1. Priority, category, scheduling, expiry_cycle_key, campaign_id, cancellation on email_dispatches
--   2. public.email_templates (with mandatory P0 protection)
--   3. public.email_settings (singleton platform email & usage protection config)
--   4. public.email_webhook_events (deduplicated Resend/Svix webhook log)
--   5. public.marketing_preferences (explicit opt-in & unsubscribe suppression)
--   6. public.email_campaigns (Super Admin marketing campaigns & broadcasts)
--   7. Zero-trust RLS & least-privilege grants
-- ==============================================================================

BEGIN;

-- 1. Extend public.email_dispatches (Phase 1 table)
ALTER TABLE public.email_dispatches
    ADD COLUMN IF NOT EXISTS priority SMALLINT NOT NULL DEFAULT 1 CHECK (priority IN (0, 1, 2, 3)),
    ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'account'
        CHECK (category IN ('account', 'subscription', 'payment', 'support', 'announcement', 'marketing')),
    ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS expiry_cycle_key TEXT NULL,
    ADD COLUMN IF NOT EXISTS campaign_id UUID NULL,
    ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS cancel_reason TEXT NULL,
    ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS bounced_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS complained_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ NULL;

-- Expand status check to include 'processing', 'delivered', 'bounced', 'complained', 'cancelled'
ALTER TABLE public.email_dispatches
    DROP CONSTRAINT IF EXISTS email_dispatches_status_check;

ALTER TABLE public.email_dispatches
    ADD CONSTRAINT email_dispatches_status_check
    CHECK (status IN ('queued', 'sending', 'processing', 'sent', 'delivered', 'bounced', 'complained', 'failed', 'cancelled'));

CREATE INDEX IF NOT EXISTS idx_email_dispatches_scheduled_queue
    ON public.email_dispatches (status, priority, scheduled_for)
    WHERE status = 'queued';

CREATE INDEX IF NOT EXISTS idx_email_dispatches_expiry_cycle
    ON public.email_dispatches (business_id, expiry_cycle_key)
    WHERE expiry_cycle_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_email_dispatches_category_created
    ON public.email_dispatches (category, created_at DESC);

-- 2. Email Templates
CREATE TABLE IF NOT EXISTS public.email_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_key TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL CHECK (category IN ('account', 'subscription', 'payment', 'support', 'announcement', 'marketing')),
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    subject_template TEXT NOT NULL,
    body_html_template TEXT NOT NULL,
    body_text_template TEXT NOT NULL,
    allowed_variables TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    is_mandatory BOOLEAN NOT NULL DEFAULT false,
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    updated_by UUID NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
);

-- 3. Email Settings (Singleton)
CREATE TABLE IF NOT EXISTS public.email_settings (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    sender_name TEXT NOT NULL DEFAULT 'CounterCub Support',
    sender_email TEXT NOT NULL DEFAULT 'support@countercub.com',
    reply_to_email TEXT NOT NULL DEFAULT 'support@countercub.com',
    reminder_7d_enabled BOOLEAN NOT NULL DEFAULT true,
    reminder_1d_enabled BOOLEAN NOT NULL DEFAULT true,
    reminder_0d_enabled BOOLEAN NOT NULL DEFAULT true,
    send_hour_local INTEGER NOT NULL DEFAULT 9 CHECK (send_hour_local >= 0 AND send_hour_local <= 23),
    timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    app_daily_limit INTEGER NOT NULL DEFAULT 80 CHECK (app_daily_limit >= 1),
    app_monthly_limit INTEGER NOT NULL DEFAULT 2400 CHECK (app_monthly_limit >= 1),
    provider_daily_limit INTEGER NOT NULL DEFAULT 100 CHECK (provider_daily_limit >= 1),
    provider_monthly_limit INTEGER NOT NULL DEFAULT 3000 CHECK (provider_monthly_limit >= 1),
    warn_threshold_1 INTEGER NOT NULL DEFAULT 70 CHECK (warn_threshold_1 BETWEEN 1 AND 100),
    warn_threshold_2 INTEGER NOT NULL DEFAULT 85 CHECK (warn_threshold_2 BETWEEN 1 AND 100),
    warn_threshold_3 INTEGER NOT NULL DEFAULT 95 CHECK (warn_threshold_3 BETWEEN 1 AND 100),
    critical_reserve_count INTEGER NOT NULL DEFAULT 10 CHECK (critical_reserve_count >= 0),
    support_resolution_enabled BOOLEAN NOT NULL DEFAULT true,
    announcements_enabled BOOLEAN NOT NULL DEFAULT true,
    updated_by UUID NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
);

INSERT INTO public.email_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- 4. Email Webhook Events (Deduplicated Resend/Svix history)
CREATE TABLE IF NOT EXISTS public.email_webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id TEXT NOT NULL UNIQUE,
    provider_message_id TEXT NULL,
    event_type TEXT NOT NULL,
    occurred_at TIMESTAMPTZ NULL,
    payload_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
);

CREATE INDEX IF NOT EXISTS idx_email_webhook_events_msg_id
    ON public.email_webhook_events (provider_message_id)
    WHERE provider_message_id IS NOT NULL;

-- 5. Marketing Preferences (Explicit Opt-In)
CREATE TABLE IF NOT EXISTS public.marketing_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    user_id UUID NULL,
    contact_email TEXT NOT NULL,
    offers_opted_in BOOLEAN NOT NULL DEFAULT false,
    features_opted_in BOOLEAN NOT NULL DEFAULT false,
    announcements_opted_in BOOLEAN NOT NULL DEFAULT false,
    unsubscribed_all BOOLEAN NOT NULL DEFAULT false,
    suppression_reason TEXT NULL,
    consented_at TIMESTAMPTZ NULL,
    unsubscribed_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    UNIQUE (business_id, contact_email)
);

CREATE INDEX IF NOT EXISTS idx_marketing_preferences_email
    ON public.marketing_preferences (contact_email);

-- 6. Marketing Campaigns
CREATE TABLE IF NOT EXISTS public.email_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('offers', 'features', 'announcements')),
    subject TEXT NOT NULL,
    header_text TEXT NOT NULL DEFAULT '',
    body_html TEXT NOT NULL,
    cta_label TEXT NOT NULL DEFAULT '',
    cta_url TEXT NOT NULL DEFAULT '',
    audience_filter JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'cancelled', 'failed')),
    scheduled_for TIMESTAMPTZ NULL,
    eligible_count INTEGER NOT NULL DEFAULT 0,
    excluded_count INTEGER NOT NULL DEFAULT 0,
    resend_broadcast_id TEXT NULL,
    created_by UUID NULL,
    sent_at TIMESTAMPTZ NULL,
    cancelled_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
);

CREATE INDEX IF NOT EXISTS idx_email_campaigns_status_sched
    ON public.email_campaigns (status, scheduled_for);

-- 7. Seed Default Templates
INSERT INTO public.email_templates (template_key, category, name, description, subject_template, body_html_template, body_text_template, allowed_variables, is_mandatory, is_enabled)
VALUES
(
    'store_admin_welcome',
    'account',
    'Store Admin Welcome & Setup',
    'Mandatory onboarding email with first-time password setup link.',
    'Welcome to CounterCub — {{storeName}} is Ready',
    '<p>Welcome to CounterCub, {{storeName}}! Use the secure link to set your password and sign in at {{loginUrl}}.</p>',
    'Welcome to CounterCub, {{storeName}}! Sign in at {{loginUrl}}.',
    ARRAY['storeName', 'adminLoginId', 'contactEmail', 'planName', 'planAmount', 'billingCycle', 'productLimit', 'employeeLimit', 'activationDate', 'expiryDate', 'loginUrl'],
    true,
    true
),
(
    'plan_activated',
    'subscription',
    'Plan Activation',
    'Sent when a store subscription plan is activated.',
    'Your CounterCub Plan Has Been Activated!',
    '<p>Hello {{adminName}}, your {{planName}} plan for {{storeName}} is now active.</p>',
    'Hello {{adminName}}, your {{planName}} plan for {{storeName}} is now active.',
    ARRAY['storeName', 'adminName', 'planName', 'planPrice', 'billingCycle', 'productLimit', 'employeeLimit', 'activationDate', 'expiryDate', 'loginUrl', 'supportEmail'],
    false,
    true
),
(
    'plan_upgraded',
    'subscription',
    'Subscription Upgrade',
    'Sent when a store upgrades to a higher plan.',
    'Your CounterCub Plan Has Been Upgraded!',
    '<p>Your store {{storeName}} has been upgraded from {{previousPlan}} to {{newPlan}}.</p>',
    'Your store {{storeName}} has been upgraded from {{previousPlan}} to {{newPlan}}.',
    ARRAY['storeName', 'previousPlan', 'newPlan', 'priceDifference', 'productLimit', 'employeeLimit', 'effectiveDate', 'expiryDate', 'loginUrl'],
    false,
    true
),
(
    'plan_downgraded',
    'subscription',
    'Subscription Downgrade',
    'Sent when a store subscription downgrade is applied.',
    'Your CounterCub Plan Has Been Updated',
    '<p>Your store {{storeName}} plan changed from {{previousPlan}} to {{newPlan}}.</p>',
    'Your store {{storeName}} plan changed from {{previousPlan}} to {{newPlan}}.',
    ARRAY['storeName', 'previousPlan', 'newPlan', 'productLimit', 'employeeLimit', 'effectiveDate', 'limitationsNote'],
    false,
    true
),
(
    'subscription_renewed',
    'subscription',
    'Subscription Renewal',
    'Sent after a subscription is renewed.',
    'Your CounterCub Subscription Has Been Renewed!',
    '<p>Your {{planName}} subscription for {{storeName}} has been renewed through {{expiryDate}}.</p>',
    'Your {{planName}} subscription for {{storeName}} has been renewed through {{expiryDate}}.',
    ARRAY['storeName', 'planName', 'renewalAmount', 'renewalDate', 'expiryDate', 'transactionRef'],
    false,
    true
),
(
    'payment_succeeded',
    'payment',
    'Payment Successful',
    'Sent when a payment transaction is confirmed.',
    'CounterCub Payment Confirmation — {{planName}}',
    '<p>Payment of {{paymentAmount}} for {{storeName}} ({{planName}}) succeeded.</p>',
    'Payment of {{paymentAmount}} for {{storeName}} ({{planName}}) succeeded.',
    ARRAY['storeName', 'paymentAmount', 'paymentDate', 'transactionRef', 'planName', 'subscriptionStatus'],
    false,
    true
),
(
    'payment_failed',
    'payment',
    'Payment Failed',
    'Sent when a payment failure is recorded (rate-limited per cycle).',
    'Action Required: CounterCub Payment Issue',
    '<p>We could not process your payment of {{paymentAmount}} for {{storeName}} ({{planName}}).</p>',
    'We could not process your payment of {{paymentAmount}} for {{storeName}} ({{planName}}).',
    ARRAY['storeName', 'planName', 'paymentAmount', 'failureReason', 'retryUrl', 'supportEmail'],
    false,
    true
),
(
    'subscription_expiry_reminder',
    'subscription',
    'Subscription Expiry Reminder',
    'Scheduled 7d, 1d, and 0d reminders before expiry.',
    'CounterCub Subscription Reminder — {{daysRemainingLabel}}',
    '<p>Your {{planName}} subscription for {{storeName}} expires on {{expiryDate}}.</p>',
    'Your {{planName}} subscription for {{storeName}} expires on {{expiryDate}}.',
    ARRAY['storeName', 'planName', 'expiryDate', 'daysRemainingLabel', 'renewalUrl'],
    false,
    true
),
(
    'subscription_expired',
    'subscription',
    'Subscription Expired',
    'Sent when a non-free subscription expires.',
    'Your CounterCub Subscription Has Expired',
    '<p>Your {{planName}} subscription for {{storeName}} expired on {{expiryDate}}.</p>',
    'Your {{planName}} subscription for {{storeName}} expired on {{expiryDate}}.',
    ARRAY['storeName', 'planName', 'expiryDate', 'accountStatus', 'gracePeriodInfo', 'renewalUrl'],
    false,
    true
),
(
    'support_ticket_resolved',
    'support',
    'Support Issue Resolved',
    'Sent when a support ticket transitions to Resolved.',
    'Your CounterCub Support Request Has Been Resolved!',
    '<p>Your support ticket {{ticketNumber}} ({{issueTitle}}) for {{storeName}} has been resolved.</p>',
    'Your support ticket {{ticketNumber}} ({{issueTitle}}) for {{storeName}} has been resolved.',
    ARRAY['ticketNumber', 'storeName', 'issueTitle', 'resolutionSummary', 'resolvedDate', 'supportEmail'],
    false,
    true
)
ON CONFLICT (template_key) DO NOTHING;

-- 8. Zero-trust RLS & Grants
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_campaigns ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.email_templates FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.email_templates TO service_role;

REVOKE ALL ON TABLE public.email_settings FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.email_settings TO service_role;

REVOKE ALL ON TABLE public.email_webhook_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.email_webhook_events TO service_role;

REVOKE ALL ON TABLE public.email_campaigns FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.email_campaigns TO service_role;

REVOKE ALL ON TABLE public.marketing_preferences FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.marketing_preferences TO authenticated;
GRANT ALL ON TABLE public.marketing_preferences TO service_role;

DROP POLICY IF EXISTS "store_admin_manage_own_marketing_prefs" ON public.marketing_preferences;
CREATE POLICY "store_admin_manage_own_marketing_prefs"
    ON public.marketing_preferences
    FOR ALL
    TO authenticated
    USING (
        business_id IN (
            SELECT p.business_id FROM public.profiles p
            WHERE p.id = auth.uid() AND p.is_admin = true
        )
    )
    WITH CHECK (
        business_id IN (
            SELECT p.business_id FROM public.profiles p
            WHERE p.id = auth.uid() AND p.is_admin = true
        )
    );

COMMIT;

