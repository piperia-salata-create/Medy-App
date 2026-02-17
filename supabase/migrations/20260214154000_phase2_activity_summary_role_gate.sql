begin;

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
where p.owner_id = auth.uid()
  and exists (
    select 1
    from public.profiles me
    where me.id = auth.uid()
      and me.role = 'pharmacist'
  );

revoke all on table public.exchange_activity_summary from anon;
grant select on table public.exchange_activity_summary to authenticated;

commit;
