set role postgres;

-- a) No public BASE tables where anon has INSERT/UPDATE/DELETE
with public_base_tables as (
  select n.nspname as schema_name, c.relname as table_name
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r','p')
)
select
  table_name,
  has_table_privilege('anon', format('public.%I', table_name), 'INSERT') as anon_insert,
  has_table_privilege('anon', format('public.%I', table_name), 'UPDATE') as anon_update,
  has_table_privilege('anon', format('public.%I', table_name), 'DELETE') as anon_delete
from public_base_tables
where has_table_privilege('anon', format('public.%I', table_name), 'INSERT')
   or has_table_privilege('anon', format('public.%I', table_name), 'UPDATE')
   or has_table_privilege('anon', format('public.%I', table_name), 'DELETE')
order by table_name;

-- b) anon SELECT on public.product_catalog
select has_table_privilege('anon','public.product_catalog','SELECT') as anon_can_select_public_product_catalog;

-- c) authenticated INSERT/UPDATE/DELETE on public.product_catalog
select
  has_table_privilege('authenticated','public.product_catalog','INSERT') as authenticated_can_insert_public_product_catalog,
  has_table_privilege('authenticated','public.product_catalog','UPDATE') as authenticated_can_update_public_product_catalog,
  has_table_privilege('authenticated','public.product_catalog','DELETE') as authenticated_can_delete_public_product_catalog;

-- extra visibility: app_public curated views remain SELECT-only
select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type) as privileges
from information_schema.table_privileges
where table_schema='app_public'
  and table_name in ('catalog','pharmacy_inventory_public')
  and grantee in ('anon','authenticated')
group by table_name, grantee
order by table_name, grantee;
