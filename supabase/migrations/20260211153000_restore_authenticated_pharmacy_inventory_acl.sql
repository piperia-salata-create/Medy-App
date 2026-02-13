begin;

-- Pharmacist flows query and mutate public.pharmacy_inventory under authenticated + RLS.
-- Restore only authenticated privileges; keep anon locked down.
grant select, insert, update, delete on table public.pharmacy_inventory to authenticated;
revoke all on table public.pharmacy_inventory from anon;

commit;
