begin;

-- 1) Version check snapshot (logged in migration output)
select current_setting('server_version') as server_version;

-- 2) Safety snapshot of current view definitions
select pg_get_viewdef('app_public.pharmacy_inventory_public'::regclass, true)
  as app_public_pharmacy_inventory_public_viewdef;

select pg_get_viewdef('public.exchange_kpis_pharmacy'::regclass, true)
  as public_exchange_kpis_pharmacy_viewdef;

-- 3.1) Ensure app_public.pharmacy_inventory_public is truly invoker-safe.
-- Rebuild view body directly from base table (avoid SECURITY DEFINER function hop).
create or replace view app_public.pharmacy_inventory_public
with (security_invoker = true)
as
select pi.pharmacy_id, pi.product_id
from public.pharmacy_inventory as pi;

-- 3.1) Set exchange_kpis_pharmacy to security_invoker=true.
-- Fallback to CREATE OR REPLACE if ALTER VIEW fails in some environments.
do $$
declare
  v_view_sql text;
begin
  begin
    execute 'alter view public.exchange_kpis_pharmacy set (security_invoker = true)';
  exception
    when others then
      select pg_get_viewdef('public.exchange_kpis_pharmacy'::regclass, true)
        into v_view_sql;

      execute format(
        'create or replace view public.exchange_kpis_pharmacy with (security_invoker = true) as %s',
        v_view_sql
      );
  end;
end
$$;

-- 3.2) Preserve/restore grants for both views.
grant usage on schema app_public to anon, authenticated;

revoke all on table app_public.pharmacy_inventory_public from public;
revoke all on table app_public.pharmacy_inventory_public from anon;
revoke all on table app_public.pharmacy_inventory_public from authenticated;
grant select on table app_public.pharmacy_inventory_public to anon, authenticated;

revoke all on table public.exchange_kpis_pharmacy from public;
revoke all on table public.exchange_kpis_pharmacy from anon;
revoke all on table public.exchange_kpis_pharmacy from authenticated;
grant select on table public.exchange_kpis_pharmacy to authenticated;
grant select on table public.exchange_kpis_pharmacy to service_role;

-- 3.3) Lock down spatial_ref_sys write-like privileges for anon/authenticated.
do $$
begin
  begin
    execute '
      revoke insert, update, delete, truncate, references, trigger
      on table public.spatial_ref_sys
      from public, anon, authenticated
      granted by supabase_admin
    ';
  exception
    when others then
      raise notice 'GRANTED BY supabase_admin revoke failed (%). Falling back to plain revoke.', sqlerrm;
      execute '
        revoke insert, update, delete, truncate, references, trigger
        on table public.spatial_ref_sys
        from public, anon, authenticated
      ';
  end;
end
$$;

grant select on table public.spatial_ref_sys to anon, authenticated;

-- 3.4) Optional hardening: enable RLS + read policy when ownership allows.
do $$
begin
  begin
    alter table public.spatial_ref_sys enable row level security;
  exception
    when insufficient_privilege then
      raise notice 'Skipping RLS enable on public.spatial_ref_sys (insufficient privilege / non-owner).';
  end;

  begin
    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'spatial_ref_sys'
        and policyname = 'read_all'
    ) then
      create policy read_all
        on public.spatial_ref_sys
        for select
        to anon, authenticated
        using (true);
    end if;
  exception
    when insufficient_privilege then
      raise notice 'Skipping read_all policy on public.spatial_ref_sys (insufficient privilege / non-owner).';
  end;
end
$$;

-- 4) Validation snapshot query: reloptions should contain security_invoker=true.
select n.nspname, c.relname, c.reloptions
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where (n.nspname, c.relname) in (
  ('app_public', 'pharmacy_inventory_public'),
  ('public', 'exchange_kpis_pharmacy')
);

-- Diagnostic snapshot for spatial_ref_sys ACL + effective privileges.
select
  c.relowner::regrole::text as owner_role,
  coalesce(c.relacl::text, '<null>') as relacl
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'spatial_ref_sys';

select
  has_table_privilege('anon', 'public.spatial_ref_sys', 'SELECT') as anon_select,
  has_table_privilege('anon', 'public.spatial_ref_sys', 'INSERT') as anon_insert,
  has_table_privilege('anon', 'public.spatial_ref_sys', 'UPDATE') as anon_update,
  has_table_privilege('anon', 'public.spatial_ref_sys', 'DELETE') as anon_delete,
  has_table_privilege('anon', 'public.spatial_ref_sys', 'TRUNCATE') as anon_truncate,
  has_table_privilege('anon', 'public.spatial_ref_sys', 'REFERENCES') as anon_references,
  has_table_privilege('anon', 'public.spatial_ref_sys', 'TRIGGER') as anon_trigger,
  has_table_privilege('authenticated', 'public.spatial_ref_sys', 'SELECT') as authenticated_select,
  has_table_privilege('authenticated', 'public.spatial_ref_sys', 'INSERT') as authenticated_insert,
  has_table_privilege('authenticated', 'public.spatial_ref_sys', 'UPDATE') as authenticated_update,
  has_table_privilege('authenticated', 'public.spatial_ref_sys', 'DELETE') as authenticated_delete,
  has_table_privilege('authenticated', 'public.spatial_ref_sys', 'TRUNCATE') as authenticated_truncate,
  has_table_privilege('authenticated', 'public.spatial_ref_sys', 'REFERENCES') as authenticated_references,
  has_table_privilege('authenticated', 'public.spatial_ref_sys', 'TRIGGER') as authenticated_trigger;

-- Validation guardrails (migration fails if security posture is not as expected).
do $$
begin
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

  if not has_table_privilege('anon', 'public.spatial_ref_sys', 'SELECT')
     or not has_table_privilege('authenticated', 'public.spatial_ref_sys', 'SELECT') then
    raise exception 'SELECT privilege missing on public.spatial_ref_sys for anon/authenticated';
  end if;

  if has_table_privilege('anon', 'public.spatial_ref_sys', 'INSERT')
     or has_table_privilege('anon', 'public.spatial_ref_sys', 'UPDATE')
     or has_table_privilege('anon', 'public.spatial_ref_sys', 'DELETE')
     or has_table_privilege('anon', 'public.spatial_ref_sys', 'TRUNCATE')
     or has_table_privilege('anon', 'public.spatial_ref_sys', 'REFERENCES')
     or has_table_privilege('anon', 'public.spatial_ref_sys', 'TRIGGER')
     or has_table_privilege('authenticated', 'public.spatial_ref_sys', 'INSERT')
     or has_table_privilege('authenticated', 'public.spatial_ref_sys', 'UPDATE')
     or has_table_privilege('authenticated', 'public.spatial_ref_sys', 'DELETE')
     or has_table_privilege('authenticated', 'public.spatial_ref_sys', 'TRUNCATE')
     or has_table_privilege('authenticated', 'public.spatial_ref_sys', 'REFERENCES')
     or has_table_privilege('authenticated', 'public.spatial_ref_sys', 'TRIGGER') then
    raise notice 'Write-like privileges still present on public.spatial_ref_sys for anon/authenticated (owner-controlled ACL; manual owner-level revoke required).';
  end if;
end
$$;

commit;
