begin;

alter table public.messages
  alter column body drop not null;

alter table public.messages
  drop constraint if exists messages_body_check;

alter table public.messages
  add column if not exists message_type text not null default 'text',
  add column if not exists attachment_url text,
  add column if not exists attachment_mime text,
  add column if not exists attachment_size integer,
  add column if not exists attachment_width integer,
  add column if not exists attachment_height integer;

alter table public.messages
  drop constraint if exists messages_message_type_check;

alter table public.messages
  add constraint messages_message_type_check
  check (message_type in ('text', 'image'));

alter table public.messages
  drop constraint if exists messages_payload_valid_check;

alter table public.messages
  add constraint messages_payload_valid_check
  check (
    (
      message_type = 'text'
      and nullif(btrim(coalesce(body, '')), '') is not null
      and char_length(body) <= 4000
      and attachment_url is null
      and attachment_mime is null
      and attachment_size is null
      and attachment_width is null
      and attachment_height is null
    )
    or (
      message_type = 'image'
      and attachment_url is not null
      and attachment_mime like 'image/%'
      and attachment_size is not null
      and attachment_size > 0
      and attachment_size <= 10485760
      and (body is null or char_length(body) <= 4000)
    )
  );

create index if not exists idx_messages_conversation_message_type_created_at
  on public.messages(conversation_id, message_type, created_at desc);

alter table public.conversations
  add column if not exists close_requested_by uuid references auth.users(id) on delete set null,
  add column if not exists close_requested_at timestamptz;

alter table public.conversations
  drop constraint if exists conversations_close_request_consistency_check;

alter table public.conversations
  add constraint conversations_close_request_consistency_check
  check (
    (close_requested_by is null and close_requested_at is null)
    or (close_requested_by is not null and close_requested_at is not null)
  );

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'chat-attachments',
  'chat-attachments',
  false,
  10485760,
  array['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Chat members can read chat attachments" on storage.objects;
create policy "Chat members can read chat attachments"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'chat-attachments'
    and split_part(name, '/', 1) = 'conversations'
    and split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and public.is_conversation_member((split_part(name, '/', 2))::uuid, auth.uid())
  );

drop policy if exists "Chat members can upload chat attachments" on storage.objects;
create policy "Chat members can upload chat attachments"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'chat-attachments'
    and split_part(name, '/', 1) = 'conversations'
    and split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and public.is_conversation_member((split_part(name, '/', 2))::uuid, auth.uid())
  );

create or replace function public.send_image_message(
  p_conversation_id uuid,
  p_attachment_url text,
  p_attachment_mime text,
  p_attachment_size integer,
  p_attachment_width integer default null,
  p_attachment_height integer default null,
  p_body text default null
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
  v_attachment_url text;
  v_attachment_mime text;
  v_trimmed_body text;
  v_recipient_user_id uuid;
  v_sender_label text;
  v_notification_body text;
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

  v_attachment_url := nullif(btrim(coalesce(p_attachment_url, '')), '');
  if v_attachment_url is null then
    raise exception 'attachment_url is required';
  end if;

  if v_attachment_url not like ('conversations/' || p_conversation_id::text || '/%') then
    raise exception 'attachment_url must be under conversations/%', p_conversation_id::text;
  end if;

  v_attachment_mime := lower(nullif(btrim(coalesce(p_attachment_mime, '')), ''));
  if v_attachment_mime is null or v_attachment_mime not like 'image/%' then
    raise exception 'attachment_mime must be an image mime type';
  end if;

  if p_attachment_size is null or p_attachment_size <= 0 or p_attachment_size > 10485760 then
    raise exception 'attachment_size must be between 1 and 10485760 bytes';
  end if;

  if p_attachment_width is not null and p_attachment_width <= 0 then
    raise exception 'attachment_width must be positive';
  end if;

  if p_attachment_height is not null and p_attachment_height <= 0 then
    raise exception 'attachment_height must be positive';
  end if;

  v_trimmed_body := nullif(btrim(coalesce(p_body, '')), '');
  if v_trimmed_body is not null and char_length(v_trimmed_body) > 4000 then
    raise exception 'Message body is too long (max 4000 characters)';
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
    body,
    message_type,
    attachment_url,
    attachment_mime,
    attachment_size,
    attachment_width,
    attachment_height
  )
  values (
    p_conversation_id,
    v_actor,
    v_trimmed_body,
    'image',
    v_attachment_url,
    v_attachment_mime,
    p_attachment_size,
    p_attachment_width,
    p_attachment_height
  )
  returning id into v_message_id;

  select
    coalesce(
      nullif(btrim(p.pharmacy_name), ''),
      nullif(btrim(p.full_name), ''),
      nullif(btrim(p.email), ''),
      'Pharmacist'
    )
    into v_sender_label
  from public.profiles p
  where p.id = v_actor;

  v_notification_body := coalesce(left(v_trimmed_body, 160), 'Sent an image');

  for v_recipient_user_id in
    select cm.user_id
    from public.conversation_members cm
    where cm.conversation_id = p_conversation_id
      and cm.user_id <> v_actor
  loop
    perform public.enqueue_exchange_notification(
      v_recipient_user_id,
      'chat_message',
      coalesce(v_sender_label, 'Pharmacist') || ' sent you an image',
      v_notification_body,
      jsonb_build_object(
        'conversation_id', p_conversation_id,
        'sender_id', v_actor,
        'message_id', v_message_id
      )
    );
  end loop;

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
      'message_type', 'image',
      'attachment_size', p_attachment_size
    )
  );

  return v_message_id;
end;
$$;

create or replace function public.request_conversation_completion(p_conversation_id uuid)
returns table (
  close_requested_by uuid,
  close_requested_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;

  if p_conversation_id is null then
    raise exception 'conversation_id is required';
  end if;

  if not public.is_conversation_member(p_conversation_id, v_actor) then
    raise exception 'Not authorized for this conversation';
  end if;

  update public.conversations c
     set close_requested_by = v_actor,
         close_requested_at = now()
   where c.id = p_conversation_id
     and c.close_requested_by is null;

  return query
  select c.close_requested_by, c.close_requested_at
  from public.conversations c
  where c.id = p_conversation_id;
end;
$$;

create or replace function public.delete_conversation_if_both_confirm(p_conversation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  v_actor uuid := auth.uid();
  v_close_requested_by uuid;
  v_member_count integer;
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;

  if p_conversation_id is null then
    raise exception 'conversation_id is required';
  end if;

  if not public.is_conversation_member(p_conversation_id, v_actor) then
    raise exception 'Not authorized for this conversation';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_conversation_id::text));

  select c.close_requested_by
    into v_close_requested_by
  from public.conversations c
  where c.id = p_conversation_id;

  if not found then
    raise exception 'Conversation not found';
  end if;

  if v_close_requested_by is null then
    raise exception 'Completion has not been requested yet';
  end if;

  if v_close_requested_by = v_actor then
    raise exception 'Waiting for the other participant to confirm completion';
  end if;

  select count(*)
    into v_member_count
  from public.conversation_members cm
  where cm.conversation_id = p_conversation_id;

  if v_member_count <> 2 then
    raise exception 'Conversation closure supports only two-participant conversations';
  end if;

  delete from storage.objects
  where bucket_id = 'chat-attachments'
    and name like ('conversations/' || p_conversation_id::text || '/%');

  delete from public.conversations c
  where c.id = p_conversation_id;

  return true;
end;
$$;

revoke all on function public.send_image_message(uuid, text, text, integer, integer, integer, text) from public;
revoke all on function public.send_image_message(uuid, text, text, integer, integer, integer, text) from anon;
grant execute on function public.send_image_message(uuid, text, text, integer, integer, integer, text) to authenticated;
grant execute on function public.send_image_message(uuid, text, text, integer, integer, integer, text) to service_role;

revoke all on function public.request_conversation_completion(uuid) from public;
revoke all on function public.request_conversation_completion(uuid) from anon;
grant execute on function public.request_conversation_completion(uuid) to authenticated;
grant execute on function public.request_conversation_completion(uuid) to service_role;

revoke all on function public.delete_conversation_if_both_confirm(uuid) from public;
revoke all on function public.delete_conversation_if_both_confirm(uuid) from anon;
grant execute on function public.delete_conversation_if_both_confirm(uuid) to authenticated;
grant execute on function public.delete_conversation_if_both_confirm(uuid) to service_role;

commit;
