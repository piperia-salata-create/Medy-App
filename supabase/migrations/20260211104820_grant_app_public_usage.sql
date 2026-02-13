begin;

grant usage on schema app_public to anon, authenticated;

-- ensure view is selectable (should already be granted but re-assert)
grant select on table app_public.catalog to anon, authenticated;

commit;
