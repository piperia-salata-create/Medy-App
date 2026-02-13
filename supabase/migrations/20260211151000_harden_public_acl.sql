begin;

-- Revoke write-capable privileges from anon across all public base/partitioned tables.
do $$
declare
  tbl record;
begin
  for tbl in
    select n.nspname as schema_name, c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
  loop
    execute format(
      'revoke insert, update, delete, truncate, references, trigger on table %I.%I from anon',
      tbl.schema_name,
      tbl.table_name
    );
  end loop;
end
$$;

-- Force product catalog reads to go through app_public.catalog for anon.
revoke select on table public.product_catalog from anon;

-- Prevent direct client-side writes to product_catalog even for authenticated.
revoke insert, update, delete on table public.product_catalog from authenticated;

commit;
