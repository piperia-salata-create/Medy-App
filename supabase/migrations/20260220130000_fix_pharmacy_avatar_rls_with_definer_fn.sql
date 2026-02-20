begin;

create or replace function public.can_manage_pharmacy_avatar(object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  parts text[];
  pharmacy_uuid uuid;
begin
  if object_name is null then
    return false;
  end if;

  parts := string_to_array(object_name, '/');
  if array_length(parts, 1) <> 3 then
    return false;
  end if;

  if parts[1] <> 'pharmacies' or parts[3] <> 'avatar.webp' then
    return false;
  end if;

  begin
    pharmacy_uuid := parts[2]::uuid;
  exception
    when others then
      return false;
  end;

  return exists (
    select 1
    from public.pharmacies p
    where p.id = pharmacy_uuid
      and p.owner_id::text = auth.uid()::text
  );
end;
$$;

grant execute on function public.can_manage_pharmacy_avatar(text) to authenticated;

drop policy if exists "Pharmacy owners can insert pharmacy avatars" on storage.objects;
create policy "Pharmacy owners can insert pharmacy avatars"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and public.can_manage_pharmacy_avatar(name)
  );

drop policy if exists "Pharmacy owners can update pharmacy avatars" on storage.objects;
create policy "Pharmacy owners can update pharmacy avatars"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and public.can_manage_pharmacy_avatar(name)
  )
  with check (
    bucket_id = 'avatars'
    and public.can_manage_pharmacy_avatar(name)
  );

drop policy if exists "Pharmacy owners can delete pharmacy avatars" on storage.objects;
create policy "Pharmacy owners can delete pharmacy avatars"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and public.can_manage_pharmacy_avatar(name)
  );

commit;
