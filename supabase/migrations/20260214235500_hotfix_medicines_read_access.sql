begin;

grant usage on schema public to authenticated;

grant select on table public.medicines to authenticated;
revoke insert, update, delete, truncate, references, trigger on table public.medicines from authenticated;

do $$
begin
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'medicines'
      and c.relkind in ('r', 'p')
      and c.relrowsecurity
  ) then
    if not exists (
      select 1
      from pg_policies p
      where p.schemaname = 'public'
        and p.tablename = 'medicines'
        and p.policyname = 'Authenticated can read medicines'
    ) then
      create policy "Authenticated can read medicines"
      on public.medicines
      for select
      to authenticated
      using (true);
    end if;
  end if;
end
$$;

commit;

