begin;

-- Normalize empty barcode strings to NULL so uniqueness remains predictable.
update public.product_catalog
set barcode = null
where barcode is not null
  and btrim(barcode) = '';

-- One canonical dedupe key:
-- - barcoded rows: keyed by barcode
-- - no-barcode rows: keyed by normalized identity used in autocomplete matching
do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'product_catalog'
      and column_name = 'dedupe_key'
  ) then
    execute $sql$
      alter table public.product_catalog
      add column dedupe_key text generated always as (
        case
          when barcode is not null and btrim(barcode) <> '' then
            'b:' || lower(btrim(barcode))
          else
            'n:' || lower(category) || '|' ||
            coalesce(nullif(name_el_norm, ''), nullif(name_en_norm, ''), '') || '|' ||
            coalesce(form_norm, '') || '|' ||
            coalesce(strength_norm, '') || '|' ||
            coalesce(nullif(lower(btrim(brand)), ''), '')
        end
      ) stored
    $sql$;
  end if;
end
$$;

create unique index if not exists idx_product_catalog_dedupe_key_unique
  on public.product_catalog (dedupe_key);

-- Re-assert existing barcode uniqueness for non-empty values.
create unique index if not exists idx_product_catalog_barcode_unique_nonempty
  on public.product_catalog (barcode)
  where barcode is not null and btrim(barcode) <> '';

commit;
