# inventory-import

Supabase Edge Function for upserting pharmacy-product associations against the shared bilingual catalog.

Supports:

- Manual add (single row payload)
- CSV import (frontend parses and sends `items[]`)
- Paste-list import (frontend parses and sends `items[]`)

## Endpoint

`POST /functions/v1/inventory-import`

## Required auth

- `Authorization: Bearer <access_token>`
- Caller must manage the provided `pharmacy_id` (owner/staff via `can_manage_pharmacy_inventory`).

## Required secrets

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## Request body

```json
{
  "pharmacy_id": "uuid",
  "items": [
    {
      "category": "medication",
      "name_el": "Παρακεταμόλη 500mg",
      "name_en": "Paracetamol 500mg",
      "desc_el": "Αναλγητικό",
      "desc_en": "Pain reliever",
      "barcode": "5201234567890",
      "brand": "ExampleBrand",
      "strength": "500mg",
      "form": "tablet",
      "active_ingredient_el": "Παρακεταμόλη",
      "active_ingredient_en": "Paracetamol",
      "association_status": "active",
      "price": 3.8,
      "notes": "Shelf A2"
    }
  ]
}
```

## Matching logic (precision-first)

1. If `barcode` exists: exact match by `product_catalog.barcode`.
2. Else match by composite identity:
   - `category` + (`name_el_norm` or `name_en_norm`)
   - plus `form_norm` and `strength_norm` when they are provided in the input row.
3. If more than one candidate remains:
   - importer does **not** merge;
   - row is skipped and added to `ambiguous_rows`;
   - import continues for the rest of the batch (non-blocking).
4. New catalog row is created only when no catalog match exists.

## Additional rules

- Max batch size: `500`.
- Each row must include at least one of `name_el`, `name_en`, or `barcode`.
- New catalog rows are created with `created_by = auth.uid()`.
- Ambiguous rows are skipped (no auto-merge, no auto-create).
- Existing catalog rows only fill missing fields (no overwrite of non-empty values).
- Inventory upsert always sets `association_status` to:
  - provided valid value, or
  - `active` by default.

## Example response

```json
{
  "pharmacy_id": "11111111-2222-3333-4444-555555555555",
  "processed": 3,
  "counts": {
    "created_catalog": 1,
    "updated_catalog": 1,
    "upserted_inventory": 2,
    "skipped_invalid": 1,
    "ambiguous_skipped": 1
  },
  "ambiguous_rows": [
    {
      "index": 1,
      "message": "Multiple catalog candidates matched category/name, but form and/or strength were missing. Row was skipped to avoid a wrong merge.",
      "candidate_count": 2,
      "candidate_ids": [
        "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        "ffffffff-1111-2222-3333-444444444444"
      ],
      "created_new_catalog": false
    }
  ],
  "errors": [
    {
      "index": 2,
      "stage": "validate",
      "message": "Each item must include at least one of name_el, name_en, or barcode.",
      "item": {}
    }
  ]
}
```

## Notes

- Requires:
  - `public.product_catalog`
  - `public.pharmacy_inventory`
  - `public.can_manage_pharmacy_inventory(...)`
- Uses service role writes for catalog/inventory operations.
- Keeps `in_stock` only for backward compatibility, without stock-availability semantics.
