-- harden_catalog_api
-- Source table chosen: public.product_catalog
-- Why: patient flows query product catalog directly, including:
-- - frontend/src/lib/inventory/searchInventory.js -> supabase.from('product_catalog')
-- - frontend/src/pages/patient/PharmacyDetailPage.jsx -> product:product_catalog(...)

alter view public.public_pharmacies set (security_invoker = true);

create schema if not exists app_public;

do $$
declare
  source_schema text := 'public';
  source_table text := 'product_catalog';
  allowed_cols text[] := array[
    'id',
    'category',
    'name_el',
    'name_en',
    'desc_el',
    'desc_en',
    'barcode',
    'brand',
    'strength',
    'form',
    'active_ingredient_el',
    'active_ingredient_en',
    'name_el_norm',
    'name_en_norm',
    'form_norm',
    'strength_norm'
  ];
  select_list text;
begin
  select string_agg(format('%I', c.column_name), ', ' order by array_position(allowed_cols, c.column_name))
    into select_list
  from information_schema.columns c
  where c.table_schema = source_schema
    and c.table_name = source_table
    and c.column_name = any(allowed_cols);

  if select_list is null then
    raise exception 'No allowed columns found on %.%', source_schema, source_table;
  end if;

  execute format(
    'create or replace view app_public.catalog as select %s from %I.%I',
    select_list,
    source_schema,
    source_table
  );
end
$$;

alter view app_public.catalog set (security_invoker = true);

revoke all on app_public.catalog from anon, authenticated;
grant select on app_public.catalog to anon, authenticated;
