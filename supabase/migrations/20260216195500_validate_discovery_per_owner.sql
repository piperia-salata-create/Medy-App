do $$
declare
  r record;
  v_mine_id uuid;
  v_lat double precision;
  v_lon double precision;
  v_active_total integer;
  v_active_with_coords integer;
  v_excl_mine integer;
  v_within_25 integer;
begin
  for r in
    select distinct ph.owner_id
    from public.pharmacies ph
    join public.profiles pr on pr.id = ph.owner_id
    where pr.role = 'pharmacist'
    order by ph.owner_id
  loop
    select id, latitude::double precision, longitude::double precision
    into v_mine_id, v_lat, v_lon
    from public.pharmacies
    where owner_id = r.owner_id
    order by created_at desc nulls last, id
    limit 1;

    select count(*)::int
    into v_active_total
    from public.exchange_offers
    where status = 'active';

    select count(*)::int
    into v_active_with_coords
    from public.exchange_offers eo
    join public.pharmacies ph on ph.id = eo.pharmacy_id
    where eo.status = 'active'
      and ph.latitude is not null
      and ph.longitude is not null;

    select count(*)::int
    into v_excl_mine
    from public.exchange_offers eo
    join public.pharmacies ph on ph.id = eo.pharmacy_id
    where eo.status = 'active'
      and ph.latitude is not null
      and ph.longitude is not null
      and eo.pharmacy_id <> v_mine_id;

    select count(*)::int
    into v_within_25
    from public.exchange_offers eo
    join public.pharmacies ph on ph.id = eo.pharmacy_id
    where eo.status = 'active'
      and ph.latitude is not null
      and ph.longitude is not null
      and eo.pharmacy_id <> v_mine_id
      and v_lat is not null
      and v_lon is not null
      and public.haversine_km(v_lat, v_lon, ph.latitude::double precision, ph.longitude::double precision) <= 25;

    raise notice 'OWNER_DIAG={owner_id:% , mine_id:% , mine_lat:% , mine_lon:% , active_total:% , active_with_coords:% , active_excluding_mine:% , within_25km:%}',
      r.owner_id,
      coalesce(v_mine_id::text, 'NULL'),
      coalesce(v_lat::text, 'NULL'),
      coalesce(v_lon::text, 'NULL'),
      v_active_total,
      v_active_with_coords,
      v_excl_mine,
      v_within_25;
  end loop;
end
$$;
