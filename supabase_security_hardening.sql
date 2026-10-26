-- ==============================================================================
-- SEYALPRO — ENTERPRISE DATABASE SECURITY & TENANT ISOLATION HARDENING
-- ==============================================================================
-- Run this script in the Supabase SQL Editor:
-- https://supabase.com/dashboard/project/ekwiorjhcwrhrpkovyvl/sql/new
--
-- Strictly NON-DESTRUCTIVE and IDEMPOTENT (safe to execute multiple times).
-- This script:
-- 1. Hardens SECURITY DEFINER functions with a fixed search_path.
-- 2. Prevents client-side privilege escalation on public.profiles (is_admin, is_super_admin).
-- 3. Protects confidential B2B invoice data inside businesses.enabled_modules.
-- 4. Ensures unassigned/anonymous users cannot harvest tenant configurations.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. HARDEN SECURITY DEFINER HELPER FUNCTIONS WITH FIXED SEARCH_PATH
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_current_business_id()
RETURNS UUID 
LANGUAGE sql 
STABLE 
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT business_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN 
LANGUAGE sql 
STABLE 
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    (SELECT is_super_admin FROM public.profiles WHERE id = auth.uid()),
    false
  );
$$;

-- Grant execution to authenticated users
GRANT EXECUTE ON FUNCTION public.get_current_business_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;

-- ------------------------------------------------------------------------------
-- 2. PREVENT PRIVILEGE ESCALATION ON PROFILES TABLE
-- ------------------------------------------------------------------------------
-- Trigger function to block non-super-admins from modifying role flags or tenant assignment
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- If caller is a platform super admin, permit all updates
  IF public.is_super_admin() THEN
    RETURN NEW;
  END IF;

  -- Block any attempt by ordinary users/store admins to change is_super_admin
  IF NEW.is_super_admin IS DISTINCT FROM OLD.is_super_admin THEN
    RAISE EXCEPTION 'Permission Denied: Only Platform Super Admins can alter is_super_admin privilege.';
  END IF;

  -- Block non-super-admins from transferring profile to another business
  IF NEW.business_id IS DISTINCT FROM OLD.business_id THEN
    RAISE EXCEPTION 'Permission Denied: Only Platform Super Admins can reassign a user business_id.';
  END IF;

  -- Regular employees cannot grant themselves is_admin
  IF (OLD.is_admin IS DISTINCT FROM true) AND (NEW.is_admin = true) THEN
    -- Check if the updater is a verified store admin for this business
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() 
        AND is_admin = true 
        AND business_id = OLD.business_id
    ) THEN
      RAISE EXCEPTION 'Permission Denied: You must be an authorized store admin to grant admin status.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_profile_privilege_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_profile_privilege_escalation
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_profile_privilege_escalation();

-- Also guard profile INSERT: Ensure new users cannot self-assign is_super_admin = true
CREATE OR REPLACE FUNCTION public.sanitize_new_profile()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- If inserted directly by client, force is_super_admin to false unless inserted by existing super admin
  IF NOT public.is_super_admin() THEN
    NEW.is_super_admin := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sanitize_new_profile ON public.profiles;
CREATE TRIGGER trg_sanitize_new_profile
BEFORE INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.sanitize_new_profile();

-- ------------------------------------------------------------------------------
-- 3. PROFILES RLS POLICY REFINEMENT
-- ------------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_tenant_update" ON public.profiles;
CREATE POLICY "profiles_tenant_update" ON public.profiles
FOR UPDATE TO authenticated
USING (
  public.is_super_admin() OR
  (
    business_id = public.get_current_business_id() AND
    (
      id = auth.uid() OR
      EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
    )
  )
)
WITH CHECK (
  public.is_super_admin() OR
  (
    business_id = public.get_current_business_id() AND
    is_super_admin = false
  )
);

-- ------------------------------------------------------------------------------
-- 4. HARDEN BUSINESSES RLS: PROTECT EMBEDDED INVOICES & CONFIGS
-- ------------------------------------------------------------------------------
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_public_read_businesses" ON public.businesses;
DROP POLICY IF EXISTS "allow_tenant_member_read_business" ON public.businesses;

-- Authenticated store members and super admins can read their complete business row
CREATE POLICY "allow_tenant_member_read_business" ON public.businesses
FOR SELECT TO authenticated
USING (
  public.is_super_admin() OR
  id = public.get_current_business_id()
);

-- Public / Anonymous branding policy: allow reading ONLY safe branding columns via view
CREATE OR REPLACE VIEW public.public_businesses_summary AS
  SELECT 
    id,
    name,
    slug,
    logo_url,
    currency_symbol,
    timezone,
    is_active
  FROM public.businesses;

GRANT SELECT ON public.public_businesses_summary TO anon, authenticated;

COMMIT;
