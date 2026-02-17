do $$
declare
  v_constraint_name text;
begin
  for v_constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.exchange_notifications'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%kind%'
  loop
    execute format('alter table public.exchange_notifications drop constraint %I', v_constraint_name);
  end loop;
end $$;

alter table public.exchange_notifications
  add constraint exchange_notifications_kind_check
  check (kind in ('demand_match', 'offer_match', 'chat_message'));

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
  v_recipient_user_id uuid;
  v_sender_label text;
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

  for v_recipient_user_id in
    select cm.user_id
    from public.conversation_members cm
    where cm.conversation_id = p_conversation_id
      and cm.user_id <> v_actor
  loop
    perform public.enqueue_exchange_notification(
      v_recipient_user_id,
      'chat_message',
      coalesce(v_sender_label, 'Pharmacist') || ' sent you a message',
      left(v_trimmed_body, 160),
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
      'body_length', char_length(v_trimmed_body)
    )
  );

  return v_message_id;
end;
$$;

revoke all on function public.send_message(uuid, text) from public;
revoke all on function public.send_message(uuid, text) from anon;
grant execute on function public.send_message(uuid, text) to authenticated;
