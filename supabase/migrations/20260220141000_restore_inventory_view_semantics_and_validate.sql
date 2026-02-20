begin;

-- Restore original inventory mapping semantics (pre-20260220133000):
-- keep function-based source, but enforce security_invoker=true on the view.
create or replace view app_public.pharmacy_inventory_public
with (security_invoker = true)
as
select inv.pharmacy_id, inv.product_id
from app_public.read_pharmacy_inventory_public() as inv;

grant usage on schema app_public to anon, authenticated;
revoke all on table app_public.pharmacy_inventory_public from public;
revoke all on table app_public.pharmacy_inventory_public from anon;
revoke all on table app_public.pharmacy_inventory_public from authenticated;
grant select on table app_public.pharmacy_inventory_public to anon, authenticated;

-- Ensure exchange KPI view remains invoker and grants stay intact.
alter view public.exchange_kpis_pharmacy set (security_invoker = true);
revoke all on table public.exchange_kpis_pharmacy from public;
revoke all on table public.exchange_kpis_pharmacy from anon;
revoke all on table public.exchange_kpis_pharmacy from authenticated;
grant select on table public.exchange_kpis_pharmacy to authenticated;
grant select on table public.exchange_kpis_pharmacy to service_role;

-- Validation snapshots for deployment logs.
select pg_get_viewdef('app_public.pharmacy_inventory_public'::regclass, true)
  as app_public_pharmacy_inventory_public_viewdef;

select pg_get_viewdef('public.exchange_kpis_pharmacy'::regclass, true)
  as public_exchange_kpis_pharmacy_viewdef;

select column_name, data_type
from information_schema.columns
where table_schema = 'app_public'
  and table_name = 'pharmacy_inventory_public'
order by ordinal_position;

select n.nspname, c.relname, c.reloptions
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where (n.nspname, c.relname) in (
  ('app_public', 'pharmacy_inventory_public'),
  ('public', 'exchange_kpis_pharmacy')
);

do $$
declare
  v_inventory_viewdef text;
begin
  select pg_get_viewdef('app_public.pharmacy_inventory_public'::regclass, true)
    into v_inventory_viewdef;

  if position('read_pharmacy_inventory_public' in v_inventory_viewdef) = 0 then
    raise exception
      'app_public.pharmacy_inventory_public no longer references read_pharmacy_inventory_public()';
  end if;

  if not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'app_public'
      and c.relname = 'pharmacy_inventory_public'
      and coalesce(c.reloptions::text, '') like '%security_invoker=true%'
  ) then
    raise exception 'app_public.pharmacy_inventory_public is not security_invoker=true';
  end if;

  if not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'exchange_kpis_pharmacy'
      and coalesce(c.reloptions::text, '') like '%security_invoker=true%'
  ) then
    raise exception 'public.exchange_kpis_pharmacy is not security_invoker=true';
  end if;
end
$$;

commit;
