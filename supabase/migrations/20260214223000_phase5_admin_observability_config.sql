begin;

create table if not exists public.exchange_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (
    event_type in (
      'offer_created',
      'offer_withdrawn',
      'request_created',
      'request_accepted',
      'request_rejected',
      'request_cancelled',
      'request_completed',
      'demand_created',
      'demand_fulfilled',
      'message_sent',
      'notification_enqueued',
      'rate_limit_denied',
      'block_created',
      'report_created'
    )
  ),
  actor_user_id uuid null references auth.users(id) on delete set null,
  pharmacy_id uuid null references public.pharmacies(id) on delete set null,
  offer_id uuid null references public.exchange_offers(id) on delete set null,
  request_id uuid null references public.exchange_requests(id) on delete set null,
  demand_id uuid null references public.exchange_demands(id) on delete set null,
  conversation_id uuid null references public.conversations(id) on delete set null,
  metadata jsonb null,
  created_at timestamptz not null default now()
);

create index if not exists idx_exchange_events_created_at
  on public.exchange_events(created_at desc);

create index if not exists idx_exchange_events_event_type_created_at
  on public.exchange_events(event_type, created_at desc);

create index if not exists idx_exchange_events_actor_user_created_at
  on public.exchange_events(actor_user_id, created_at desc);

create index if not exists idx_exchange_events_pharmacy_created_at
  on public.exchange_events(pharmacy_id, created_at desc);

create table if not exists public.exchange_rate_limit_config (
  key text primary key,
  value_int integer not null check (value_int > 0),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'set_exchange_rate_limit_config_updated_at_tg'
      and tgrelid = 'public.exchange_rate_limit_config'::regclass
      and not tgisinternal
  ) then
    create trigger set_exchange_rate_limit_config_updated_at_tg
    before update on public.exchange_rate_limit_config
    for each row
    execute function public.set_updated_at();
  end if;
end
$$;

insert into public.exchange_rate_limit_config (key, value_int)
values
  ('max_open_demands_per_pharmacy', 20),
  ('max_demands_per_day_per_pharmacy', 50),
  ('max_active_offers_per_pharmacy', 50),
  ('max_messages_per_10min_per_user', 120),
  ('notification_dedupe_minutes', 60)
on conflict (key) do nothing;

create or replace function public.log_exchange_event(
  p_event_type text,
  p_actor_user_id uuid default null,
  p_pharmacy_id uuid default null,
  p_offer_id uuid default null,
  p_request_id uuid default null,
  p_demand_id uuid default null,
  p_conversation_id uuid default null,
  p_metadata jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
begin
  insert into public.exchange_events (
    event_type,
    actor_user_id,
    pharmacy_id,
    offer_id,
    request_id,
    demand_id,
    conversation_id,
    metadata
  )
  values (
    p_event_type,
    p_actor_user_id,
    p_pharmacy_id,
    p_offer_id,
    p_request_id,
    p_demand_id,
    p_conversation_id,
    p_metadata
  )
  returning id into v_event_id;

  return v_event_id;
end;
$$;

create or replace function public.get_exchange_limit(
  p_key text,
  p_default integer
)
returns integer
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_value integer;
begin
  select c.value_int
    into v_value
  from public.exchange_rate_limit_config c
  where c.key = p_key;

  return greatest(1, coalesce(v_value, p_default));
end;
$$;

create or replace function public.create_exchange_demand(
  p_pharmacy_id uuid,
  p_medicine_id uuid,
  p_quantity integer default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_demand_id uuid;
  v_open_limit integer := public.get_exchange_limit('max_open_demands_per_pharmacy', 20);
  v_daily_limit integer := public.get_exchange_limit('max_demands_per_day_per_pharmacy', 50);
  v_open_count integer;
  v_daily_count integer;
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;

  if p_pharmacy_id is null or p_medicine_id is null then
    raise exception 'pharmacy_id and medicine_id are required';
  end if;

  if p_quantity is not null and p_quantity <= 0 then
    raise exception 'Quantity must be a positive integer';
  end if;

  if not exists (
    select 1
    from public.profiles me
    where me.id = v_actor
      and me.role = 'pharmacist'
  ) then
    raise exception 'Only pharmacists can create demands';
  end if;

  if not exists (
    select 1
    from public.pharmacies p
    where p.id = p_pharmacy_id
      and p.owner_id = v_actor
  ) then
    raise exception 'Not authorized for this pharmacy';
  end if;

  select count(*)
    into v_open_count
  from public.exchange_demands d
  where d.pharmacy_id = p_pharmacy_id
    and d.status = 'open';

  if v_open_count >= v_open_limit then
    perform public.log_exchange_event(
      'rate_limit_denied',
      v_actor,
      p_pharmacy_id,
      null,
      null,
      null,
      null,
      jsonb_build_object(
        'limit_key', 'max_open_demands_per_pharmacy',
        'limit_value', v_open_limit,
        'current_count', v_open_count
      )
    );
    raise exception using
      errcode = 'P0001',
      message = format('Open demand limit reached (max %s open demands)', v_open_limit);
  end if;

  select count(*)
    into v_daily_count
  from public.exchange_demands d
  where d.pharmacy_id = p_pharmacy_id
    and d.created_at >= date_trunc('day', now());

  if v_daily_count >= v_daily_limit then
    perform public.log_exchange_event(
      'rate_limit_denied',
      v_actor,
      p_pharmacy_id,
      null,
      null,
      null,
      null,
      jsonb_build_object(
        'limit_key', 'max_demands_per_day_per_pharmacy',
        'limit_value', v_daily_limit,
        'current_count', v_daily_count
      )
    );
    raise exception using
      errcode = 'P0001',
      message = format('Daily demand limit reached (max %s per day)', v_daily_limit);
  end if;

  insert into public.exchange_demands (
    pharmacy_id,
    medicine_id,
    quantity,
    notes,
    status
  )
  values (
    p_pharmacy_id,
    p_medicine_id,
    p_quantity,
    nullif(btrim(coalesce(p_notes, '')), ''),
    'open'
  )
  returning id into v_demand_id;

  perform public.log_exchange_event(
    'demand_created',
    v_actor,
    p_pharmacy_id,
    null,
    null,
    v_demand_id,
    null,
    jsonb_build_object(
      'medicine_id', p_medicine_id,
      'quantity', p_quantity
    )
  );

  return v_demand_id;
end;
$$;

create or replace function public.create_exchange_offer(
  p_pharmacy_id uuid,
  p_medicine_id uuid,
  p_quantity integer,
  p_expiry_date date default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_offer_id uuid;
  v_active_limit integer := public.get_exchange_limit('max_active_offers_per_pharmacy', 50);
  v_active_count integer;
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;

  if p_pharmacy_id is null or p_medicine_id is null then
    raise exception 'pharmacy_id and medicine_id are required';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantity must be a positive integer';
  end if;

  if not exists (
    select 1
    from public.profiles me
    where me.id = v_actor
      and me.role = 'pharmacist'
  ) then
    raise exception 'Only pharmacists can create offers';
  end if;

  if not exists (
    select 1
    from public.pharmacies p
    where p.id = p_pharmacy_id
      and p.owner_id = v_actor
  ) then
    raise exception 'Not authorized for this pharmacy';
  end if;

  select count(*)
    into v_active_count
  from public.exchange_offers eo
  where eo.pharmacy_id = p_pharmacy_id
    and eo.status = 'active';

  if v_active_count >= v_active_limit then
    perform public.log_exchange_event(
      'rate_limit_denied',
      v_actor,
      p_pharmacy_id,
      null,
      null,
      null,
      null,
      jsonb_build_object(
        'limit_key', 'max_active_offers_per_pharmacy',
        'limit_value', v_active_limit,
        'current_count', v_active_count
      )
    );
    raise exception using
      errcode = 'P0001',
      message = format('Active offer limit reached (max %s active offers)', v_active_limit);
  end if;

  insert into public.exchange_offers (
    pharmacy_id,
    medicine_id,
    quantity,
    expiry_date,
    notes,
    status
  )
  values (
    p_pharmacy_id,
    p_medicine_id,
    p_quantity,
    p_expiry_date,
    nullif(btrim(coalesce(p_notes, '')), ''),
    'active'
  )
  returning id into v_offer_id;

  perform public.log_exchange_event(
    'offer_created',
    v_actor,
    p_pharmacy_id,
    v_offer_id,
    null,
    null,
    null,
    jsonb_build_object(
      'medicine_id', p_medicine_id,
      'quantity', p_quantity,
      'expiry_date', p_expiry_date
    )
  );

  return v_offer_id;
end;
$$;

create or replace function public.send_message(
  p_conversation_id uuid,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_message_id uuid;
  v_limit integer := public.get_exchange_limit('max_messages_per_10min_per_user', 120);
  v_recent_count integer;
  v_trimmed_body text;
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;

  if p_conversation_id is null then
    raise exception 'conversation_id is required';
  end if;

  if not exists (
    select 1
    from public.profiles me
    where me.id = v_actor
      and me.role = 'pharmacist'
  ) then
    raise exception 'Only pharmacists can send messages';
  end if;

  if not public.is_conversation_member(p_conversation_id, v_actor) then
    raise exception 'Not allowed to post to this conversation';
  end if;

  v_trimmed_body := nullif(btrim(coalesce(p_body, '')), '');
  if v_trimmed_body is null then
    raise exception 'Message body is required';
  end if;

  if char_length(v_trimmed_body) > 4000 then
    raise exception 'Message is too long (max 4000 characters)';
  end if;

  if exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id = p_conversation_id
      and cm.user_id <> v_actor
      and public.is_chat_blocked(v_actor, cm.user_id)
  ) then
    raise exception 'Messaging unavailable because one participant has blocked the other';
  end if;

  select count(*)
    into v_recent_count
  from public.messages m
  where m.sender_id = v_actor
    and m.created_at >= now() - interval '10 minutes';

  if v_recent_count >= v_limit then
    perform public.log_exchange_event(
      'rate_limit_denied',
      v_actor,
      null,
      null,
      null,
      null,
      p_conversation_id,
      jsonb_build_object(
        'limit_key', 'max_messages_per_10min_per_user',
        'limit_value', v_limit,
        'current_count', v_recent_count
      )
    );
    raise exception using
      errcode = 'P0001',
      message = format('Message rate limit reached (max %s per 10 minutes)', v_limit);
  end if;

  insert into public.messages (
    conversation_id,
    sender_id,
    body
  )
  values (
    p_conversation_id,
    v_actor,
    v_trimmed_body
  )
  returning id into v_message_id;

  perform public.log_exchange_event(
    'message_sent',
    v_actor,
    null,
    null,
    null,
    null,
    p_conversation_id,
    jsonb_build_object(
      'message_id', v_message_id,
      'body_length', char_length(v_trimmed_body)
    )
  );

  return v_message_id;
end;
$$;

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
  v_dedupe_minutes integer := public.get_exchange_limit('notification_dedupe_minutes', 60);
  v_dedupe_window interval;
  v_offer_id text;
  v_demand_id text;
  v_medicine_id text;
  v_identity_key text;
begin
  if p_recipient_user_id is null then
    raise exception 'recipient_user_id is required';
  end if;

  if v_dedupe_minutes < 1 then
    v_dedupe_minutes := 60;
  end if;
  v_dedupe_window := (v_dedupe_minutes::text || ' minutes')::interval;

  v_offer_id := nullif(trim(coalesce(p_data ->> 'offer_id', '')), '');
  v_demand_id := nullif(trim(coalesce(p_data ->> 'demand_id', p_data ->> 'sample_demand_id', '')), '');
  v_medicine_id := nullif(trim(coalesce(p_data ->> 'medicine_id', '')), '');

  v_identity_key := coalesce(
    case when v_offer_id is not null and v_demand_id is not null then 'offer:' || v_offer_id || '|demand:' || v_demand_id end,
    case when v_offer_id is not null then 'offer:' || v_offer_id end,
    case when v_demand_id is not null then 'demand:' || v_demand_id end,
    case when v_medicine_id is not null then 'medicine:' || v_medicine_id end,
    'payload:' || md5(coalesce(p_data::text, '{}'))
  );

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

  perform public.log_exchange_event(
    'notification_enqueued',
    auth.uid(),
    null,
    null,
    null,
    null,
    null,
    jsonb_build_object(
      'notification_id', v_id,
      'recipient_user_id', p_recipient_user_id,
      'kind', p_kind,
      'identity_key', v_identity_key
    )
  );

  return v_id;
end;
$$;

create or replace function public.log_exchange_request_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_type text;
begin
  if tg_op = 'INSERT' then
    perform public.log_exchange_event(
      'request_created',
      auth.uid(),
      new.requesting_pharmacy_id,
      new.offer_id,
      new.id,
      null,
      null,
      jsonb_build_object(
        'status', new.status
      )
    );
    return new;
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    v_event_type := case new.status
      when 'accepted' then 'request_accepted'
      when 'rejected' then 'request_rejected'
      when 'cancelled' then 'request_cancelled'
      when 'completed' then 'request_completed'
      else null
    end;

    if v_event_type is not null then
      perform public.log_exchange_event(
        v_event_type,
        auth.uid(),
        new.requesting_pharmacy_id,
        new.offer_id,
        new.id,
        null,
        null,
        jsonb_build_object(
          'from_status', old.status,
          'to_status', new.status
        )
      );
    end if;
  end if;

  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'log_exchange_request_events_tg'
      and tgrelid = 'public.exchange_requests'::regclass
      and not tgisinternal
  ) then
    create trigger log_exchange_request_events_tg
    after insert or update on public.exchange_requests
    for each row
    execute function public.log_exchange_request_events();
  end if;
end
$$;

create or replace function public.log_exchange_offer_status_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status and new.status = 'withdrawn' then
    perform public.log_exchange_event(
      'offer_withdrawn',
      auth.uid(),
      new.pharmacy_id,
      new.id,
      null,
      null,
      null,
      jsonb_build_object(
        'from_status', old.status,
        'to_status', new.status
      )
    );
  end if;
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'log_exchange_offer_status_events_tg'
      and tgrelid = 'public.exchange_offers'::regclass
      and not tgisinternal
  ) then
    create trigger log_exchange_offer_status_events_tg
    after update on public.exchange_offers
    for each row
    execute function public.log_exchange_offer_status_events();
  end if;
end
$$;

create or replace function public.log_exchange_demand_status_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status and new.status = 'fulfilled' then
    perform public.log_exchange_event(
      'demand_fulfilled',
      auth.uid(),
      new.pharmacy_id,
      null,
      null,
      new.id,
      null,
      jsonb_build_object(
        'from_status', old.status,
        'to_status', new.status
      )
    );
  end if;
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'log_exchange_demand_status_events_tg'
      and tgrelid = 'public.exchange_demands'::regclass
      and not tgisinternal
  ) then
    create trigger log_exchange_demand_status_events_tg
    after update on public.exchange_demands
    for each row
    execute function public.log_exchange_demand_status_events();
  end if;
end
$$;

create or replace function public.log_chat_block_created_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.log_exchange_event(
    'block_created',
    new.blocker_user_id,
    null,
    null,
    null,
    null,
    null,
    jsonb_build_object(
      'blocked_user_id', new.blocked_user_id
    )
  );
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'log_chat_block_created_event_tg'
      and tgrelid = 'public.chat_blocks'::regclass
      and not tgisinternal
  ) then
    create trigger log_chat_block_created_event_tg
    after insert on public.chat_blocks
    for each row
    execute function public.log_chat_block_created_event();
  end if;
end
$$;

create or replace function public.log_chat_report_created_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.log_exchange_event(
    'report_created',
    new.reporter_user_id,
    null,
    null,
    null,
    null,
    new.conversation_id,
    jsonb_build_object(
      'report_id', new.id,
      'message_id', new.message_id
    )
  );
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'log_chat_report_created_event_tg'
      and tgrelid = 'public.chat_reports'::regclass
      and not tgisinternal
  ) then
    create trigger log_chat_report_created_event_tg
    after insert on public.chat_reports
    for each row
    execute function public.log_chat_report_created_event();
  end if;
end
$$;

create or replace view public.admin_chat_reports_view as
select
  r.created_at,
  r.reporter_user_id,
  r.conversation_id,
  r.message_id,
  r.reason,
  c.type as conversation_type,
  c.exchange_request_id,
  m.sender_id as reported_message_sender_id,
  m.body as reported_message_body,
  m.created_at as reported_message_created_at
from public.chat_reports r
join public.conversations c on c.id = r.conversation_id
left join public.messages m on m.id = r.message_id;

create or replace view public.admin_exchange_abuse_signals_view as
with message_denials as (
  select
    e.actor_user_id,
    count(*)::bigint as denial_count,
    min(e.created_at) as first_seen_at,
    max(e.created_at) as last_seen_at
  from public.exchange_events e
  where e.event_type = 'rate_limit_denied'
    and e.metadata ->> 'limit_key' = 'max_messages_per_10min_per_user'
    and e.created_at >= now() - interval '24 hours'
    and e.actor_user_id is not null
  group by e.actor_user_id
  having count(*) >= 3
),
blocked_users as (
  select
    cb.blocked_user_id as actor_user_id,
    count(*)::bigint as block_count,
    min(cb.created_at) as first_seen_at,
    max(cb.created_at) as last_seen_at
  from public.chat_blocks cb
  group by cb.blocked_user_id
  having count(*) >= 3
),
daily_demand_spikes as (
  select
    e.pharmacy_id,
    date_trunc('day', e.created_at) as day_bucket,
    count(*)::bigint as demand_count
  from public.exchange_events e
  where e.event_type = 'demand_created'
    and e.created_at >= now() - interval '30 days'
    and e.pharmacy_id is not null
  group by e.pharmacy_id, date_trunc('day', e.created_at)
  having count(*) >= greatest(1, floor(public.get_exchange_limit('max_demands_per_day_per_pharmacy', 50) * 0.8))
),
notification_repeats as (
  select
    (e.metadata ->> 'recipient_user_id')::uuid as actor_user_id,
    e.metadata ->> 'identity_key' as identity_key,
    count(*)::bigint as notification_count,
    min(e.created_at) as first_seen_at,
    max(e.created_at) as last_seen_at
  from public.exchange_events e
  where e.event_type = 'notification_enqueued'
    and e.created_at >= now() - interval '24 hours'
    and e.metadata ? 'recipient_user_id'
    and e.metadata ? 'identity_key'
  group by (e.metadata ->> 'recipient_user_id')::uuid, e.metadata ->> 'identity_key'
  having count(*) >= 5
)
select
  'message_rate_limit_denials_24h'::text as signal_type,
  md.actor_user_id,
  null::uuid as pharmacy_id,
  md.denial_count as signal_value,
  md.first_seen_at as window_start,
  md.last_seen_at as window_end,
  jsonb_build_object(
    'limit_key', 'max_messages_per_10min_per_user',
    'denial_count', md.denial_count
  ) as details
from message_denials md
union all
select
  'frequently_blocked_user'::text as signal_type,
  bu.actor_user_id,
  null::uuid as pharmacy_id,
  bu.block_count as signal_value,
  bu.first_seen_at as window_start,
  bu.last_seen_at as window_end,
  jsonb_build_object(
    'block_count', bu.block_count
  ) as details
from blocked_users bu
union all
select
  'high_demands_per_day_pharmacy'::text as signal_type,
  null::uuid as actor_user_id,
  dd.pharmacy_id,
  dd.demand_count as signal_value,
  dd.day_bucket as window_start,
  dd.day_bucket + interval '1 day' as window_end,
  jsonb_build_object(
    'threshold', greatest(1, floor(public.get_exchange_limit('max_demands_per_day_per_pharmacy', 50) * 0.8)),
    'day', dd.day_bucket::date
  ) as details
from daily_demand_spikes dd
union all
select
  'repeated_notification_identity_24h'::text as signal_type,
  nr.actor_user_id,
  null::uuid as pharmacy_id,
  nr.notification_count as signal_value,
  nr.first_seen_at as window_start,
  nr.last_seen_at as window_end,
  jsonb_build_object(
    'identity_key', nr.identity_key,
    'dedupe_hits_available', false
  ) as details
from notification_repeats nr;

create or replace view public.exchange_kpis_daily as
select
  date_trunc('day', e.created_at)::date as date,
  count(*) filter (where e.event_type = 'offer_created')::bigint as offers_created,
  count(*) filter (where e.event_type = 'demand_created')::bigint as demands_created,
  count(*) filter (where e.event_type = 'request_created')::bigint as requests_created,
  count(*) filter (where e.event_type = 'request_accepted')::bigint as requests_accepted,
  count(*) filter (where e.event_type = 'request_completed')::bigint as requests_completed,
  count(*) filter (where e.event_type = 'message_sent')::bigint as messages_sent,
  count(*) filter (where e.event_type = 'notification_enqueued')::bigint as notifications_inserted
from public.exchange_events e
group by date_trunc('day', e.created_at)::date
order by date desc;

create or replace view public.exchange_kpis_pharmacy as
with visible_events as (
  select
    e.pharmacy_id,
    e.event_type,
    e.created_at
  from public.exchange_events e
  where e.pharmacy_id is not null
    and e.created_at >= now() - interval '30 days'
    and exists (
      select 1
      from public.profiles me
      where me.id = auth.uid()
        and me.role = 'pharmacist'
    )
    and exists (
      select 1
      from public.pharmacies p
      where p.id = e.pharmacy_id
        and p.owner_id = auth.uid()
    )
)
select
  ve.pharmacy_id,
  count(*) filter (where ve.event_type = 'offer_created')::bigint as offers_created_30d,
  count(*) filter (where ve.event_type = 'demand_created')::bigint as demands_created_30d,
  count(*) filter (where ve.event_type = 'request_created')::bigint as requests_created_30d,
  count(*) filter (where ve.event_type = 'request_completed')::bigint as requests_completed_30d
from visible_events ve
group by ve.pharmacy_id;

alter table public.exchange_events enable row level security;
alter table public.exchange_rate_limit_config enable row level security;

revoke all on table public.exchange_events from public;
revoke all on table public.exchange_events from anon;
revoke all on table public.exchange_events from authenticated;

revoke all on table public.exchange_rate_limit_config from public;
revoke all on table public.exchange_rate_limit_config from anon;
revoke all on table public.exchange_rate_limit_config from authenticated;

grant select on table public.exchange_events to service_role;
grant select, insert, update, delete on table public.exchange_rate_limit_config to service_role;

revoke all on function public.log_exchange_event(text, uuid, uuid, uuid, uuid, uuid, uuid, jsonb) from public;
revoke all on function public.log_exchange_event(text, uuid, uuid, uuid, uuid, uuid, uuid, jsonb) from anon;
revoke all on function public.log_exchange_event(text, uuid, uuid, uuid, uuid, uuid, uuid, jsonb) from authenticated;
grant execute on function public.log_exchange_event(text, uuid, uuid, uuid, uuid, uuid, uuid, jsonb) to service_role;

revoke all on function public.get_exchange_limit(text, integer) from public;
revoke all on function public.get_exchange_limit(text, integer) from anon;
revoke all on function public.get_exchange_limit(text, integer) from authenticated;
grant execute on function public.get_exchange_limit(text, integer) to service_role;

revoke all on table public.admin_chat_reports_view from public;
revoke all on table public.admin_chat_reports_view from anon;
revoke all on table public.admin_chat_reports_view from authenticated;
grant select on table public.admin_chat_reports_view to service_role;

revoke all on table public.admin_exchange_abuse_signals_view from public;
revoke all on table public.admin_exchange_abuse_signals_view from anon;
revoke all on table public.admin_exchange_abuse_signals_view from authenticated;
grant select on table public.admin_exchange_abuse_signals_view to service_role;

revoke all on table public.exchange_kpis_daily from public;
revoke all on table public.exchange_kpis_daily from anon;
revoke all on table public.exchange_kpis_daily from authenticated;
grant select on table public.exchange_kpis_daily to service_role;

revoke all on table public.exchange_kpis_pharmacy from public;
revoke all on table public.exchange_kpis_pharmacy from anon;
revoke all on table public.exchange_kpis_pharmacy from authenticated;
grant select on table public.exchange_kpis_pharmacy to authenticated;
grant select on table public.exchange_kpis_pharmacy to service_role;

commit;
