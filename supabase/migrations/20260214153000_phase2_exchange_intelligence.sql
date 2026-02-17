begin;

create or replace function public.exchange_offer_expiry_classification(p_expiry_date date)
returns text
language sql
stable
as $$
  select case
    when p_expiry_date is not null and p_expiry_date < current_date then 'expired'
    when p_expiry_date is not null and p_expiry_date <= current_date + 30 then 'critical'
    when p_expiry_date is not null and p_expiry_date <= current_date + 90 then 'warning'
    else 'normal'
  end;
$$;

create or replace view public.exchange_active_offer_expiry_intelligence
with (security_invoker = true)
as
select
  eo.id,
  eo.pharmacy_id,
  eo.medicine_id,
  eo.quantity,
  eo.expiry_date,
  eo.notes,
  eo.status,
  eo.created_at,
  eo.updated_at,
  public.exchange_offer_expiry_classification(eo.expiry_date) as expiry_classification
from public.exchange_offers eo
where eo.status = 'active';

revoke all on table public.exchange_active_offer_expiry_intelligence from anon;
grant select on table public.exchange_active_offer_expiry_intelligence to authenticated;

create or replace function public.expire_old_offers()
returns table(updated_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer := 0;
begin
  update public.exchange_offers eo
     set status = 'withdrawn',
         updated_at = now()
   where eo.status = 'active'
     and eo.expiry_date is not null
     and eo.expiry_date < current_date;

  get diagnostics v_updated = row_count;

  return query select v_updated;
end;
$$;

revoke all on function public.expire_old_offers() from public;
revoke all on function public.expire_old_offers() from anon;
revoke all on function public.expire_old_offers() from authenticated;
grant execute on function public.expire_old_offers() to service_role;

create or replace function public.validate_exchange_request_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_offer_pharmacy_id uuid;
  v_offer_status public.exchange_offer_status;
  v_is_requester_owner boolean;
  v_is_offer_owner boolean;
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;

  if tg_op = 'INSERT' then
    select eo.pharmacy_id
      into v_offer_pharmacy_id
    from public.exchange_offers eo
    where eo.id = new.offer_id;

    if v_offer_pharmacy_id is null then
      raise exception 'Offer not found';
    end if;

    if new.requesting_pharmacy_id = v_offer_pharmacy_id then
      raise exception 'Cannot request your own offer';
    end if;

    if new.status <> 'pending' then
      raise exception 'Initial status must be pending';
    end if;

    return new;
  end if;

  if new.offer_id <> old.offer_id then
    raise exception 'offer_id is immutable';
  end if;

  if new.requesting_pharmacy_id <> old.requesting_pharmacy_id then
    raise exception 'requesting_pharmacy_id is immutable';
  end if;

  select exists (
    select 1
    from public.pharmacies p
    where p.id = new.requesting_pharmacy_id
      and p.owner_id = v_actor
  ) into v_is_requester_owner;

  select exists (
    select 1
    from public.exchange_offers eo
    join public.pharmacies p on p.id = eo.pharmacy_id
    where eo.id = new.offer_id
      and p.owner_id = v_actor
  ) into v_is_offer_owner;

  if not (v_is_requester_owner or v_is_offer_owner) then
    raise exception 'Not allowed to update this request';
  end if;

  if new.status = old.status then
    return new;
  end if;

  if new.status = 'cancelled' then
    if not v_is_requester_owner then
      raise exception 'Only requesting pharmacy can cancel';
    end if;
    if old.status <> 'pending' then
      raise exception 'Only pending requests can be cancelled';
    end if;
    if new.responded_at is null then
      new.responded_at = now();
    end if;
    return new;
  end if;

  if new.status in ('accepted', 'rejected') then
    if not v_is_offer_owner then
      raise exception 'Only offer pharmacy can accept/reject';
    end if;
    if old.status <> 'pending' then
      raise exception 'Only pending requests can be accepted/rejected';
    end if;

    if new.status = 'accepted' then
      select eo.status
        into v_offer_status
      from public.exchange_offers eo
      where eo.id = new.offer_id
      for update;

      if v_offer_status is null then
        raise exception 'Offer not found';
      end if;

      if v_offer_status <> 'active' then
        raise exception 'Offer must be active before accepting a request';
      end if;
    end if;

    if new.responded_at is null then
      new.responded_at = now();
    end if;
    return new;
  end if;

  if new.status = 'completed' then
    if old.status <> 'accepted' then
      raise exception 'Only accepted requests can be marked completed';
    end if;
    if not (v_is_requester_owner or v_is_offer_owner) then
      raise exception 'Only exchange parties can mark completed';
    end if;
    if new.responded_at is null then
      new.responded_at = now();
    end if;
    return new;
  end if;

  raise exception 'Invalid status transition from % to %', old.status, new.status;
end;
$$;

create or replace function public.sync_offer_status_from_exchange_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_has_pending boolean := false;
  v_has_accepted_or_completed boolean := false;
begin
  if tg_op <> 'UPDATE' then
    return null;
  end if;

  if new.status = 'accepted' and old.status <> 'accepted' then
    update public.exchange_offers
       set status = 'matched'
     where id = new.offer_id
       and status = 'active';
  end if;

  if new.status in ('rejected', 'cancelled') and old.status = 'pending' then
    select exists (
      select 1
      from public.exchange_requests er
      where er.offer_id = new.offer_id
        and er.status = 'pending'
    )
    into v_has_pending;

    select exists (
      select 1
      from public.exchange_requests er
      where er.offer_id = new.offer_id
        and er.status in ('accepted', 'completed')
    )
    into v_has_accepted_or_completed;

    if not v_has_pending and not v_has_accepted_or_completed then
      update public.exchange_offers
         set status = 'active'
       where id = new.offer_id
         and status = 'matched';
    end if;
  end if;

  return null;
end;
$$;

create or replace function public.suggest_exchange_matches(
  p_medicine_id uuid,
  p_pharmacy_id uuid
)
returns table (
  offer_id uuid,
  offer_pharmacy_id uuid,
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
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;

  if p_medicine_id is null or p_pharmacy_id is null then
    raise exception 'p_medicine_id and p_pharmacy_id are required';
  end if;

  if not exists (
    select 1
    from public.profiles me
    where me.id = v_actor
      and me.role = 'pharmacist'
  ) then
    raise exception 'Only pharmacists can request exchange suggestions';
  end if;

  if not exists (
    select 1
    from public.pharmacies p
    where p.id = p_pharmacy_id
      and p.owner_id = v_actor
  ) then
    raise exception 'Not authorized for the supplied pharmacy';
  end if;

  return query
  select
    eo.id as offer_id,
    eo.pharmacy_id as offer_pharmacy_id,
    eo.medicine_id,
    eo.quantity,
    eo.expiry_date,
    public.exchange_offer_expiry_classification(eo.expiry_date) as expiry_classification,
    eo.notes,
    eo.created_at
  from public.exchange_offers eo
  where eo.status = 'active'
    and eo.medicine_id = p_medicine_id
    and eo.pharmacy_id <> p_pharmacy_id
  order by
    case public.exchange_offer_expiry_classification(eo.expiry_date)
      when 'critical' then 1
      when 'warning' then 2
      when 'normal' then 3
      else 4
    end,
    eo.created_at desc;
end;
$$;

revoke all on function public.suggest_exchange_matches(uuid, uuid) from public;
revoke all on function public.suggest_exchange_matches(uuid, uuid) from anon;
grant execute on function public.suggest_exchange_matches(uuid, uuid) to authenticated;

create or replace view public.exchange_activity_summary
with (security_invoker = true)
as
select
  p.id as pharmacy_id,
  (
    select count(*)
    from public.exchange_offers eo
    where eo.pharmacy_id = p.id
  )::bigint as total_offers_posted,
  (
    select count(*)
    from public.exchange_requests er
    where er.requesting_pharmacy_id = p.id
  )::bigint as total_requests_sent,
  (
    select count(*)
    from public.exchange_requests er
    join public.exchange_offers eo on eo.id = er.offer_id
    where eo.pharmacy_id = p.id
  )::bigint as total_requests_received,
  (
    select count(*)
    from public.exchange_requests er
    join public.exchange_offers eo on eo.id = er.offer_id
    where er.status = 'completed'
      and (
        er.requesting_pharmacy_id = p.id
        or eo.pharmacy_id = p.id
      )
  )::bigint as total_completed,
  (
    (
      select count(*)
      from public.exchange_offers eo
      where eo.pharmacy_id = p.id
    ) = 0
    and
    (
      select count(*)
      from public.exchange_requests er
      where er.requesting_pharmacy_id = p.id
    ) > 3
  ) as needs_offer_participation
from public.pharmacies p
where p.owner_id = auth.uid();

revoke all on table public.exchange_activity_summary from anon;
grant select on table public.exchange_activity_summary to authenticated;

commit;
