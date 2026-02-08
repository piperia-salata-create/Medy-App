# export-my-catalog-items

Export catalog rows created by the currently authenticated user (`created_by = auth.uid()`).

## Endpoint

`GET or POST /functions/v1/export-my-catalog-items`

## Required auth

- `Authorization: Bearer <access_token>`

## Required secrets

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## Request

### GET example

`/functions/v1/export-my-catalog-items?format=json`

or

`/functions/v1/export-my-catalog-items?format=csv`

### POST example

```json
{
  "format": "json"
}
```

## Response (JSON)

```json
{
  "count": 2,
  "items": [
    {
      "id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      "category": "medication",
      "name_el": "Παρακεταμόλη 500mg",
      "name_en": "Paracetamol 500mg",
      "created_by": "11111111-2222-3333-4444-555555555555"
    }
  ]
}
```

## Response (CSV)

- Returns `text/csv` with attachment filename `my-catalog-items.csv`.
