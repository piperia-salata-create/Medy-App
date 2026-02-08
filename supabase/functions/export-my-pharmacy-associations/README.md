# export-my-pharmacy-associations

Export pharmacy inventory associations for a pharmacy the caller can manage.

## Endpoint

`GET or POST /functions/v1/export-my-pharmacy-associations`

## Required auth

- `Authorization: Bearer <access_token>`
- Caller must manage `pharmacy_id`.

## Required secrets

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## Request

### GET examples

`/functions/v1/export-my-pharmacy-associations?pharmacy_id=<uuid>&format=json`

`/functions/v1/export-my-pharmacy-associations?pharmacy_id=<uuid>&format=csv&my_only=true`

### POST example

```json
{
  "pharmacy_id": "11111111-2222-3333-4444-555555555555",
  "format": "json",
  "my_only": true
}
```

## Filters

- `my_only=true` filters to rows whose linked catalog item has `created_by = auth.uid()`.
- `my_only=false` (default) returns all associations for that pharmacy.

## Example JSON response

```json
{
  "pharmacy_id": "11111111-2222-3333-4444-555555555555",
  "my_only": true,
  "count": 2,
  "items": [
    {
      "inventory_id": "inv-uuid",
      "pharmacy_id": "11111111-2222-3333-4444-555555555555",
      "product_id": "prod-uuid",
      "association_status": "active",
      "product_name_el": "Παρακεταμόλη 500mg",
      "product_name_en": "Paracetamol 500mg",
      "product_created_by": "11111111-2222-3333-4444-555555555555"
    }
  ]
}
```

## CSV response

- Returns `text/csv` with attachment filename `my-pharmacy-associations.csv`.
