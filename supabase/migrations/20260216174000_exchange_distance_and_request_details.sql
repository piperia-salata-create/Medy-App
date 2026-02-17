begin;

create index if not exists idx_pharmacies_lat_lng_not_null
  on public.pharmacies (latitude, longitude)
  where latitude is not null and longitude is not null;

create index if not exists idx_exchange_offers_active_created_at
  on public.exchange_offers (created_at desc)
  where status = 'active';

create index if not exists idx_exchange_offers_active_medicine
  on public.exchange_offers (medicine_id, created_at desc)
  where status = 'active';

create or replace function public.haversine_km(
  p_lat1 double precision,
  p_lng1 double precision,
  p_lat2 double precision,
  p_lng2 double precision
)
returns double precision
language sql
immutable
strict
as $$
  select
    6371.0088 * 2 * asin(
      sqrt(
        power(sin(radians((p_lat2 - p_lat1) / 2)), 2)
        + cos(radians(p_lat1)) * cos(radians(p_lat2))
        * power(sin(radians((p_lng2 - p_lng1) / 2)), 2)
      )
    );
$$;

create or replace function public.get_active_exchange_offers_for_pharmacist(
  p_radius_km integer default 25,
  p_nationwide boolean default false
)
returns table (
  id uuid,
  pharmacy_id uuid,
  pharmacy_name text,
  medicine_id uuid,
  quantity integer,
  expiry_date date,
  notes text,
  status text,
  created_at timestamptz,
  distance_km double precision
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_pharmacy_id uuid;
  v_actor_lat double precision;
  v_actor_lng double precision;
  v_radius integer := greatest(1, coalesce(p_radius_km, 25));
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1
    from public.profiles me
    where me.id = v_actor
      and me.role = 'pharmacist'
  ) then
    raise exception 'Only pharmacists can read active exchange offers';
  end if;

  select p.id, p.latitude::double precision, p.longitude::double precision
    into v_actor_pharmacy_id, v_actor_lat, v_actor_lng
  from public.pharmacies p
  where p.owner_id = v_actor
  order by p.created_at desc nulls last, p.id
  limit 1;

  return query
  with offers as (
    select
      eo.id,
      eo.pharmacy_id,
      ph.name as pharmacy_name,
      eo.medicine_id,
      eo.quantity,
      eo.expiry_date,
      eo.notes,
      eo.status::text as status,
      eo.created_at,
      case
        when v_actor_lat is not null and v_actor_lng is not null
          and ph.latitude is not null and ph.longitude is not null
        then round(
          public.haversine_km(
            v_actor_lat,
            v_actor_lng,
            ph.latitude::double precision,
            ph.longitude::double precision
          )::numeric,
          2
        )::double precision
        else null
      end as distance_km
    from public.exchange_offers eo
    join public.pharmacies ph on ph.id = eo.pharmacy_id
    where eo.status = 'active'
      and (v_actor_pharmacy_id is null or eo.pharmacy_id <> v_actor_pharmacy_id)
  )
  select
    o.id,
    o.pharmacy_id,
    o.pharmacy_name,
    o.medicine_id,
    o.quantity,
    o.expiry_date,
    o.notes,
    o.status,
    o.created_at,
    o.distance_km
  from offers o
  where
    p_nationwide
    or v_actor_lat is null
    or v_actor_lng is null
    or (o.distance_km is not null and o.distance_km <= v_radius)
  order by
    case when o.distance_km is null then 1 else 0 end,
    o.distance_km asc nulls last,
    o.created_at desc;
end;
$$;

revoke all on function public.get_active_exchange_offers_for_pharmacist(integer, boolean) from public;
revoke all on function public.get_active_exchange_offers_for_pharmacist(integer, boolean) from anon;
grant execute on function public.get_active_exchange_offers_for_pharmacist(integer, boolean) to authenticated;
grant execute on function public.get_active_exchange_offers_for_pharmacist(integer, boolean) to service_role;

create or replace function public.get_demand_matches(
  p_demand_id uuid,
  p_radius_km integer default 25,
  p_nationwide boolean default false
)
returns table (
  offer_id uuid,
  offer_pharmacy_id uuid,
  offer_pharmacy_name text,
  medicine_id uuid,
  quantity integer,
  expiry_date date,
  expiry_classification text,
  notes text,
  created_at timestamptz,
  distance_km double precision
)
language plpgsql
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_demand_pharmacy_id uuid;
  v_medicine_id uuid;
  v_demand_lat double precision;
  v_demand_lng double precision;
  v_radius integer := greatest(1, coalesce(p_radius_km, 25));
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

  select d.pharmacy_id, d.medicine_id, p.latitude::double precision, p.longitude::double precision
    into v_demand_pharmacy_id, v_medicine_id, v_demand_lat, v_demand_lng
  from public.exchange_demands d
  join public.pharmacies p on p.id = d.pharmacy_id
  where d.id = p_demand_id
    and p.owner_id = v_actor;

  if v_demand_pharmacy_id is null then
    raise exception 'Demand not found or not owned by current user';
  end if;

  return query
  with offers as (
    select
      eo.id as offer_id,
      eo.pharmacy_id as offer_pharmacy_id,
      p.name as offer_pharmacy_name,
      eo.medicine_id,
      eo.quantity,
      eo.expiry_date,
      public.exchange_offer_expiry_classification(eo.expiry_date) as expiry_classification,
      eo.notes,
      eo.created_at,
      case
        when v_demand_lat is not null and v_demand_lng is not null
          and p.latitude is not null and p.longitude is not null
        then round(
          public.haversine_km(
            v_demand_lat,
            v_demand_lng,
            p.latitude::double precision,
            p.longitude::double precision
          )::numeric,
          2
        )::double precision
        else null
      end as distance_km
    from public.exchange_offers eo
    left join public.pharmacies p on p.id = eo.pharmacy_id
    where eo.status = 'active'
      and eo.medicine_id = v_medicine_id
      and eo.pharmacy_id <> v_demand_pharmacy_id
  )
  select
    o.offer_id,
    o.offer_pharmacy_id,
    o.offer_pharmacy_name,
    o.medicine_id,
    o.quantity,
    o.expiry_date,
    o.expiry_classification,
    o.notes,
    o.created_at,
    o.distance_km
  from offers o
  where
    p_nationwide
    or v_demand_lat is null
    or v_demand_lng is null
    or (o.distance_km is not null and o.distance_km <= v_radius)
  order by
    case when o.distance_km is null then 1 else 0 end,
    o.distance_km asc nulls last,
    case o.expiry_classification
      when 'critical' then 1
      when 'warning' then 2
      when 'normal' then 3
      else 4
    end,
    o.created_at desc
  limit 20;
end;
$$;

revoke all on function public.get_demand_matches(uuid, integer, boolean) from public;
revoke all on function public.get_demand_matches(uuid, integer, boolean) from anon;
grant execute on function public.get_demand_matches(uuid, integer, boolean) to authenticated;
grant execute on function public.get_demand_matches(uuid, integer, boolean) to service_role;

create or replace function public.get_exchange_request_details(p_request_id uuid)
returns table (
  request_id uuid,
  request_status text,
  requested_at timestamptz,
  responded_at timestamptz,
  request_message text,
  offer_id uuid,
  offer_status text,
  offer_quantity integer,
  offer_expiry_date date,
  offer_notes text,
  medicine_id uuid,
  medicine_name text,
  requester_pharmacy_id uuid,
  requester_pharmacy_name text,
  target_pharmacy_id uuid,
  target_pharmacy_name text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;

  if p_request_id is null then
    raise exception 'p_request_id is required';
  end if;

  if not exists (
    select 1
    from public.profiles me
    where me.id = v_actor
      and me.role = 'pharmacist'
  ) then
    raise exception 'Only pharmacists can read request details';
  end if;

  return query
  select
    er.id as request_id,
    er.status::text as request_status,
    er.created_at as requested_at,
    er.responded_at,
    er.message as request_message,
    eo.id as offer_id,
    eo.status::text as offer_status,
    eo.quantity as offer_quantity,
    eo.expiry_date as offer_expiry_date,
    eo.notes as offer_notes,
    eo.medicine_id,
    m.name as medicine_name,
    requester.id as requester_pharmacy_id,
    requester.name as requester_pharmacy_name,
    target.id as target_pharmacy_id,
    target.name as target_pharmacy_name
  from public.exchange_requests er
  join public.exchange_offers eo on eo.id = er.offer_id
  join public.pharmacies requester on requester.id = er.requesting_pharmacy_id
  join public.pharmacies target on target.id = eo.pharmacy_id
  left join public.medicines m on m.id = eo.medicine_id
  where er.id = p_request_id
    and (requester.owner_id = v_actor or target.owner_id = v_actor)
  limit 1;

  if not found then
    raise exception 'Request not found or access denied';
  end if;
end;
$$;

revoke all on function public.get_exchange_request_details(uuid) from public;
revoke all on function public.get_exchange_request_details(uuid) from anon;
grant execute on function public.get_exchange_request_details(uuid) to authenticated;
grant execute on function public.get_exchange_request_details(uuid) to service_role;

commit;
