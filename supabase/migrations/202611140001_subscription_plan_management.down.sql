-- Rollback: 202611140001_subscription_plan_management.down.sql
BEGIN;

DROP TRIGGER IF EXISTS trg_enforce_employee_seat_limit ON public.profiles;
DROP TRIGGER IF EXISTS trg_enforce_products_subscription_limit ON public.products;
DROP TRIGGER IF EXISTS trg_enforce_b2b_products_subscription_limit ON public.b2b_products;

DROP FUNCTION IF EXISTS public.enforce_employee_seat_limit();
DROP FUNCTION IF EXISTS public.enforce_product_subscription_limit();
DROP FUNCTION IF EXISTS public.get_effective_tenant_entitlements(UUID);

DROP TABLE IF EXISTS public.subscription_requests;
DROP TABLE IF EXISTS public.subscription_events;
DROP TABLE IF EXISTS public.tenant_subscriptions;
DROP TABLE IF EXISTS public.subscription_plans;

COMMIT;

