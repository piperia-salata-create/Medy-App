begin;

create or replace function public.delete_conversation_if_both_confirm(p_conversation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
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

  delete from public.conversations c
  where c.id = p_conversation_id;

  return true;
end;
$$;

commit;
