begin;

do $$
declare
  v_dup_groups integer := 0;
begin
  select count(*)
    into v_dup_groups
  from (
    select exchange_request_id
    from public.conversations
    where exchange_request_id is not null
    group by exchange_request_id
    having count(*) > 1
  ) dup;

  if v_dup_groups > 0 then
    with ranked as (
      select
        c.id,
        c.exchange_request_id,
        first_value(c.id) over (
          partition by c.exchange_request_id
          order by c.created_at asc, c.id asc
        ) as keep_id,
        row_number() over (
          partition by c.exchange_request_id
          order by c.created_at asc, c.id asc
        ) as rn
      from public.conversations c
      where c.exchange_request_id is not null
    ),
    to_merge as (
      select
        r.id as old_id,
        r.keep_id
      from ranked r
      where r.rn > 1
    )
    update public.conversation_members cm
       set conversation_id = tm.keep_id
      from to_merge tm
     where cm.conversation_id = tm.old_id
       and not exists (
         select 1
         from public.conversation_members cm2
         where cm2.conversation_id = tm.keep_id
           and cm2.user_id = cm.user_id
       );

    with ranked as (
      select
        c.id,
        c.exchange_request_id,
        first_value(c.id) over (
          partition by c.exchange_request_id
          order by c.created_at asc, c.id asc
        ) as keep_id,
        row_number() over (
          partition by c.exchange_request_id
          order by c.created_at asc, c.id asc
        ) as rn
      from public.conversations c
      where c.exchange_request_id is not null
    ),
    to_merge as (
      select
        r.id as old_id,
        r.keep_id
      from ranked r
      where r.rn > 1
    )
    delete from public.conversation_members cm
    using to_merge tm
    where cm.conversation_id = tm.old_id;

    with ranked as (
      select
        c.id,
        c.exchange_request_id,
        first_value(c.id) over (
          partition by c.exchange_request_id
          order by c.created_at asc, c.id asc
        ) as keep_id,
        row_number() over (
          partition by c.exchange_request_id
          order by c.created_at asc, c.id asc
        ) as rn
      from public.conversations c
      where c.exchange_request_id is not null
    ),
    to_merge as (
      select
        r.id as old_id,
        r.keep_id
      from ranked r
      where r.rn > 1
    )
    update public.messages m
       set conversation_id = tm.keep_id
      from to_merge tm
     where m.conversation_id = tm.old_id;

    with ranked as (
      select
        c.id,
        c.exchange_request_id,
        first_value(c.id) over (
          partition by c.exchange_request_id
          order by c.created_at asc, c.id asc
        ) as keep_id,
        row_number() over (
          partition by c.exchange_request_id
          order by c.created_at asc, c.id asc
        ) as rn
      from public.conversations c
      where c.exchange_request_id is not null
    ),
    to_merge as (
      select
        r.id as old_id,
        r.keep_id
      from ranked r
      where r.rn > 1
    )
    delete from public.conversations c
    using to_merge tm
    where c.id = tm.old_id;
  end if;
end
$$;

create unique index if not exists idx_conversations_exchange_request_unique
  on public.conversations(exchange_request_id)
  where exchange_request_id is not null;

drop policy if exists "Pharmacists can view active exchange offers" on public.exchange_offers;
create policy "Pharmacists can view active exchange offers"
  on public.exchange_offers
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles me
      where me.id = auth.uid()
        and me.role = 'pharmacist'
    )
    and (
      status = 'active'
      or exists (
        select 1
        from public.pharmacies p
        where p.id = exchange_offers.pharmacy_id
          and p.owner_id = auth.uid()
      )
    )
  );

commit;
