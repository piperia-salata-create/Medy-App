begin;

create or replace function public.resolve_or_create_medicine(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_medicine_id uuid;
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;

  if v_name is null then
    raise exception 'Medicine name is required';
  end if;

  if not exists (
    select 1
    from public.profiles me
    where me.id = v_actor
      and me.role in ('pharmacist', 'patient')
  ) then
    raise exception 'Not authorized';
  end if;

  select m.id
    into v_medicine_id
  from public.medicines m
  where lower(m.name) = lower(v_name)
  order by m.created_at asc nulls last, m.id asc
  limit 1;

  if v_medicine_id is not null then
    return v_medicine_id;
  end if;

  begin
    insert into public.medicines (name)
    values (v_name)
    returning id into v_medicine_id;
  exception
    when unique_violation then
      select m.id
        into v_medicine_id
      from public.medicines m
      where lower(m.name) = lower(v_name)
      order by m.created_at asc nulls last, m.id asc
      limit 1;
  end;

  if v_medicine_id is null then
    raise exception 'Failed to resolve medicine';
  end if;

  return v_medicine_id;
end;
$$;

revoke all on function public.resolve_or_create_medicine(text) from public;
revoke all on function public.resolve_or_create_medicine(text) from anon;
grant execute on function public.resolve_or_create_medicine(text) to authenticated;

commit;