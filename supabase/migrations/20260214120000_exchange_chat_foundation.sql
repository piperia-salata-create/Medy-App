begin;

create extension if not exists "pgcrypto";

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'exchange_offer_status'
  ) then
    create type public.exchange_offer_status as enum ('active', 'withdrawn', 'matched');
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'exchange_request_status'
  ) then
    create type public.exchange_request_status as enum ('pending', 'accepted', 'rejected', 'cancelled', 'completed');
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'conversation_type'
  ) then
    create type public.conversation_type as enum ('exchange', 'dm');
  end if;
end
$$;

create table if not exists public.exchange_offers (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies(id) on delete cascade,
  medicine_id uuid not null references public.medicines(id),
  quantity integer not null check (quantity > 0),
  expiry_date date null,
  notes text null,
  status public.exchange_offer_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_exchange_offers_pharmacy_id on public.exchange_offers(pharmacy_id);
create index if not exists idx_exchange_offers_medicine_id on public.exchange_offers(medicine_id);
create index if not exists idx_exchange_offers_status on public.exchange_offers(status);
create index if not exists idx_exchange_offers_expiry_date on public.exchange_offers(expiry_date);
create index if not exists idx_exchange_offers_active_only on public.exchange_offers(created_at desc) where status = 'active';

create table if not exists public.exchange_requests (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.exchange_offers(id) on delete cascade,
  requesting_pharmacy_id uuid not null references public.pharmacies(id) on delete cascade,
  message text null,
  status public.exchange_request_status not null default 'pending',
  responded_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_exchange_requests_offer_requester_unique
  on public.exchange_requests(offer_id, requesting_pharmacy_id);
create index if not exists idx_exchange_requests_offer_id on public.exchange_requests(offer_id);
create index if not exists idx_exchange_requests_requesting_pharmacy_id on public.exchange_requests(requesting_pharmacy_id);
create index if not exists idx_exchange_requests_status on public.exchange_requests(status);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  type public.conversation_type not null,
  exchange_request_id uuid null references public.exchange_requests(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint conversations_type_exchange_request_check check (
    (type = 'exchange' and exchange_request_id is not null)
    or (type = 'dm' and exchange_request_id is null)
  )
);

create unique index if not exists idx_conversations_exchange_request_unique
  on public.conversations(exchange_request_id)
  where exchange_request_id is not null;

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create index if not exists idx_conversation_members_user_id on public.conversation_members(user_id);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id),
  body text not null check (char_length(body) <= 4000),
  created_at timestamptz not null default now()
);

create index if not exists idx_messages_conversation_created_at
  on public.messages(conversation_id, created_at);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_exchange_offers_updated_at on public.exchange_offers;
create trigger set_exchange_offers_updated_at
before update on public.exchange_offers
for each row
execute function public.set_updated_at();

drop trigger if exists set_exchange_requests_updated_at on public.exchange_requests;
create trigger set_exchange_requests_updated_at
before update on public.exchange_requests
for each row
execute function public.set_updated_at();

create or replace function public.validate_exchange_request_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_offer_pharmacy_id uuid;
  v_is_requester_owner boolean;
  v_is_offer_owner boolean;
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;

  if tg_op = 'INSERT' then
    select eo.pharmacy_id
      into v_offer_pharmacy_id
    from public.exchange_offers eo
    where eo.id = new.offer_id;

    if v_offer_pharmacy_id is null then
      raise exception 'Offer not found';
    end if;

    if new.requesting_pharmacy_id = v_offer_pharmacy_id then
      raise exception 'Cannot request your own offer';
    end if;

    if new.status <> 'pending' then
      raise exception 'Initial status must be pending';
    end if;

    return new;
  end if;

  if new.offer_id <> old.offer_id then
    raise exception 'offer_id is immutable';
  end if;

  if new.requesting_pharmacy_id <> old.requesting_pharmacy_id then
    raise exception 'requesting_pharmacy_id is immutable';
  end if;

  select exists (
    select 1
    from public.pharmacies p
    where p.id = new.requesting_pharmacy_id
      and p.owner_id = v_actor
  ) into v_is_requester_owner;

  select exists (
    select 1
    from public.exchange_offers eo
    join public.pharmacies p on p.id = eo.pharmacy_id
    where eo.id = new.offer_id
      and p.owner_id = v_actor
  ) into v_is_offer_owner;

  if not (v_is_requester_owner or v_is_offer_owner) then
    raise exception 'Not allowed to update this request';
  end if;

  if new.status = old.status then
    return new;
  end if;

  if new.status = 'cancelled' then
    if not v_is_requester_owner then
      raise exception 'Only requesting pharmacy can cancel';
    end if;
    if old.status <> 'pending' then
      raise exception 'Only pending requests can be cancelled';
    end if;
    if new.responded_at is null then
      new.responded_at = now();
    end if;
    return new;
  end if;

  if new.status in ('accepted', 'rejected') then
    if not v_is_offer_owner then
      raise exception 'Only offer pharmacy can accept/reject';
    end if;
    if old.status <> 'pending' then
      raise exception 'Only pending requests can be accepted/rejected';
    end if;
    if new.responded_at is null then
      new.responded_at = now();
    end if;
    return new;
  end if;

  if new.status = 'completed' then
    if old.status <> 'accepted' then
      raise exception 'Only accepted requests can be marked completed';
    end if;
    if not (v_is_requester_owner or v_is_offer_owner) then
      raise exception 'Only exchange parties can mark completed';
    end if;
    if new.responded_at is null then
      new.responded_at = now();
    end if;
    return new;
  end if;

  raise exception 'Invalid status transition from % to %', old.status, new.status;
end;
$$;

drop trigger if exists validate_exchange_request_write_tg on public.exchange_requests;
create trigger validate_exchange_request_write_tg
before insert or update on public.exchange_requests
for each row
execute function public.validate_exchange_request_write();

create or replace function public.sync_offer_status_from_exchange_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if new.status = 'accepted' and old.status <> 'accepted' then
      update public.exchange_offers
         set status = 'matched'
       where id = new.offer_id
         and status = 'active';
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists sync_offer_status_from_exchange_request_tg on public.exchange_requests;
create trigger sync_offer_status_from_exchange_request_tg
after update on public.exchange_requests
for each row
execute function public.sync_offer_status_from_exchange_request();

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

create or replace function public.get_or_create_exchange_conversation(p_exchange_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_conversation_id uuid;
  v_offer_owner uuid;
  v_request_owner uuid;
  v_request_status public.exchange_request_status;
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;

  if p_exchange_request_id is null then
    raise exception 'exchange_request_id is required';
  end if;

  select p_offer.owner_id, p_req.owner_id, er.status
    into v_offer_owner, v_request_owner, v_request_status
  from public.exchange_requests er
  join public.exchange_offers eo on eo.id = er.offer_id
  join public.pharmacies p_offer on p_offer.id = eo.pharmacy_id
  join public.pharmacies p_req on p_req.id = er.requesting_pharmacy_id
  where er.id = p_exchange_request_id;

  if not found then
    raise exception 'Exchange request not found';
  end if;

  if v_actor <> v_offer_owner and v_actor <> v_request_owner then
    raise exception 'Not authorized for this exchange request';
  end if;

  if v_request_status <> 'accepted' then
    raise exception 'Exchange conversation is available only for accepted requests';
  end if;

  select id
    into v_conversation_id
  from public.conversations
  where type = 'exchange'
    and exchange_request_id = p_exchange_request_id
  limit 1;

  if v_conversation_id is null then
    insert into public.conversations (type, exchange_request_id)
    values ('exchange', p_exchange_request_id)
    returning id into v_conversation_id;

    insert into public.conversation_members (conversation_id, user_id)
    values
      (v_conversation_id, v_offer_owner),
      (v_conversation_id, v_request_owner)
    on conflict do nothing;
  end if;

  return v_conversation_id;
end;
$$;

alter table public.exchange_offers enable row level security;
alter table public.exchange_requests enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;

drop policy if exists "Pharmacists can view active exchange offers" on public.exchange_offers;
create policy "Pharmacists can view active exchange offers"
  on public.exchange_offers
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles me
      where me.id = auth.uid()
        and me.role = 'pharmacist'
    )
    and (
      (
        status = 'active'
        and exists (
          select 1
          from public.pharmacies p
          where p.id = exchange_offers.pharmacy_id
            and p.is_verified = true
        )
      )
      or exists (
        select 1
        from public.pharmacies p
        where p.id = exchange_offers.pharmacy_id
          and p.owner_id = auth.uid()
      )
    )
  );

drop policy if exists "Pharmacy owners can create exchange offers" on public.exchange_offers;
create policy "Pharmacy owners can create exchange offers"
  on public.exchange_offers
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.profiles me
      where me.id = auth.uid()
        and me.role = 'pharmacist'
    )
    and exists (
      select 1
      from public.pharmacies p
      where p.id = exchange_offers.pharmacy_id
        and p.owner_id = auth.uid()
    )
  );

drop policy if exists "Pharmacy owners can update exchange offers" on public.exchange_offers;
create policy "Pharmacy owners can update exchange offers"
  on public.exchange_offers
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.profiles me
      where me.id = auth.uid()
        and me.role = 'pharmacist'
    )
    and exists (
      select 1
      from public.pharmacies p
      where p.id = exchange_offers.pharmacy_id
        and p.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.profiles me
      where me.id = auth.uid()
        and me.role = 'pharmacist'
    )
    and exists (
      select 1
      from public.pharmacies p
      where p.id = exchange_offers.pharmacy_id
        and p.owner_id = auth.uid()
    )
  );

drop policy if exists "Pharmacy owners can delete exchange offers" on public.exchange_offers;
create policy "Pharmacy owners can delete exchange offers"
  on public.exchange_offers
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.profiles me
      where me.id = auth.uid()
        and me.role = 'pharmacist'
    )
    and exists (
      select 1
      from public.pharmacies p
      where p.id = exchange_offers.pharmacy_id
        and p.owner_id = auth.uid()
    )
  );

drop policy if exists "Exchange parties can view exchange requests" on public.exchange_requests;
create policy "Exchange parties can view exchange requests"
  on public.exchange_requests
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles me
      where me.id = auth.uid()
        and me.role = 'pharmacist'
    )
    and (
      exists (
        select 1
        from public.pharmacies p
        where p.id = exchange_requests.requesting_pharmacy_id
          and p.owner_id = auth.uid()
      )
      or exists (
        select 1
        from public.exchange_offers eo
        join public.pharmacies p on p.id = eo.pharmacy_id
        where eo.id = exchange_requests.offer_id
          and p.owner_id = auth.uid()
      )
    )
  );

drop policy if exists "Requesting pharmacy owner can create exchange requests" on public.exchange_requests;
create policy "Requesting pharmacy owner can create exchange requests"
  on public.exchange_requests
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.profiles me
      where me.id = auth.uid()
        and me.role = 'pharmacist'
    )
    and status = 'pending'
    and exists (
      select 1
      from public.pharmacies p
      where p.id = exchange_requests.requesting_pharmacy_id
        and p.owner_id = auth.uid()
    )
    and exists (
      select 1
      from public.exchange_offers eo
      where eo.id = exchange_requests.offer_id
        and eo.pharmacy_id <> exchange_requests.requesting_pharmacy_id
    )
  );

drop policy if exists "Exchange parties can update exchange requests" on public.exchange_requests;
create policy "Exchange parties can update exchange requests"
  on public.exchange_requests
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.profiles me
      where me.id = auth.uid()
        and me.role = 'pharmacist'
    )
    and (
      exists (
        select 1
        from public.pharmacies p
        where p.id = exchange_requests.requesting_pharmacy_id
          and p.owner_id = auth.uid()
      )
      or exists (
        select 1
        from public.exchange_offers eo
        join public.pharmacies p on p.id = eo.pharmacy_id
        where eo.id = exchange_requests.offer_id
          and p.owner_id = auth.uid()
      )
    )
  )
  with check (
    exists (
      select 1
      from public.profiles me
      where me.id = auth.uid()
        and me.role = 'pharmacist'
    )
    and (
      exists (
        select 1
        from public.pharmacies p
        where p.id = exchange_requests.requesting_pharmacy_id
          and p.owner_id = auth.uid()
      )
      or exists (
        select 1
        from public.exchange_offers eo
        join public.pharmacies p on p.id = eo.pharmacy_id
        where eo.id = exchange_requests.offer_id
          and p.owner_id = auth.uid()
      )
    )
  );

drop policy if exists "Conversation members can view conversations" on public.conversations;
create policy "Conversation members can view conversations"
  on public.conversations
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.conversation_members cm
      where cm.conversation_id = conversations.id
        and cm.user_id = auth.uid()
    )
  );

drop policy if exists "Conversation members can view members" on public.conversation_members;
create policy "Conversation members can view members"
  on public.conversation_members
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.conversation_members self_member
      where self_member.conversation_id = conversation_members.conversation_id
        and self_member.user_id = auth.uid()
    )
  );

drop policy if exists "Conversation members can view messages" on public.messages;
create policy "Conversation members can view messages"
  on public.messages
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.conversation_members cm
      where cm.conversation_id = messages.conversation_id
        and cm.user_id = auth.uid()
    )
  );

drop policy if exists "Conversation members can send messages" on public.messages;
create policy "Conversation members can send messages"
  on public.messages
  for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1
      from public.conversation_members cm
      where cm.conversation_id = messages.conversation_id
        and cm.user_id = auth.uid()
    )
  );

grant usage on schema public to authenticated;

revoke all on table public.exchange_offers from anon;
revoke all on table public.exchange_requests from anon;
revoke all on table public.conversations from anon;
revoke all on table public.conversation_members from anon;
revoke all on table public.messages from anon;

grant select, insert, update, delete on table public.exchange_offers to authenticated;
grant select, insert, update on table public.exchange_requests to authenticated;
grant select on table public.conversations to authenticated;
grant select on table public.conversation_members to authenticated;
grant select, insert on table public.messages to authenticated;

revoke all on function public.get_or_create_dm_conversation(uuid) from public;
revoke all on function public.get_or_create_dm_conversation(uuid) from anon;
grant execute on function public.get_or_create_dm_conversation(uuid) to authenticated;

revoke all on function public.get_or_create_exchange_conversation(uuid) from public;
revoke all on function public.get_or_create_exchange_conversation(uuid) from anon;
grant execute on function public.get_or_create_exchange_conversation(uuid) to authenticated;

drop policy if exists "Verified pharmacists can view stock requests" on public.stock_requests;
drop policy if exists "Verified pharmacists can create stock requests" on public.stock_requests;
drop policy if exists "Verified pharmacists can update stock requests" on public.stock_requests;
drop policy if exists "Pharmacists can view their stock requests" on public.stock_requests;
drop policy if exists "Pharmacists can create stock requests" on public.stock_requests;
drop policy if exists "Pharmacists can update incoming stock requests" on public.stock_requests;

create policy "Stock request parties can view"
  on public.stock_requests
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.pharmacies p
      where p.id = stock_requests.from_pharmacy_id
        and p.owner_id = auth.uid()
    )
    or exists (
      select 1
      from public.pharmacies p
      where p.id = stock_requests.to_pharmacy_id
        and p.owner_id = auth.uid()
    )
  );

create policy "Stock request sender can insert"
  on public.stock_requests
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.pharmacies p
      where p.id = stock_requests.from_pharmacy_id
        and p.owner_id = auth.uid()
    )
    and stock_requests.from_pharmacy_id <> stock_requests.to_pharmacy_id
    and stock_requests.status = 'pending'
  );

create policy "Stock request recipient can update"
  on public.stock_requests
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.pharmacies p
      where p.id = stock_requests.to_pharmacy_id
        and p.owner_id = auth.uid()
    )
  )
  with check (
    stock_requests.status in ('accepted', 'declined')
    and exists (
      select 1
      from public.pharmacies p
      where p.id = stock_requests.to_pharmacy_id
        and p.owner_id = auth.uid()
    )
  );

do $$
begin
  begin
    alter publication supabase_realtime add table public.exchange_offers;
  exception when duplicate_object then
    null;
  end;

  begin
    alter publication supabase_realtime add table public.exchange_requests;
  exception when duplicate_object then
    null;
  end;

  begin
    alter publication supabase_realtime add table public.conversations;
  exception when duplicate_object then
    null;
  end;

  begin
    alter publication supabase_realtime add table public.conversation_members;
  exception when duplicate_object then
    null;
  end;

  begin
    alter publication supabase_realtime add table public.messages;
  exception when duplicate_object then
    null;
  end;
end
$$;

commit;
