do $$
declare
  v_my_user uuid;
  v_my_pharmacy_id uuid;
  v_my_lat double precision;
  v_my_lon double precision;
  v_other_pharmacy_id uuid;
  v_other_lat double precision;
  v_other_lon double precision;
  v_distance_km double precision;
  v_rows_within_25 integer;
  v_rows_excl_mine integer;
  v_rows_active integer;
  v_rows_active_with_coords integer;
begin
  /*
    Runtime diagnostics only.
    No schema/data mutation.
  */

  -- Pick a deterministic pharmacist owner for explicit simulation.
  select ph.owner_id
  into v_my_user
  from public.pharmacies ph
  join public.profiles pr on pr.id = ph.owner_id
  where pr.role = 'pharmacist'
  order by ph.created_at desc nulls last, ph.id
  limit 1;

  raise notice 'STEP0_SELECTED_MY_USER_UUID=%', coalesce(v_my_user::text, 'NULL');

  -- 1) Verify my pharmacy resolution (explicit owner_id simulation)
  raise notice 'STEP1_QUERY_ROWS=%',
    (
      select coalesce(json_agg(row_to_json(t))::text, '[]')
      from (
        select id, owner_id, latitude, longitude
        from public.pharmacies
        where owner_id = v_my_user
        order by created_at desc nulls last, id
        limit 5
      ) t
    );

  select id, latitude::double precision, longitude::double precision
  into v_my_pharmacy_id, v_my_lat, v_my_lon
  from public.pharmacies
  where owner_id = v_my_user
  order by created_at desc nulls last, id
  limit 1;

  raise notice 'STEP1_SELECTED_MINE={id:% , lat:% , lon:%}', coalesce(v_my_pharmacy_id::text, 'NULL'), coalesce(v_my_lat::text, 'NULL'), coalesce(v_my_lon::text, 'NULL');

  -- 2) Verify other pharmacies have coordinates
  raise notice 'STEP2_COUNTS=%',
    (
      select row_to_json(t)::text
      from (
        select
          count(*)::int as total,
          count(*) filter (where latitude is not null and longitude is not null)::int as with_coords
        from public.pharmacies
      ) t
    );

  raise notice 'STEP2_SAMPLE_WITH_COORDS=%',
    (
      select coalesce(json_agg(row_to_json(t))::text, '[]')
      from (
        select id, latitude, longitude
        from public.pharmacies
        where latitude is not null and longitude is not null
        order by id
        limit 10
      ) t
    );

  -- 3) Manual distance test: my pharmacy vs one other pharmacy
  select ph.id, ph.latitude::double precision, ph.longitude::double precision
  into v_other_pharmacy_id, v_other_lat, v_other_lon
  from public.pharmacies ph
  where ph.id <> v_my_pharmacy_id
    and ph.latitude is not null
    and ph.longitude is not null
  order by ph.id
  limit 1;

  if v_my_lat is not null and v_my_lon is not null and v_other_lat is not null and v_other_lon is not null then
    select public.haversine_km(v_my_lat, v_my_lon, v_other_lat, v_other_lon)
    into v_distance_km;
  else
    v_distance_km := null;
  end if;

  raise notice 'STEP3_DISTANCE_TEST={my_pharmacy_id:% , my_lat:% , my_lon:% , other_pharmacy_id:% , other_lat:% , other_lon:% , distance_km:%}',
    coalesce(v_my_pharmacy_id::text, 'NULL'),
    coalesce(v_my_lat::text, 'NULL'),
    coalesce(v_my_lon::text, 'NULL'),
    coalesce(v_other_pharmacy_id::text, 'NULL'),
    coalesce(v_other_lat::text, 'NULL'),
    coalesce(v_other_lon::text, 'NULL'),
    coalesce(v_distance_km::text, 'NULL');

  -- 4) Simulate RPC logic with explicit owner_id
  select count(*)::int
  into v_rows_within_25
  from (
    with mine as (
      select id, latitude::double precision as lat, longitude::double precision as lon
      from public.pharmacies
      where owner_id = v_my_user
      order by created_at desc nulls last, id
      limit 1
    ),
    offers as (
      select
        eo.id,
        eo.pharmacy_id,
        public.haversine_km(m.lat, m.lon, ph.latitude::double precision, ph.longitude::double precision) as distance_km
      from mine m
      join public.exchange_offers eo on eo.status = 'active'
      join public.pharmacies ph on ph.id = eo.pharmacy_id
      where ph.latitude is not null and ph.longitude is not null
        and eo.pharmacy_id <> m.id
    )
    select *
    from offers
    where distance_km <= 25
  ) q;

  raise notice 'STEP4_ROWS_WITHIN_25KM=%', coalesce(v_rows_within_25::text, 'NULL');

  raise notice 'STEP4_SAMPLE_WITHIN_25KM=%',
    (
      select coalesce(json_agg(row_to_json(t))::text, '[]')
      from (
        with mine as (
          select id, latitude::double precision as lat, longitude::double precision as lon
          from public.pharmacies
          where owner_id = v_my_user
          order by created_at desc nulls last, id
          limit 1
        ),
        offers as (
          select
            eo.id,
            eo.pharmacy_id,
            public.haversine_km(m.lat, m.lon, ph.latitude::double precision, ph.longitude::double precision) as distance_km
          from mine m
          join public.exchange_offers eo on eo.status = 'active'
          join public.pharmacies ph on ph.id = eo.pharmacy_id
          where ph.latitude is not null and ph.longitude is not null
            and eo.pharmacy_id <> m.id
        )
        select *
        from offers
        where distance_km <= 25
        order by distance_km asc
        limit 5
      ) t
    );

  -- 5) Check if exclusion/coords are over-filtering
  select count(*)::int
  into v_rows_active
  from public.exchange_offers
  where status = 'active';

  select count(*)::int
  into v_rows_active_with_coords
  from public.exchange_offers eo
  join public.pharmacies ph on ph.id = eo.pharmacy_id
  where eo.status = 'active'
    and ph.latitude is not null
    and ph.longitude is not null;

  select count(*)::int
  into v_rows_excl_mine
  from (
    with mine as (
      select id
      from public.pharmacies
      where owner_id = v_my_user
      order by created_at desc nulls last, id
      limit 1
    )
    select eo.id
    from mine m
    join public.exchange_offers eo on eo.status = 'active'
    join public.pharmacies ph on ph.id = eo.pharmacy_id
    where ph.latitude is not null and ph.longitude is not null
      and eo.pharmacy_id <> m.id
  ) q;

  raise notice 'STEP5_COUNTS={active_total:% , active_with_coords:% , active_with_coords_excluding_mine:%}',
    v_rows_active, v_rows_active_with_coords, v_rows_excl_mine;

  -- 6) Lat/lon inversion check
  raise notice 'STEP6_INVALID_COORD_ROWS=%',
    (
      select coalesce(json_agg(row_to_json(t))::text, '[]')
      from (
        select id, latitude, longitude
        from public.pharmacies
        where latitude not between -90 and 90
           or longitude not between -180 and 180
        order by id
      ) t
    );
end
$$;
