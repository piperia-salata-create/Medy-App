-- Patient requests retention support:
-- Keep expired requests visible for 7 days, then hide via soft delete and purge later.

alter table public.patient_requests
  add column if not exists deleted_at timestamptz null;

create index if not exists idx_patient_requests_expires_at
  on public.patient_requests (expires_at);

create index if not exists idx_patient_requests_deleted_at
  on public.patient_requests (deleted_at);
