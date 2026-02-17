begin;

do $$
declare
  v_violating_offers integer := 0;
  v_demoted_requests integer := 0;
begin
  select count(*)
    into v_violating_offers
  from (
    select er.offer_id
    from public.exchange_requests er
    where er.status = 'accepted'
    group by er.offer_id
    having count(*) > 1
  ) violating;

  if v_violating_offers > 0 then
    alter table public.exchange_requests disable trigger validate_exchange_request_write_tg;

    with ranked as (
      select
        er.id,
        row_number() over (
          partition by er.offer_id
          order by er.responded_at asc nulls last, er.created_at asc, er.id asc
        ) as rn
      from public.exchange_requests er
      where er.status = 'accepted'
    )
    update public.exchange_requests er
       set status = 'rejected',
           responded_at = coalesce(er.responded_at, now())
      from ranked r
     where er.id = r.id
       and r.rn > 1;

    get diagnostics v_demoted_requests = row_count;

    alter table public.exchange_requests enable trigger validate_exchange_request_write_tg;

    raise notice 'Phase 2.1 normalization applied: violating offers %, demoted accepted requests %.',
      v_violating_offers,
      v_demoted_requests;
  else
    raise notice 'Phase 2.1 normalization skipped: no accepted-request conflicts found.';
  end if;
end
$$;

create unique index if not exists idx_exchange_requests_one_accepted_per_offer
  on public.exchange_requests(offer_id)
  where status = 'accepted';

commit;
