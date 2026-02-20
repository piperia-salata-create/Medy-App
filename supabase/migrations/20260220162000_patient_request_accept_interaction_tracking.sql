-- Track pharmacist ACCEPT interaction so pre-accept patient cancellations can be excluded downstream.

alter table public.patient_requests
  add column if not exists accepted_at timestamptz null;

-- Backfill for historical rows where an ACCEPT already happened.
update public.patient_requests pr
   set accepted_at = coalesce(pr.accepted_at, acc.first_accepted_at)
  from (
    select prr.request_id, min(coalesce(prr.responded_at, prr.updated_at)) as first_accepted_at
    from public.patient_request_recipients prr
    where prr.status = 'accepted'
    group by prr.request_id
  ) acc
 where pr.id = acc.request_id
   and pr.accepted_at is null;

create index if not exists idx_patient_requests_status_accepted_at
  on public.patient_requests(status, accepted_at);

create or replace function public.sync_patient_request_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id uuid;
  v_total integer;
  v_accepted integer;
  v_rejected integer;
  v_current_status text;
begin
  v_request_id := coalesce(new.request_id, old.request_id);

  select status into v_current_status
  from public.patient_requests
  where id = v_request_id;

  if v_current_status is null then
    return null;
  end if;

  -- Do not override terminal statuses or accepted.
  if v_current_status in ('accepted', 'closed', 'cancelled', 'expired') then
    return null;
  end if;

  select count(*),
         count(*) filter (where status = 'accepted'),
         count(*) filter (where status = 'rejected')
    into v_total, v_accepted, v_rejected
  from public.patient_request_recipients
  where request_id = v_request_id;

  if v_accepted > 0 then
    update public.patient_requests
       set status = 'accepted',
           accepted_at = coalesce(accepted_at, now())
     where id = v_request_id;
  elsif v_total > 0 and v_rejected = v_total then
    update public.patient_requests
       set status = 'rejected'
     where id = v_request_id;
  else
    update public.patient_requests
       set status = 'pending'
     where id = v_request_id;
  end if;

  return null;
end;
$$;
