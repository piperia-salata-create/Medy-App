begin;

grant usage on schema app_public to anon, authenticated, service_role;

create or replace view app_public.profiles as
select * from public.profiles;
alter view app_public.profiles set (security_invoker = true);

create or replace view app_public.notifications as
select * from public.notifications;
alter view app_public.notifications set (security_invoker = true);

create or replace view app_public.favorites as
select * from public.favorites;
alter view app_public.favorites set (security_invoker = true);

create or replace view app_public.pharmacies as
select * from public.pharmacies;
alter view app_public.pharmacies set (security_invoker = true);

create or replace view app_public.patient_requests as
select * from public.patient_requests;
alter view app_public.patient_requests set (security_invoker = true);

create or replace view app_public.patient_request_recipients as
select * from public.patient_request_recipients;
alter view app_public.patient_request_recipients set (security_invoker = true);

create or replace view app_public.pharmacist_connections as
select * from public.pharmacist_connections;
alter view app_public.pharmacist_connections set (security_invoker = true);

create or replace view app_public.stock_requests as
select * from public.stock_requests;
alter view app_public.stock_requests set (security_invoker = true);

create or replace view app_public.medication_reminders as
select * from public.medication_reminders;
alter view app_public.medication_reminders set (security_invoker = true);

create or replace view app_public.pharmacy_inventory as
select * from public.pharmacy_inventory;
alter view app_public.pharmacy_inventory set (security_invoker = true);

create or replace view app_public.product_discontinued_marks as
select * from public.product_discontinued_marks;
alter view app_public.product_discontinued_marks set (security_invoker = true);

create or replace view app_public.product_catalog as
select * from public.product_catalog;
alter view app_public.product_catalog set (security_invoker = true);

revoke all on table app_public.profiles from anon, authenticated, service_role;
grant select, insert, update, delete on table app_public.profiles to anon, authenticated, service_role;

revoke all on table app_public.notifications from anon, authenticated, service_role;
grant select, insert, update, delete on table app_public.notifications to anon, authenticated, service_role;

revoke all on table app_public.favorites from anon, authenticated, service_role;
grant select, insert, update, delete on table app_public.favorites to anon, authenticated, service_role;

revoke all on table app_public.pharmacies from anon, authenticated, service_role;
grant select, insert, update, delete on table app_public.pharmacies to anon, authenticated, service_role;

revoke all on table app_public.patient_requests from anon, authenticated, service_role;
grant select, insert, update, delete on table app_public.patient_requests to anon, authenticated, service_role;

revoke all on table app_public.patient_request_recipients from anon, authenticated, service_role;
grant select, insert, update, delete on table app_public.patient_request_recipients to anon, authenticated, service_role;

revoke all on table app_public.pharmacist_connections from anon, authenticated, service_role;
grant select, insert, update, delete on table app_public.pharmacist_connections to anon, authenticated, service_role;

revoke all on table app_public.stock_requests from anon, authenticated, service_role;
grant select, insert, update, delete on table app_public.stock_requests to anon, authenticated, service_role;

revoke all on table app_public.medication_reminders from anon, authenticated, service_role;
grant select, insert, update, delete on table app_public.medication_reminders to anon, authenticated, service_role;

revoke all on table app_public.pharmacy_inventory from anon, authenticated, service_role;
grant select, insert, update, delete on table app_public.pharmacy_inventory to anon, authenticated, service_role;

revoke all on table app_public.product_discontinued_marks from anon, authenticated, service_role;
grant select, insert, update, delete on table app_public.product_discontinued_marks to anon, authenticated, service_role;

revoke all on table app_public.product_catalog from anon, authenticated, service_role;
grant select, insert, update, delete on table app_public.product_catalog to anon, authenticated, service_role;

create or replace function app_public.get_nearby_pharmacies(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision
)
returns table (
  id uuid,
  name text,
  address text,
  latitude double precision,
  longitude double precision,
  distance_km double precision
)
language sql
security invoker
set search_path = app_public, public
as $$
  select *
  from public.get_nearby_pharmacies(p_lat, p_lng, p_radius_km);
$$;

create or replace function app_public.cancel_patient_request(
  p_request_id uuid
)
returns void
language sql
security invoker
set search_path = app_public, public
as $$
  select public.cancel_patient_request(p_request_id);
$$;

create or replace function app_public.get_patient_details_for_request(
  p_request_id uuid,
  p_pharmacy_id uuid
)
returns table (
  request_id uuid,
  patient_id uuid,
  patient_full_name text,
  patient_phone text,
  patient_address text,
  patient_address_text text,
  patient_latitude numeric,
  patient_longitude numeric,
  request_notes text
)
language sql
security invoker
set search_path = app_public, public
as $$
  select *
  from public.get_patient_details_for_request(p_request_id, p_pharmacy_id);
$$;

create or replace function app_public.mark_request_executed(
  p_request_id uuid
)
returns table (
  id uuid,
  status text,
  executed_at timestamp with time zone
)
language sql
security invoker
set search_path = app_public, public
as $$
  select *
  from public.mark_request_executed(p_request_id);
$$;

create or replace function app_public.can_manage_pharmacy_inventory(
  p_pharmacy_id uuid,
  p_user_id uuid
)
returns boolean
language sql
security invoker
set search_path = app_public, public
as $$
  select public.can_manage_pharmacy_inventory(p_pharmacy_id, p_user_id);
$$;

revoke all on function app_public.get_nearby_pharmacies(double precision, double precision, double precision) from anon, authenticated, service_role;
grant execute on function app_public.get_nearby_pharmacies(double precision, double precision, double precision) to anon, authenticated, service_role;

revoke all on function app_public.cancel_patient_request(uuid) from anon, authenticated, service_role;
grant execute on function app_public.cancel_patient_request(uuid) to anon, authenticated, service_role;

revoke all on function app_public.get_patient_details_for_request(uuid, uuid) from anon, authenticated, service_role;
grant execute on function app_public.get_patient_details_for_request(uuid, uuid) to anon, authenticated, service_role;

revoke all on function app_public.mark_request_executed(uuid) from anon, authenticated, service_role;
grant execute on function app_public.mark_request_executed(uuid) to anon, authenticated, service_role;

revoke all on function app_public.can_manage_pharmacy_inventory(uuid, uuid) from anon, authenticated, service_role;
grant execute on function app_public.can_manage_pharmacy_inventory(uuid, uuid) to anon, authenticated, service_role;

commit;
