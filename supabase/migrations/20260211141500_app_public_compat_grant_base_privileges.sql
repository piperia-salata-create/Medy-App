begin;

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on table public.profiles to anon, authenticated, service_role;
grant select, insert, update, delete on table public.notifications to anon, authenticated, service_role;
grant select, insert, update, delete on table public.favorites to anon, authenticated, service_role;
grant select, insert, update, delete on table public.pharmacies to anon, authenticated, service_role;
grant select, insert, update, delete on table public.patient_requests to anon, authenticated, service_role;
grant select, insert, update, delete on table public.patient_request_recipients to anon, authenticated, service_role;
grant select, insert, update, delete on table public.pharmacist_connections to anon, authenticated, service_role;
grant select, insert, update, delete on table public.stock_requests to anon, authenticated, service_role;
grant select, insert, update, delete on table public.medication_reminders to anon, authenticated, service_role;
grant select, insert, update, delete on table public.pharmacy_inventory to anon, authenticated, service_role;
grant select, insert, update, delete on table public.product_discontinued_marks to anon, authenticated, service_role;
grant select, insert, update, delete on table public.product_catalog to anon, authenticated, service_role;

grant execute on function public.get_nearby_pharmacies(double precision, double precision, double precision) to anon, authenticated, service_role;
grant execute on function public.cancel_patient_request(uuid) to anon, authenticated, service_role;
grant execute on function public.get_patient_details_for_request(uuid, uuid) to anon, authenticated, service_role;
grant execute on function public.mark_request_executed(uuid) to anon, authenticated, service_role;
grant execute on function public.can_manage_pharmacy_inventory(uuid, uuid) to anon, authenticated, service_role;

commit;
