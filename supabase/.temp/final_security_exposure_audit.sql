set role postgres;

-- Q1: ALL public tables where anon/authenticated have any SELECT/INSERT/UPDATE/DELETE privilege, grouped by table and role.
select table_schema, table_name, grantee,
       string_agg(privilege_type, ',' order by privilege_type) as privileges
from information_schema.table_privileges
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
  and privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
group by table_schema, table_name, grantee
order by table_name, grantee;

-- Q2: ALL SECURITY DEFINER functions and views (schema, name, owner, search_path for functions).
with security_definer_functions as (
  select
    'function'::text as object_type,
    n.nspname as schema_name,
    p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as object_name,
    pg_get_userbyid(p.proowner) as owner,
    coalesce(
      (
        select substring(cfg from '^search_path=(.*)$')
        from unnest(coalesce(p.proconfig, '{}'::text[])) as cfg
        where cfg like 'search_path=%'
        limit 1
      ),
      '[default]'
    ) as search_path
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where p.prosecdef
),
security_definer_views as (
  select
    'view'::text as object_type,
    n.nspname as schema_name,
    c.relname as object_name,
    pg_get_userbyid(c.relowner) as owner,
    null::text as search_path
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where c.relkind = 'v'
    and not coalesce(
      (
        select bool_or(opt = 'security_invoker=true')
        from unnest(coalesce(c.reloptions, '{}'::text[])) as opt
      ),
      false
    )
)
select *
from (
  select * from security_definer_functions
  union all
  select * from security_definer_views
) x
order by object_type, schema_name, object_name;

-- Q3A: Verify public.product_catalog SELECT for anon/authenticated.
select
  has_table_privilege('anon', 'public.product_catalog', 'SELECT') as anon_select_product_catalog,
  has_table_privilege('authenticated', 'public.product_catalog', 'SELECT') as authenticated_select_product_catalog;

-- Q3B: Verify public.pharmacy_inventory privileges for anon/authenticated.
select grantee, privilege_type
from information_schema.table_privileges
where table_schema = 'public'
  and table_name = 'pharmacy_inventory'
  and grantee in ('anon', 'authenticated')
order by grantee, privilege_type;

-- Q3C: Verify app_public.catalog is SELECT-only for anon/authenticated.
select grantee,
       string_agg(privilege_type, ',' order by privilege_type) as privileges
from information_schema.table_privileges
where table_schema = 'app_public'
  and table_name = 'catalog'
  and grantee in ('anon', 'authenticated')
group by grantee
order by grantee;

-- Q3D: Verify app_public.pharmacy_inventory_public is SELECT-only for anon/authenticated.
select grantee,
       string_agg(privilege_type, ',' order by privilege_type) as privileges
from information_schema.table_privileges
where table_schema = 'app_public'
  and table_name = 'pharmacy_inventory_public'
  and grantee in ('anon', 'authenticated')
group by grantee
order by grantee;

-- Q4A: Public tables where anon has any I/U/D and whether table is fully open for I/U/D.
with anon_iud as (
  select
    table_name,
    bool_or(privilege_type = 'INSERT') as has_insert,
    bool_or(privilege_type = 'UPDATE') as has_update,
    bool_or(privilege_type = 'DELETE') as has_delete
  from information_schema.table_privileges
  where table_schema = 'public'
    and grantee = 'anon'
    and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
  group by table_name
)
select
  table_name,
  has_insert,
  has_update,
  has_delete,
  (has_insert and has_update and has_delete) as fully_open_iud
from anon_iud
order by table_name;

-- Q4B: Public tables fully open for anon I/U/D.
with anon_iud as (
  select
    table_name,
    bool_or(privilege_type = 'INSERT') as has_insert,
    bool_or(privilege_type = 'UPDATE') as has_update,
    bool_or(privilege_type = 'DELETE') as has_delete
  from information_schema.table_privileges
  where table_schema = 'public'
    and grantee = 'anon'
    and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
  group by table_name
)
select table_name
from anon_iud
where has_insert and has_update and has_delete
order by table_name;
