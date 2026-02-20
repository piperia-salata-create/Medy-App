begin;

create or replace function public.toggle_conversation_completion_request(
  p_conversation_id uuid,
  p_requested boolean default true
)
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
  v_conversation_type public.conversation_type;
  v_exchange_request_id uuid;
  v_request_status text;
  v_current_requested_by uuid;
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

  select c.type, c.exchange_request_id, c.close_requested_by
    into v_conversation_type, v_exchange_request_id, v_current_requested_by
  from public.conversations c
  where c.id = p_conversation_id;

  if not found then
    raise exception 'Conversation not found';
  end if;

  if v_conversation_type = 'exchange' and v_exchange_request_id is not null then
    select er.status::text
      into v_request_status
    from public.exchange_requests er
    where er.id = v_exchange_request_id;

    if v_request_status is null then
      raise exception 'Exchange request not found';
    end if;

    if lower(v_request_status) in ('completed', 'closed', 'executed', 'finalized') then
      raise exception 'Conversation completion request is locked for finalized exchanges';
    end if;
  end if;

  if coalesce(p_requested, false) then
    if v_current_requested_by is null then
      update public.conversations c
         set close_requested_by = v_actor,
             close_requested_at = now()
       where c.id = p_conversation_id;
    elsif v_current_requested_by <> v_actor then
      raise exception 'The other participant has already requested completion';
    end if;
  else
    if v_current_requested_by is null then
      null;
    elsif v_current_requested_by <> v_actor then
      raise exception 'Only the requester can cancel completion request';
    else
      update public.conversations c
         set close_requested_by = null,
             close_requested_at = null
       where c.id = p_conversation_id;
    end if;
  end if;

  return query
  select c.close_requested_by, c.close_requested_at
  from public.conversations c
  where c.id = p_conversation_id;
end;
$$;

revoke all on function public.toggle_conversation_completion_request(uuid, boolean) from public;
revoke all on function public.toggle_conversation_completion_request(uuid, boolean) from anon;
grant execute on function public.toggle_conversation_completion_request(uuid, boolean) to authenticated;
grant execute on function public.toggle_conversation_completion_request(uuid, boolean) to service_role;

commit;
