-- 1) Function: deterministic lookup by normalized email (returns 0 or 1 row)
create or replace function public.find_pharmacist_profile_by_email(p_email text)
returns table (
  id uuid,
  email text,
  role text
)
language sql
stable
as $$
  select p.id, p.email, p.role
  from public.profiles p
  where p.role = 'pharmacist'
    and lower(trim(p.email)) = lower(trim(p_email))
  limit 1;
$$;

-- 2) Permissions: allow authenticated + service_role to call it
revoke all on function public.find_pharmacist_profile_by_email(text) from public;
revoke all on function public.find_pharmacist_profile_by_email(text) from anon;
grant execute on function public.find_pharmacist_profile_by_email(text) to authenticated;
grant execute on function public.find_pharmacist_profile_by_email(text) to service_role;

-- 3) RLS compatibility:
-- If RPC returns 0 due to RLS on profiles (auth users cannot read others), then enable SECURITY DEFINER.
-- Apply these two lines ONLY if needed after testing:
-- alter function public.find_pharmacist_profile_by_email(text) security definer;
-- alter function public.find_pharmacist_profile_by_email(text) set search_path = public;
