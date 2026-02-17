begin;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'exchange_demand_status'
  ) then
    create type public.exchange_demand_status as enum ('open', 'fulfilled', 'closed');
  end if;
end
$$;

create table if not exists public.exchange_demands (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies(id) on delete cascade,
  medicine_id uuid not null references public.medicines(id),
  quantity integer null check (quantity is null or quantity > 0),
  notes text null,
  status public.exchange_demand_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz null
);

create index if not exists idx_exchange_demands_medicine_status on public.exchange_demands(medicine_id, status);
create index if not exists idx_exchange_demands_pharmacy_id on public.exchange_demands(pharmacy_id);
create index if not exists idx_exchange_demands_created_at on public.exchange_demands(created_at desc);

drop trigger if exists set_exchange_demands_updated_at on public.exchange_demands;
create trigger set_exchange_demands_updated_at
before update on public.exchange_demands
for each row
execute function public.set_updated_at();

alter table public.exchange_demands enable row level security;

drop policy if exists "Demand owners can view own demands" on public.exchange_demands;
create policy "Demand owners can view own demands"
  on public.exchange_demands
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles me
      where me.id = auth.uid()
        and me.role = 'pharmacist'
    )
    and exists (
      select 1
      from public.pharmacies p
      where p.id = exchange_demands.pharmacy_id
        and p.owner_id = auth.uid()
    )
  );

drop policy if exists "Demand owners can create demands" on public.exchange_demands;
create policy "Demand owners can create demands"
  on public.exchange_demands
  for insert
  to authenticated
  with check (
    status = 'open'
    and exists (
      select 1
      from public.profiles me
      where me.id = auth.uid()
        and me.role = 'pharmacist'
    )
    and exists (
      select 1
      from public.pharmacies p
      where p.id = exchange_demands.pharmacy_id
        and p.owner_id = auth.uid()
    )
  );

drop policy if exists "Demand owners can update demands" on public.exchange_demands;
create policy "Demand owners can update demands"
  on public.exchange_demands
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.profiles me
      where me.id = auth.uid()
        and me.role = 'pharmacist'
    )
    and exists (
      select 1
      from public.pharmacies p
      where p.id = exchange_demands.pharmacy_id
        and p.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.profiles me
      where me.id = auth.uid()
        and me.role = 'pharmacist'
    )
    and exists (
      select 1
      from public.pharmacies p
      where p.id = exchange_demands.pharmacy_id
        and p.owner_id = auth.uid()
    )
  );

drop policy if exists "Demand owners can delete demands" on public.exchange_demands;
create policy "Demand owners can delete demands"
  on public.exchange_demands
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.profiles me
      where me.id = auth.uid()
        and me.role = 'pharmacist'
    )
    and exists (
      select 1
      from public.pharmacies p
      where p.id = exchange_demands.pharmacy_id
        and p.owner_id = auth.uid()
    )
  );

create or replace function public.get_demand_matches(p_demand_id uuid)
returns table (
  offer_id uuid,
  offer_pharmacy_id uuid,
  offer_pharmacy_name text,
  medicine_id uuid,
  quantity integer,
  expiry_date date,
  expiry_classification text,
  notes text,
  created_at timestamptz
)
language plpgsql
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_demand_pharmacy_id uuid;
  v_medicine_id uuid;
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;

  if p_demand_id is null then
    raise exception 'p_demand_id is required';
  end if;

  if not exists (
    select 1
    from public.profiles me
    where me.id = v_actor
      and me.role = 'pharmacist'
  ) then
    raise exception 'Only pharmacists can request demand matches';
  end if;

  select d.pharmacy_id, d.medicine_id
    into v_demand_pharmacy_id, v_medicine_id
  from public.exchange_demands d
  join public.pharmacies p on p.id = d.pharmacy_id
  where d.id = p_demand_id
    and p.owner_id = v_actor;

  if v_demand_pharmacy_id is null then
    raise exception 'Demand not found or not owned by current user';
  end if;

  return query
  select
    eo.id as offer_id,
    eo.pharmacy_id as offer_pharmacy_id,
    p.name as offer_pharmacy_name,
    eo.medicine_id,
    eo.quantity,
    eo.expiry_date,
    public.exchange_offer_expiry_classification(eo.expiry_date) as expiry_classification,
    eo.notes,
    eo.created_at
  from public.exchange_offers eo
  join public.pharmacies p on p.id = eo.pharmacy_id
  where eo.status = 'active'
    and eo.medicine_id = v_medicine_id
    and eo.pharmacy_id <> v_demand_pharmacy_id
  order by
    case public.exchange_offer_expiry_classification(eo.expiry_date)
      when 'critical' then 1
      when 'warning' then 2
      when 'normal' then 3
      else 4
    end,
    eo.created_at desc
  limit 20;
end;
$$;

create or replace function public.mark_demand_fulfilled(p_demand_id uuid)
returns table (
  demand_id uuid,
  status public.exchange_demand_status,
  closed_at timestamptz
)
language plpgsql
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;

  if p_demand_id is null then
    raise exception 'p_demand_id is required';
  end if;

  if not exists (
    select 1
    from public.profiles me
    where me.id = v_actor
      and me.role = 'pharmacist'
  ) then
    raise exception 'Only pharmacists can update demand status';
  end if;

  return query
  update public.exchange_demands d
     set status = 'fulfilled',
         closed_at = coalesce(d.closed_at, now())
   where d.id = p_demand_id
     and d.status = 'open'
     and exists (
       select 1
       from public.pharmacies p
       where p.id = d.pharmacy_id
         and p.owner_id = v_actor
     )
  returning d.id, d.status, d.closed_at;

  if not found then
    raise exception 'Demand not found, not open, or not owned by current user';
  end if;
end;
$$;

revoke all on function public.get_demand_matches(uuid) from public;
revoke all on function public.get_demand_matches(uuid) from anon;
grant execute on function public.get_demand_matches(uuid) to authenticated;

revoke all on function public.mark_demand_fulfilled(uuid) from public;
revoke all on function public.mark_demand_fulfilled(uuid) from anon;
grant execute on function public.mark_demand_fulfilled(uuid) to authenticated;

create table if not exists public.exchange_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('demand_match', 'offer_match')),
  title text not null,
  body text not null,
  data jsonb null,
  created_at timestamptz not null default now(),
  read_at timestamptz null
);

create index if not exists idx_exchange_notifications_recipient_created_at
  on public.exchange_notifications(recipient_user_id, created_at desc);
create index if not exists idx_exchange_notifications_kind on public.exchange_notifications(kind);
create index if not exists idx_exchange_notifications_read_at on public.exchange_notifications(read_at);

alter table public.exchange_notifications enable row level security;

drop policy if exists "Recipients can view own exchange notifications" on public.exchange_notifications;
create policy "Recipients can view own exchange notifications"
  on public.exchange_notifications
  for select
  to authenticated
  using (recipient_user_id = auth.uid());

drop policy if exists "Recipients can update own exchange notifications" on public.exchange_notifications;
create policy "Recipients can update own exchange notifications"
  on public.exchange_notifications
  for update
  to authenticated
  using (recipient_user_id = auth.uid())
  with check (recipient_user_id = auth.uid());

create or replace function public.enqueue_exchange_notification(
  p_recipient_user_id uuid,
  p_kind text,
  p_title text,
  p_body text,
  p_data jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_recipient_user_id is null then
    raise exception 'recipient_user_id is required';
  end if;

  insert into public.exchange_notifications (
    recipient_user_id,
    kind,
    title,
    body,
    data
  )
  values (
    p_recipient_user_id,
    p_kind,
    p_title,
    p_body,
    p_data
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.enqueue_exchange_notification(uuid, text, text, text, jsonb) from public;
revoke all on function public.enqueue_exchange_notification(uuid, text, text, text, jsonb) from anon;
revoke all on function public.enqueue_exchange_notification(uuid, text, text, text, jsonb) from authenticated;
grant execute on function public.enqueue_exchange_notification(uuid, text, text, text, jsonb) to service_role;

create or replace function public.notify_offer_owners_for_new_demand()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_demand_owner uuid;
  rec record;
begin
  if new.status <> 'open' then
    return new;
  end if;

  select p.owner_id
    into v_demand_owner
  from public.pharmacies p
  where p.id = new.pharmacy_id;

  if v_demand_owner is null then
    return new;
  end if;

  for rec in
    select distinct
      p.owner_id as recipient_user_id,
      eo.id as offer_id
    from public.exchange_offers eo
    join public.pharmacies p on p.id = eo.pharmacy_id
    where eo.status = 'active'
      and eo.medicine_id = new.medicine_id
      and p.owner_id is not null
      and p.owner_id <> v_demand_owner
  loop
    perform public.enqueue_exchange_notification(
      rec.recipient_user_id,
      'demand_match',
      'New demand matches your active offer',
      'A pharmacy posted a demand that matches one of your active offers.',
      jsonb_build_object(
        'medicine_id', new.medicine_id,
        'demand_id', new.id,
        'offer_id', rec.offer_id
      )
    );
  end loop;

  return new;
end;
$$;

create or replace function public.notify_demand_owners_for_new_offer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offer_owner uuid;
  rec record;
begin
  if new.status <> 'active' then
    return new;
  end if;

  select p.owner_id
    into v_offer_owner
  from public.pharmacies p
  where p.id = new.pharmacy_id;

  if v_offer_owner is null then
    return new;
  end if;

  for rec in
    select
      p.owner_id as recipient_user_id,
      min(d.id) as demand_id,
      count(*)::integer as demand_count
    from public.exchange_demands d
    join public.pharmacies p on p.id = d.pharmacy_id
    where d.status = 'open'
      and d.medicine_id = new.medicine_id
      and d.created_at >= now() - interval '7 days'
      and p.owner_id is not null
      and p.owner_id <> v_offer_owner
    group by p.owner_id
  loop
    perform public.enqueue_exchange_notification(
      rec.recipient_user_id,
      'offer_match',
      'New offer matches your open demand',
      'A pharmacy posted an active offer that matches your recent demand.',
      jsonb_build_object(
        'medicine_id', new.medicine_id,
        'offer_id', new.id,
        'sample_demand_id', rec.demand_id,
        'open_demand_count', rec.demand_count
      )
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists notify_offer_owners_for_new_demand_tg on public.exchange_demands;
create trigger notify_offer_owners_for_new_demand_tg
after insert on public.exchange_demands
for each row
execute function public.notify_offer_owners_for_new_demand();

drop trigger if exists notify_demand_owners_for_new_offer_tg on public.exchange_offers;
create trigger notify_demand_owners_for_new_offer_tg
after insert on public.exchange_offers
for each row
execute function public.notify_demand_owners_for_new_offer();

revoke all on table public.exchange_demands from anon;
revoke all on table public.exchange_notifications from anon;
revoke all on table public.exchange_demands from authenticated;
revoke all on table public.exchange_notifications from authenticated;

grant select, insert, update, delete on table public.exchange_demands to authenticated;
grant select, update on table public.exchange_notifications to authenticated;

do $$
begin
  begin
    alter publication supabase_realtime add table public.exchange_demands;
  exception when duplicate_object then
    null;
  end;

  begin
    alter publication supabase_realtime add table public.exchange_notifications;
  exception when duplicate_object then
    null;
  end;
end
$$;

commit;
