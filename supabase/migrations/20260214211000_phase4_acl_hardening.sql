begin;

revoke all on table public.exchange_offers from authenticated;
revoke all on table public.exchange_requests from authenticated;
revoke all on table public.conversations from authenticated;
revoke all on table public.conversation_members from authenticated;
revoke all on table public.messages from authenticated;
revoke all on table public.exchange_demands from authenticated;
revoke all on table public.exchange_notifications from authenticated;
revoke all on table public.chat_blocks from authenticated;
revoke all on table public.chat_reports from authenticated;

grant select, update, delete on table public.exchange_offers to authenticated;
grant select, insert, update on table public.exchange_requests to authenticated;
grant select on table public.conversations to authenticated;
grant select on table public.conversation_members to authenticated;
grant select on table public.messages to authenticated;
grant select, update, delete on table public.exchange_demands to authenticated;
grant select, update on table public.exchange_notifications to authenticated;
grant select, insert, delete on table public.chat_blocks to authenticated;
grant insert on table public.chat_reports to authenticated;

commit;
