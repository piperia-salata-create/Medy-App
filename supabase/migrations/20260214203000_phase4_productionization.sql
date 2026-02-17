begin;

create index if not exists idx_exchange_offers_pharmacy_status
  on public.exchange_offers(pharmacy_id, status);

create index if not exists idx_messages_sender_created_at
  on public.messages(sender_id, created_at desc);

create table if not exists public.chat_blocks (
  blocker_user_id uuid not null references auth.users(id) on delete cascade,
  blocked_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_user_id, blocked_user_id),
  constraint chat_blocks_no_self_block check (blocker_user_id <> blocked_user_id)
);

create index if not exists idx_chat_blocks_blocked_user_id
  on public.chat_blocks(blocked_user_id);

alter table public.chat_blocks enable row level security;

drop policy if exists "Users can view own chat blocks" on public.chat_blocks;
create policy "Users can view own chat blocks"
  on public.chat_blocks
  for select
  to authenticated
  using (blocker_user_id = auth.uid());

drop policy if exists "Users can create own chat blocks" on public.chat_blocks;
create policy "Users can create own chat blocks"
  on public.chat_blocks
  for insert
  to authenticated
  with check (
    blocker_user_id = auth.uid()
    and exists (
      select 1
      from public.profiles me
      where me.id = auth.uid()
        and me.role = 'pharmacist'
    )
    and exists (
      select 1
      from public.profiles target
      where target.id = chat_blocks.blocked_user_id
        and target.role = 'pharmacist'
    )
  );

drop policy if exists "Users can delete own chat blocks" on public.chat_blocks;
create policy "Users can delete own chat blocks"
  on public.chat_blocks
  for delete
  to authenticated
  using (blocker_user_id = auth.uid());

create table if not exists public.chat_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  message_id uuid null references public.messages(id) on delete set null,
  reason text not null check (char_length(btrim(reason)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists idx_chat_reports_reporter_created_at
  on public.chat_reports(reporter_user_id, created_at desc);

create index if not exists idx_chat_reports_conversation_id
  on public.chat_reports(conversation_id);

alter table public.chat_reports enable row level security;

drop policy if exists "Users can create own chat reports" on public.chat_reports;
create policy "Users can create own chat reports"
  on public.chat_reports
  for insert
  to authenticated
  with check (
    reporter_user_id = auth.uid()
    and exists (
      select 1
      from public.profiles me
      where me.id = auth.uid()
        and me.role = 'pharmacist'
    )
    and public.is_conversation_member(chat_reports.conversation_id, auth.uid())
    and (
      chat_reports.message_id is null
      or exists (
        select 1
        from public.messages m
        where m.id = chat_reports.message_id
          and m.conversation_id = chat_reports.conversation_id
      )
    )
  );

create or replace function public.is_chat_blocked(
  p_user_a uuid,
  p_user_b uuid
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.chat_blocks cb
    where (cb.blocker_user_id = p_user_a and cb.blocked_user_id = p_user_b)
       or (cb.blocker_user_id = p_user_b and cb.blocked_user_id = p_user_a)
  );
$$;

create or replace function public.get_or_create_dm_conversation(target_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_conversation_id uuid;
  v_lock_key text;
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;

  if target_user_id is null then
    raise exception 'target_user_id is required';
  end if;

  if target_user_id = v_actor then
    raise exception 'Cannot open direct conversation with yourself';
  end if;

  if not exists (
    select 1
    from public.profiles me
    where me.id = v_actor
      and me.role = 'pharmacist'
  ) then
    raise exception 'Only pharmacists can open direct conversations';
  end if;

  if not exists (
    select 1
    from public.profiles target
    where target.id = target_user_id
      and target.role = 'pharmacist'
  ) then
    raise exception 'Target is not a pharmacist';
  end if;

  if public.is_chat_blocked(v_actor, target_user_id) then
    raise exception 'Direct conversation unavailable because one participant has blocked the other';
  end if;

  if not exists (
    select 1
    from public.pharmacist_connections pc
    where pc.status = 'accepted'
      and (
        (pc.requester_pharmacist_id = v_actor and pc.target_pharmacist_id = target_user_id)
        or (pc.requester_pharmacist_id = target_user_id and pc.target_pharmacist_id = v_actor)
      )
  ) then
    raise exception 'Accepted connection required';
  end if;

  v_lock_key := least(v_actor::text, target_user_id::text) || ':' || greatest(v_actor::text, target_user_id::text);
  perform pg_advisory_xact_lock(hashtext(v_lock_key));

  select c.id
    into v_conversation_id
  from public.conversations c
  join public.conversation_members cm_actor
    on cm_actor.conversation_id = c.id
   and cm_actor.user_id = v_actor
  join public.conversation_members cm_target
    on cm_target.conversation_id = c.id
   and cm_target.user_id = target_user_id
  where c.type = 'dm'
    and (select count(*) from public.conversation_members cm where cm.conversation_id = c.id) = 2
  limit 1;

  if v_conversation_id is null then
    insert into public.conversations (type, exchange_request_id)
    values ('dm', null)
    returning id into v_conversation_id;

    insert into public.conversation_members (conversation_id, user_id)
    values
      (v_conversation_id, v_actor),
      (v_conversation_id, target_user_id)
    on conflict do nothing;
  end if;

  return v_conversation_id;
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
  v_open_limit integer := 20;
  v_daily_limit integer := 50;
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
  v_active_limit integer := 50;
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
  v_limit integer := 120;
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

  return v_message_id;
end;
$$;

drop policy if exists "Pharmacy owners can create exchange offers" on public.exchange_offers;
drop policy if exists "Demand owners can create demands" on public.exchange_demands;
drop policy if exists "Conversation members can send messages" on public.messages;

revoke insert on table public.exchange_offers from authenticated;
revoke insert on table public.exchange_demands from authenticated;
revoke insert on table public.messages from authenticated;

revoke all on table public.chat_blocks from anon;
revoke all on table public.chat_reports from anon;
revoke all on table public.chat_blocks from authenticated;
revoke all on table public.chat_reports from authenticated;
grant select, insert, delete on table public.chat_blocks to authenticated;
grant insert on table public.chat_reports to authenticated;

revoke all on function public.is_chat_blocked(uuid, uuid) from public;
revoke all on function public.is_chat_blocked(uuid, uuid) from anon;
grant execute on function public.is_chat_blocked(uuid, uuid) to authenticated;

revoke all on function public.get_or_create_dm_conversation(uuid) from public;
revoke all on function public.get_or_create_dm_conversation(uuid) from anon;
grant execute on function public.get_or_create_dm_conversation(uuid) to authenticated;

revoke all on function public.create_exchange_demand(uuid, uuid, integer, text) from public;
revoke all on function public.create_exchange_demand(uuid, uuid, integer, text) from anon;
grant execute on function public.create_exchange_demand(uuid, uuid, integer, text) to authenticated;

revoke all on function public.create_exchange_offer(uuid, uuid, integer, date, text) from public;
revoke all on function public.create_exchange_offer(uuid, uuid, integer, date, text) from anon;
grant execute on function public.create_exchange_offer(uuid, uuid, integer, date, text) to authenticated;

revoke all on function public.send_message(uuid, text) from public;
revoke all on function public.send_message(uuid, text) from anon;
grant execute on function public.send_message(uuid, text) to authenticated;

commit;
