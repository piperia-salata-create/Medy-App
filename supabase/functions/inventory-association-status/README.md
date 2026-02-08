# inventory-association-status

Set local pharmacy association lifecycle for a product and synchronize discontinued marks.

## Endpoint

`POST /functions/v1/inventory-association-status`

## Required auth

- `Authorization: Bearer <access_token>`
- Caller must manage the target `pharmacy_id`.

## Required secrets

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## Request

```json
{
  "pharmacy_id": "11111111-2222-3333-4444-555555555555",
  "product_id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  "association_status": "discontinued_local",
  "reason": "No longer handled locally"
}
```

`association_status` allowed values:

- `active`
- `inactive`
- `discontinued_local`

## Behavior

- Upserts `pharmacy_inventory` row `(pharmacy_id, product_id)` and updates `association_status`.
- If status is `discontinued_local`:
  - upserts one row in `product_discontinued_marks`.
- Otherwise:
  - deletes any existing mark for `(product_id, pharmacy_id)`.
- Returns current proposal counters from `product_catalog`:
  - `discontinued_mark_count`
  - `discontinued_proposed`
  - `discontinued_proposed_at`

## Example response

```json
{
  "pharmacy_id": "11111111-2222-3333-4444-555555555555",
  "product_id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  "association_status": "discontinued_local",
  "mark_action": "upserted",
  "proposal_state": {
    "id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    "discontinued_mark_count": 3,
    "discontinued_proposed": false,
    "discontinued_proposed_at": null
  }
}
```
