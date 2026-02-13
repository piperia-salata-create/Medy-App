create or replace view app_public.pharmacy_inventory_public as
select pharmacy_id, product_id
from public.pharmacy_inventory;

alter view app_public.pharmacy_inventory_public set (security_invoker = true);

grant usage on schema app_public to anon, authenticated;
revoke all on table app_public.pharmacy_inventory_public from anon, authenticated;
grant select on table app_public.pharmacy_inventory_public to anon, authenticated;
