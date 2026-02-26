-- Patient no-show reporting, rolling 30-day enforcement, and suspension guardrails.

create extension if not exists "pgcrypto";

create table if not exists public.patient_no_show_reports (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references auth.users (id) on delete cascade,
  pharmacist_id uuid not null references auth.users (id) on delete cascade,
  request_id uuid not null references public.patient_requests (id) on delete cascade,
  created_at timestamptz not null default now()
);

create unique index if not exists ux_patient_no_show_reports_pharmacist_request
  on public.patient_no_show_reports (pharmacist_id, request_id);

create index if not exists idx_patient_no_show_reports_patient_created_at
  on public.patient_no_show_reports (patient_id, created_at desc);

create index if not exists idx_patient_no_show_reports_request_id
  on public.patient_no_show_reports (request_id);

alter table public.profiles
  add column if not exists suspended_until timestamptz null;

alter table public.profiles
  add column if not exists suspension_reason text null;

alter table public.patient_no_show_reports enable row level security;

drop policy if exists "Pharmacists can view own no-show reports" on public.patient_no_show_reports;
create policy "Pharmacists can view own no-show reports"
  on public.patient_no_show_reports
  for select
  to authenticated
  using (
    pharmacist_id = auth.uid()
    and exists (
      select 1
      from public.profiles me
      where me.id = auth.uid()
        and me.role = 'pharmacist'
    )
  );

drop policy if exists "Pharmacists can insert own no-show reports" on public.patient_no_show_reports;
create policy "Pharmacists can insert own no-show reports"
  on public.patient_no_show_reports
  for insert
  to authenticated
  with check (
    auth.uid() = pharmacist_id
    and exists (
      select 1
      from public.profiles me
      where me.id = auth.uid()
        and me.role = 'pharmacist'
    )
    and exists (
      select 1
      from public.pharmacies own_pharmacy
      where own_pharmacy.owner_id = auth.uid()
        and coalesce(own_pharmacy.is_verified, true) = true
    )
    and exists (
      select 1
      from public.patient_requests pr
      join public.patient_request_recipients prr
        on prr.request_id = pr.id
       and prr.status = 'accepted'
      join public.pharmacies p
        on p.id = prr.pharmacy_id
      where pr.id = patient_no_show_reports.request_id
        and pr.patient_id = patient_no_show_reports.patient_id
        and pr.status = 'accepted'
        and pr.expires_at is not null
        and now() > pr.expires_at
        and p.owner_id = auth.uid()
    )
  );

drop policy if exists "Service role full access to no-show reports" on public.patient_no_show_reports;
create policy "Service role full access to no-show reports"
  on public.patient_no_show_reports
  for all
  to service_role
  using (true)
  with check (true);

drop function if exists public.report_patient_no_show(uuid);
create function public.report_patient_no_show(p_request_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_now timestamptz := now();
  v_request record;
  v_reports_last_30d integer := 0;
  v_suspended_until timestamptz := null;
  v_already_reported boolean := false;
begin
  if v_actor is null then
    return json_build_object(
      'status', 'not_allowed',
      'patient_id', null,
      'reports_last_30d', 0,
      'suspended_until', null
    );
  end if;

  perform set_config('row_security', 'off', true);

  if not exists (
    select 1
    from public.profiles me
    where me.id = v_actor
      and me.role = 'pharmacist'
  ) then
    return json_build_object(
      'status', 'not_allowed',
      'patient_id', null,
      'reports_last_30d', 0,
      'suspended_until', null
    );
  end if;

  if not exists (
    select 1
    from public.pharmacies own_pharmacy
    where own_pharmacy.owner_id = v_actor
      and coalesce(own_pharmacy.is_verified, true) = true
  ) then
    return json_build_object(
      'status', 'not_allowed',
      'patient_id', null,
      'reports_last_30d', 0,
      'suspended_until', null
    );
  end if;

  select
    pr.id,
    pr.patient_id,
    pr.status,
    pr.expires_at
  into v_request
  from public.patient_requests pr
  where pr.id = p_request_id
  for update;

  if v_request.id is null then
    return json_build_object(
      'status', 'not_allowed',
      'patient_id', null,
      'reports_last_30d', 0,
      'suspended_until', null
    );
  end if;

  if v_request.status <> 'accepted'
     or v_request.expires_at is null
     or v_now <= v_request.expires_at
     or not exists (
       select 1
       from public.patient_request_recipients prr
       join public.pharmacies p
         on p.id = prr.pharmacy_id
       where prr.request_id = p_request_id
         and prr.status = 'accepted'
         and p.owner_id = v_actor
     ) then
    return json_build_object(
      'status', 'not_allowed',
      'patient_id', v_request.patient_id,
      'reports_last_30d', 0,
      'suspended_until', null
    );
  end if;

  begin
    insert into public.patient_no_show_reports (
      patient_id,
      pharmacist_id,
      request_id
    ) values (
      v_request.patient_id,
      v_actor,
      p_request_id
    );
  exception
    when unique_violation then
      v_already_reported := true;
  end;

  select count(*)::integer
    into v_reports_last_30d
  from public.patient_no_show_reports r
  where r.patient_id = v_request.patient_id
    and r.created_at >= (v_now - interval '30 days');

  select p.suspended_until
    into v_suspended_until
  from public.profiles p
  where p.id = v_request.patient_id
  for update;

  if v_reports_last_30d >= 3
     and (v_suspended_until is null or v_suspended_until <= v_now) then
    v_suspended_until := v_now + interval '30 days';

    update public.profiles
    set suspended_until = v_suspended_until,
        suspension_reason = 'no_show_reports'
    where id = v_request.patient_id;
  end if;

  return json_build_object(
    'status', case when v_already_reported then 'already_reported' else 'ok' end,
    'patient_id', v_request.patient_id,
    'reports_last_30d', v_reports_last_30d,
    'suspended_until', v_suspended_until
  );
end;
$$;

revoke all on function public.report_patient_no_show(uuid) from public;
revoke all on function public.report_patient_no_show(uuid) from anon;
grant execute on function public.report_patient_no_show(uuid) to authenticated;
grant execute on function public.report_patient_no_show(uuid) to service_role;

drop function if exists public.get_patient_no_show_status();
create function public.get_patient_no_show_status()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_reports_last_30d integer := 0;
  v_suspended_until timestamptz := null;
begin
  if v_actor is null then
    return json_build_object(
      'reports_last_30d', 0,
      'suspended_until', null
    );
  end if;

  perform set_config('row_security', 'off', true);

  select count(*)::integer
    into v_reports_last_30d
  from public.patient_no_show_reports r
  where r.patient_id = v_actor
    and r.created_at >= (now() - interval '30 days');

  select p.suspended_until
    into v_suspended_until
  from public.profiles p
  where p.id = v_actor;

  return json_build_object(
    'reports_last_30d', v_reports_last_30d,
    'suspended_until', v_suspended_until
  );
end;
$$;

revoke all on function public.get_patient_no_show_status() from public;
revoke all on function public.get_patient_no_show_status() from anon;
grant execute on function public.get_patient_no_show_status() to authenticated;
grant execute on function public.get_patient_no_show_status() to service_role;

drop policy if exists "Patients can insert their own requests" on public.patient_requests;
create policy "Patients can insert their own requests"
  on public.patient_requests
  for insert
  to authenticated
  with check (
    auth.uid() = patient_id
    and exists (
      select 1
      from public.profiles me
      where me.id = auth.uid()
        and me.role = 'patient'
    )
    and not exists (
      select 1
      from public.profiles me
      where me.id = auth.uid()
        and me.suspended_until is not null
        and me.suspended_until > now()
    )
  );

drop policy if exists "Patients must not be suspended to insert requests" on public.patient_requests;
create policy "Patients must not be suspended to insert requests"
  on public.patient_requests
  as restrictive
  for insert
  to authenticated
  with check (
    not exists (
      select 1
      from public.profiles me
      where me.id = auth.uid()
        and me.suspended_until is not null
        and me.suspended_until > now()
    )
  );
