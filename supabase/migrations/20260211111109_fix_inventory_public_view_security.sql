begin;

revoke select on table public.pharmacy_inventory from anon, authenticated;

create or replace function app_public.read_pharmacy_inventory_public()
returns table (pharmacy_id uuid, product_id uuid)
language sql
security definer
set search_path = app_public, public
as $$
  select pi.pharmacy_id, pi.product_id
  from public.pharmacy_inventory as pi;
$$;

alter function app_public.read_pharmacy_inventory_public() owner to postgres;
revoke all on function app_public.read_pharmacy_inventory_public() from public;
grant execute on function app_public.read_pharmacy_inventory_public() to anon, authenticated;

create or replace view app_public.pharmacy_inventory_public as
select pharmacy_id, product_id
from app_public.read_pharmacy_inventory_public();

alter view app_public.pharmacy_inventory_public owner to postgres;
alter view app_public.pharmacy_inventory_public set (security_invoker = false);

grant usage on schema app_public to anon, authenticated;
revoke all on table app_public.pharmacy_inventory_public from anon, authenticated;
grant select on table app_public.pharmacy_inventory_public to anon, authenticated;

commit;
