drop function if exists public.find_pharmacist_profile_by_email(text);

create function public.find_pharmacist_profile_by_email(p_email text)
returns table (
  id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id
  from public.profiles p
  where p.role = 'pharmacist'
    and lower(trim(p.email)) = lower(trim(p_email))
  limit 1;
$$;

revoke all on function public.find_pharmacist_profile_by_email(text) from public;
revoke all on function public.find_pharmacist_profile_by_email(text) from anon;
grant execute on function public.find_pharmacist_profile_by_email(text) to authenticated;
grant execute on function public.find_pharmacist_profile_by_email(text) to service_role;
