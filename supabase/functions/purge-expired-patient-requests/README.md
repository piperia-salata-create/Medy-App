# purge-expired-patient-requests

Daily cleanup for patient request retention without `pg_cron`.

## Behavior

1. Soft-delete requests that are older than 7 days past expiry:
- `deleted_at IS NULL`
- `expires_at IS NOT NULL`
- `expires_at < now() - interval '7 days'`

2. Hard-delete soft-deleted rows after a 1-day safety buffer:
- `deleted_at IS NOT NULL`
- `deleted_at < now() - interval '1 day'`

Only `public.patient_requests` is touched.

## Security

This function refuses non-service-role invocations.
It checks the incoming bearer token and requires `role = service_role`.

## Deploy

```bash
supabase functions deploy purge-expired-patient-requests
```

## Schedule (Supabase Dashboard)

Create a scheduled invocation for this function:

- Method: `POST`
- Cron: `30 3 * * *`
- Timezone: `Europe/Athens`
- Auth: service role key (Bearer token)

If your scheduler only supports UTC timezone, use UTC equivalent for 03:30 Athens.
