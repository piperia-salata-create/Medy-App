begin;

create or replace function public.is_conversation_member(
  p_conversation_id uuid,
  p_user_id uuid
)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id = p_conversation_id
      and cm.user_id = p_user_id
  );
$$;

revoke all on function public.is_conversation_member(uuid, uuid) from public;
revoke all on function public.is_conversation_member(uuid, uuid) from anon;
grant execute on function public.is_conversation_member(uuid, uuid) to authenticated;

drop policy if exists "Conversation members can view conversations" on public.conversations;
create policy "Conversation members can view conversations"
  on public.conversations
  for select
  to authenticated
  using (
    public.is_conversation_member(conversations.id, auth.uid())
  );

drop policy if exists "Conversation members can view members" on public.conversation_members;
create policy "Conversation members can view members"
  on public.conversation_members
  for select
  to authenticated
  using (
    public.is_conversation_member(conversation_members.conversation_id, auth.uid())
  );

drop policy if exists "Conversation members can view messages" on public.messages;
create policy "Conversation members can view messages"
  on public.messages
  for select
  to authenticated
  using (
    public.is_conversation_member(messages.conversation_id, auth.uid())
  );

drop policy if exists "Conversation members can send messages" on public.messages;
create policy "Conversation members can send messages"
  on public.messages
  for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and public.is_conversation_member(messages.conversation_id, auth.uid())
  );

commit;
