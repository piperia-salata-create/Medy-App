begin;

alter table public.profiles
  add column if not exists avatar_path text;

alter table public.pharmacies
  add column if not exists avatar_path text;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'avatars',
  'avatars',
  false,
  2097152,
  array['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Authenticated can read avatars" on storage.objects;
create policy "Authenticated can read avatars"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'avatars'
    and (
      (
        split_part(name, '/', 1) = 'users'
        and split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and split_part(name, '/', 3) = 'avatar.webp'
        and split_part(name, '/', 4) = ''
      )
      or
      (
        split_part(name, '/', 1) = 'pharmacies'
        and split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and split_part(name, '/', 3) = 'avatar.webp'
        and split_part(name, '/', 4) = ''
      )
    )
  );

drop policy if exists "Users can insert own avatars" on storage.objects;
create policy "Users can insert own avatars"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and split_part(name, '/', 1) = 'users'
    and split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and (split_part(name, '/', 2))::uuid = auth.uid()
    and split_part(name, '/', 3) = 'avatar.webp'
    and split_part(name, '/', 4) = ''
  );

drop policy if exists "Users can update own avatars" on storage.objects;
create policy "Users can update own avatars"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and split_part(name, '/', 1) = 'users'
    and split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and (split_part(name, '/', 2))::uuid = auth.uid()
    and split_part(name, '/', 3) = 'avatar.webp'
    and split_part(name, '/', 4) = ''
  )
  with check (
    bucket_id = 'avatars'
    and split_part(name, '/', 1) = 'users'
    and split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and (split_part(name, '/', 2))::uuid = auth.uid()
    and split_part(name, '/', 3) = 'avatar.webp'
    and split_part(name, '/', 4) = ''
  );

drop policy if exists "Users can delete own avatars" on storage.objects;
create policy "Users can delete own avatars"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and split_part(name, '/', 1) = 'users'
    and split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and (split_part(name, '/', 2))::uuid = auth.uid()
    and split_part(name, '/', 3) = 'avatar.webp'
    and split_part(name, '/', 4) = ''
  );

drop policy if exists "Pharmacy owners can insert pharmacy avatars" on storage.objects;
create policy "Pharmacy owners can insert pharmacy avatars"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and split_part(name, '/', 1) = 'pharmacies'
    and split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and split_part(name, '/', 3) = 'avatar.webp'
    and split_part(name, '/', 4) = ''
    and exists (
      select 1
      from public.pharmacies p
      where p.id = (split_part(name, '/', 2))::uuid
        and p.owner_id = auth.uid()
    )
  );

drop policy if exists "Pharmacy owners can update pharmacy avatars" on storage.objects;
create policy "Pharmacy owners can update pharmacy avatars"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and split_part(name, '/', 1) = 'pharmacies'
    and split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and split_part(name, '/', 3) = 'avatar.webp'
    and split_part(name, '/', 4) = ''
    and exists (
      select 1
      from public.pharmacies p
      where p.id = (split_part(name, '/', 2))::uuid
        and p.owner_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'avatars'
    and split_part(name, '/', 1) = 'pharmacies'
    and split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and split_part(name, '/', 3) = 'avatar.webp'
    and split_part(name, '/', 4) = ''
    and exists (
      select 1
      from public.pharmacies p
      where p.id = (split_part(name, '/', 2))::uuid
        and p.owner_id = auth.uid()
    )
  );

drop policy if exists "Pharmacy owners can delete pharmacy avatars" on storage.objects;
create policy "Pharmacy owners can delete pharmacy avatars"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and split_part(name, '/', 1) = 'pharmacies'
    and split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and split_part(name, '/', 3) = 'avatar.webp'
    and split_part(name, '/', 4) = ''
    and exists (
      select 1
      from public.pharmacies p
      where p.id = (split_part(name, '/', 2))::uuid
        and p.owner_id = auth.uid()
    )
  );

commit;
