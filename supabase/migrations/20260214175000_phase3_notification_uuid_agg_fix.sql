begin;

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
      (array_agg(d.id order by d.created_at asc, d.id asc))[1] as demand_id,
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

commit;
