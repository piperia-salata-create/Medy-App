begin;

-- Remove API-facing access to PostGIS spatial reference table.
revoke all privileges on table public.spatial_ref_sys from anon, authenticated, public;

-- Keep metadata views readable if needed, but remove write-capable privileges from API roles.
do $$
declare
  rel record;
begin
  for rel in
    select n.nspname as schema_name, c.relname as object_name, c.relkind
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('geometry_columns', 'geography_columns')
      and c.relkind in ('r', 'p', 'v', 'm', 'f')
  loop
    execute format(
      'revoke insert, update, delete on table %I.%I from anon, authenticated, public',
      rel.schema_name,
      rel.object_name
    );

    if rel.relkind in ('r', 'p', 'f') then
      execute format(
        'revoke truncate, references, trigger on table %I.%I from anon, authenticated, public',
        rel.schema_name,
        rel.object_name
      );
    end if;
  end loop;
end
$$;

commit;
