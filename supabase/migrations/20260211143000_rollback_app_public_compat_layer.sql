begin;

-- Remove temporary app_public mirror views (keep catalog + pharmacy_inventory_public).
drop view if exists app_public.profiles;
drop view if exists app_public.notifications;
drop view if exists app_public.favorites;
drop view if exists app_public.pharmacies;
drop view if exists app_public.patient_requests;
drop view if exists app_public.patient_request_recipients;
drop view if exists app_public.pharmacist_connections;
drop view if exists app_public.stock_requests;
drop view if exists app_public.medication_reminders;
drop view if exists app_public.pharmacy_inventory;
drop view if exists app_public.product_discontinued_marks;
drop view if exists app_public.product_catalog;

-- Remove temporary app_public RPC wrappers.
drop function if exists app_public.get_nearby_pharmacies(double precision, double precision, double precision);
drop function if exists app_public.cancel_patient_request(uuid);
drop function if exists app_public.get_patient_details_for_request(uuid, uuid);
drop function if exists app_public.mark_request_executed(uuid);
drop function if exists app_public.can_manage_pharmacy_inventory(uuid, uuid);

-- Revoke accidental base-table read/write exposure reintroduced for compatibility.
revoke select, insert, update, delete on table public.pharmacy_inventory from anon, authenticated;

commit;
