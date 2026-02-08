# Pharma-Alert

## Quick Start

```bash
cd frontend
yarn install
yarn start
```

## Inventory Import Matching Rules

`/functions/v1/inventory-import` now resolves catalog rows with precision-first logic:

1. Barcode exact match (`product_catalog.barcode`) when barcode is present.
2. Otherwise composite identity match by `category` + (`name_el_norm` or `name_en_norm`) + `form_norm` + `strength_norm` (using the form/strength parts when provided).
3. If multiple candidates remain, importer does not merge; it reports the row in `ambiguous_rows`, skips that row, and continues the batch.
4. New catalog rows are created only when there is no catalog match.

## Export Endpoints

JSON is the default format (frontend can convert to CSV), with optional `format=csv`.

1. `/functions/v1/export-my-catalog-items`
   - Returns `product_catalog` rows where `created_by = auth.uid()`.
2. `/functions/v1/export-my-pharmacy-associations`
   - Returns `pharmacy_inventory` rows for a `pharmacy_id` the caller can manage (`can_manage_pharmacy_inventory`).

## SQL Run Order (Exact)

Run these files in Supabase SQL Editor in this exact order:

1. `supabase_migration.sql`
2. `supabase_catalog_inventory_migration.sql`
3. `supabase_cleanup_association_semantics.sql`
4. `supabase_discontinued_proposals_patch.sql`
5. `supabase_inventory_patch_matching_precision.sql`
