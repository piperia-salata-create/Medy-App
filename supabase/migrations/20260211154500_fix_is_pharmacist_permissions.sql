begin;

-- Used by RLS policies on product_discontinued_marks.
-- Keep execution least-privilege and deterministic.
alter function public.is_pharmacist(uuid) security definer;
alter function public.is_pharmacist(uuid) set search_path = public;

revoke all on function public.is_pharmacist(uuid) from public;
revoke all on function public.is_pharmacist(uuid) from anon;
revoke all on function public.is_pharmacist(uuid) from authenticated;
grant execute on function public.is_pharmacist(uuid) to authenticated;
grant execute on function public.is_pharmacist(uuid) to service_role;

commit;
