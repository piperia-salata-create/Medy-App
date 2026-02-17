begin;

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
  left join public.pharmacies p on p.id = eo.pharmacy_id
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

commit;
