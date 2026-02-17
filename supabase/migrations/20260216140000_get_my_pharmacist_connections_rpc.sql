create or replace function public.get_my_pharmacist_connections()
returns table (
  connection_id uuid,
  status text,
  created_at timestamptz,
  other_pharmacist_id uuid,
  other_full_name text,
  other_pharmacy_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id as connection_id,
    c.status,
    c.created_at,
    case
      when c.requester_pharmacist_id = auth.uid() then c.target_pharmacist_id
      else c.requester_pharmacist_id
    end as other_pharmacist_id,
    p.full_name as other_full_name,
    p.pharmacy_name as other_pharmacy_name
  from public.pharmacist_connections c
  join public.profiles p
    on p.id = case
      when c.requester_pharmacist_id = auth.uid() then c.target_pharmacist_id
      else c.requester_pharmacist_id
    end
  where c.requester_pharmacist_id = auth.uid()
     or c.target_pharmacist_id = auth.uid()
  order by c.created_at desc;
$$;

revoke all on function public.get_my_pharmacist_connections() from public;
revoke all on function public.get_my_pharmacist_connections() from anon;
grant execute on function public.get_my_pharmacist_connections() to authenticated;
grant execute on function public.get_my_pharmacist_connections() to service_role;
