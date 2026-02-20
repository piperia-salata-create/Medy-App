begin;

-- Avoid unsafe ::uuid casts in storage policy checks that can raise 22P02.
-- Compare path segments as text while keeping the same access semantics.

drop policy if exists "Users can insert own avatars" on storage.objects;
create policy "Users can insert own avatars"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and split_part(name, '/', 1) = 'users'
    and split_part(name, '/', 2) = auth.uid()::text
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
    and split_part(name, '/', 2) = auth.uid()::text
    and split_part(name, '/', 3) = 'avatar.webp'
    and split_part(name, '/', 4) = ''
  )
  with check (
    bucket_id = 'avatars'
    and split_part(name, '/', 1) = 'users'
    and split_part(name, '/', 2) = auth.uid()::text
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
    and split_part(name, '/', 2) = auth.uid()::text
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
    and split_part(name, '/', 3) = 'avatar.webp'
    and split_part(name, '/', 4) = ''
    and exists (
      select 1
      from public.pharmacies p
      where p.id::text = split_part(name, '/', 2)
        and p.owner_id::text = auth.uid()::text
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
    and split_part(name, '/', 3) = 'avatar.webp'
    and split_part(name, '/', 4) = ''
    and exists (
      select 1
      from public.pharmacies p
      where p.id::text = split_part(name, '/', 2)
        and p.owner_id::text = auth.uid()::text
    )
  )
  with check (
    bucket_id = 'avatars'
    and split_part(name, '/', 1) = 'pharmacies'
    and split_part(name, '/', 3) = 'avatar.webp'
    and split_part(name, '/', 4) = ''
    and exists (
      select 1
      from public.pharmacies p
      where p.id::text = split_part(name, '/', 2)
        and p.owner_id::text = auth.uid()::text
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
    and split_part(name, '/', 3) = 'avatar.webp'
    and split_part(name, '/', 4) = ''
    and exists (
      select 1
      from public.pharmacies p
      where p.id::text = split_part(name, '/', 2)
        and p.owner_id::text = auth.uid()::text
    )
  );

commit;
