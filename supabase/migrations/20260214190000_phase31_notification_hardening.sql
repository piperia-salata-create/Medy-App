begin;

create index if not exists idx_exchange_notifications_recipient_read_created_at
  on public.exchange_notifications(recipient_user_id, read_at, created_at desc);

create index if not exists idx_exchange_demands_pharmacy_status_created_at
  on public.exchange_demands(pharmacy_id, status, created_at desc);

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
  v_existing_id uuid;
  v_dedupe_window interval := interval '60 minutes';
  v_offer_id text;
  v_demand_id text;
  v_medicine_id text;
begin
  if p_recipient_user_id is null then
    raise exception 'recipient_user_id is required';
  end if;

  v_offer_id := nullif(trim(coalesce(p_data ->> 'offer_id', '')), '');
  v_demand_id := nullif(trim(coalesce(p_data ->> 'demand_id', p_data ->> 'sample_demand_id', '')), '');
  v_medicine_id := nullif(trim(coalesce(p_data ->> 'medicine_id', '')), '');

  select n.id
    into v_existing_id
  from public.exchange_notifications n
  where n.recipient_user_id = p_recipient_user_id
    and n.kind = p_kind
    and n.created_at >= now() - v_dedupe_window
    and (
      (
        v_offer_id is not null
        and v_demand_id is not null
        and n.data ->> 'offer_id' = v_offer_id
        and coalesce(n.data ->> 'demand_id', n.data ->> 'sample_demand_id') = v_demand_id
      )
      or (
        v_offer_id is not null
        and v_demand_id is null
        and n.data ->> 'offer_id' = v_offer_id
      )
      or (
        v_offer_id is null
        and v_demand_id is not null
        and coalesce(n.data ->> 'demand_id', n.data ->> 'sample_demand_id') = v_demand_id
      )
      or (
        v_offer_id is null
        and v_demand_id is null
        and v_medicine_id is not null
        and n.data ->> 'medicine_id' = v_medicine_id
      )
      or (
        v_offer_id is null
        and v_demand_id is null
        and v_medicine_id is null
        and coalesce(n.data, '{}'::jsonb) = coalesce(p_data, '{}'::jsonb)
      )
    )
  order by n.created_at desc
  limit 1;

  if v_existing_id is not null then
    return v_existing_id;
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

create or replace function public.mark_exchange_notifications_read(p_before timestamptz default null)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_updated integer;
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;

  update public.exchange_notifications n
     set read_at = now()
   where n.recipient_user_id = v_actor
     and n.read_at is null
     and (p_before is null or n.created_at <= p_before);

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

revoke all on function public.mark_exchange_notifications_read(timestamptz) from public;
revoke all on function public.mark_exchange_notifications_read(timestamptz) from anon;
grant execute on function public.mark_exchange_notifications_read(timestamptz) to authenticated;

drop trigger if exists notify_offer_owners_for_new_demand_tg on public.exchange_demands;
create trigger notify_offer_owners_for_new_demand_tg
after insert on public.exchange_demands
for each row
when (new.status = 'open')
execute function public.notify_offer_owners_for_new_demand();

drop trigger if exists notify_demand_owners_for_new_offer_tg on public.exchange_offers;
create trigger notify_demand_owners_for_new_offer_tg
after insert on public.exchange_offers
for each row
when (new.status = 'active')
execute function public.notify_demand_owners_for_new_offer();

commit;
