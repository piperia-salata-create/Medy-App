begin;

alter table public.pharmacies
  add column if not exists city text,
  add column if not exists region text;

drop function if exists public.get_active_exchange_offers_for_pharmacist(integer, boolean);
create function public.get_active_exchange_offers_for_pharmacist(
  p_radius_km integer default 25,
  p_nationwide boolean default false
)
returns table (
  id uuid,
  pharmacy_id uuid,
  pharmacy_name text,
  pharmacy_city text,
  pharmacy_region text,
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
      ph.city as pharmacy_city,
      ph.region as pharmacy_region,
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
    o.pharmacy_city,
    o.pharmacy_region,
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

drop function if exists public.get_demand_matches(uuid, integer, boolean);
create function public.get_demand_matches(
  p_demand_id uuid,
  p_radius_km integer default 25,
  p_nationwide boolean default false
)
returns table (
  offer_id uuid,
  offer_pharmacy_id uuid,
  offer_pharmacy_name text,
  offer_pharmacy_city text,
  offer_pharmacy_region text,
  medicine_id uuid,
  quantity integer,
  expiry_date date,
  expiry_classification text,
  notes text,
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
      p.city as offer_pharmacy_city,
      p.region as offer_pharmacy_region,
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
    o.offer_pharmacy_city,
    o.offer_pharmacy_region,
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

commit;
