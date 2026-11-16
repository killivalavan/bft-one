-- Ensure authenticated role retains SELECT privilege on public.profiles
-- (matches GRANT SELECT ON public.businesses TO authenticated in 202611120001).
-- RLS policy `profiles_select_same_tenant` still strictly scopes rows to own profile or same tenant.
GRANT SELECT ON public.profiles TO authenticated;

