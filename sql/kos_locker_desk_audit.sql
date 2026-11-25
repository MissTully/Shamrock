-- Krewe of Shamrock: locker desk data audit.
-- NOT APPLIED. Do not run this from the website.
-- Project: oazwkwflgbthojvnclfc. Safe to re-run.
--
-- Run sql/kos_locker_desk.sql first, then this file.
-- The last SELECT is the officer list: what this run changed, then what
-- still needs a person. It has names and locker numbers only.
--
-- What a re-run does:
--   * Cancels a second open reservation on the same locker
--     (Peter Caughey was listed twice for RL2).
--   * Puts the reservation holder back on a locker whose holder was blank
--     (Kate Sorsby was on the report for LL2 and missing from inventory).
--   * Links a locker payment only when one reservation matches the payer
--     and the size. Paid date becomes payments.created_at.
--   * Otherwise links it straight to a held locker when the payer is the
--     holder and the size matches (Doug Tully, RL7 large).
--   * Marks LL4 comp for King and Queen and drops any payment on it.
--   * Clears paid_at when no payment is linked, including dates that only
--     existed because the inventory was seeded on 2026-09-30.
--   * Flags RL3 Kim Kelly unverified when she still has no locker payment.
--   * Leaves a size mismatch in place (Jim Sugrue asked for a small locker
--     and is on large RL5) so an officer can move it.
--   * Does not assign a locker to someone who paid and is still waiting
--     (Robyn Thornburg small, Tim Dyn large, Charles Bauder large).

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'lockers' and column_name = 'payment_id'
  ) then
    raise exception 'Run sql/kos_locker_desk.sql before this audit.';
  end if;
end $$;

create or replace function public.kos_locker_audit_name_match(
  p_res_member uuid,
  p_res_name text,
  p_pay_member uuid,
  p_pay_name text
)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select
    (p_pay_member is not null and p_res_member = p_pay_member)
    or (
      length(btrim(coalesce(p_pay_name, ''))) > 3
      and lower(regexp_replace(coalesce(p_res_name, ''), '[^a-zA-Z]+', '', 'g'))
        = lower(regexp_replace(p_pay_name, '[^a-zA-Z]+', '', 'g'))
    )
    or exists (
      select 1
      from public.members m
      where m.id = p_res_member
        and m.merged_into is null
        and position(' ' in btrim(coalesce(p_pay_name, ''))) > 0
        and lower(btrim(coalesce(m.last_name, ''))) = lower(regexp_replace(btrim(p_pay_name), '^.*\s+', ''))
        and length(btrim(coalesce(m.last_name, ''))) > 1
        and (
          lower(btrim(coalesce(m.first_name, ''))) = lower(split_part(btrim(p_pay_name), ' ', 1))
          or lower(btrim(coalesce(m.first_name, ''))) like lower(split_part(btrim(p_pay_name), ' ', 1)) || '%'
          or lower(split_part(btrim(p_pay_name), ' ', 1)) like lower(btrim(coalesce(m.first_name, ''))) || '%'
        )
    );
$fn$;

revoke all on function public.kos_locker_audit_name_match(uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.kos_locker_audit_name_match(uuid, text, uuid, text) to current_user;

drop table if exists pg_temp.locker_audit_report;
create temp table locker_audit_report (
  sort int not null,
  kind text not null,
  locker_number text,
  member_name text,
  size text,
  detail text
);

-- 1) Second open row on the same locker.
with ranked as (
  select
    r.id,
    l.locker_number,
    coalesce(public.kos_locker_person_name(r.member_id, r.requester_name), 'Name missing') as member_name,
    r.size,
    row_number() over (
      partition by r.locker_id
      order by (r.payment_id is not null) desc, r.created_at, r.id
    ) as n
  from public.locker_reservations r
  join public.lockers l on l.id = r.locker_id
  where r.status <> 'cancelled'
    and coalesce(r.is_renewal, false) = false
),
cut as (
  update public.locker_reservations r
     set status = 'cancelled',
         notes = left(btrim(coalesce(r.notes, '') || ' Duplicate locker row removed by the locker desk audit.'), 500)
  from ranked
  where r.id = ranked.id
    and ranked.n > 1
  returning ranked.locker_number, ranked.member_name, ranked.size
)
insert into locker_audit_report (sort, kind, locker_number, member_name, size, detail)
select 10, 'duplicate_removed', locker_number, member_name, size,
       'Cancelled the extra row on this locker.'
from cut;

-- 2) Reservation knows the holder, the locker row does not.
with src as (
  select distinct on (r.locker_id)
    r.locker_id,
    r.member_id,
    public.kos_locker_person_name(r.member_id, r.requester_name) as member_name,
    l.locker_number,
    l.size
  from public.locker_reservations r
  join public.lockers l on l.id = r.locker_id
  where r.status <> 'cancelled'
    and coalesce(r.is_renewal, false) = false
    and upper(l.locker_number) <> 'LL4'
    and public.kos_locker_person_name(l.member_id, l.holder_name) is null
    and public.kos_locker_person_name(r.member_id, r.requester_name) is not null
  order by r.locker_id, (r.payment_id is not null) desc, r.created_at, r.id
),
fixed as (
  update public.lockers l
     set holder_name = src.member_name,
         member_id = coalesce(l.member_id, src.member_id),
         status = case when l.status = 'available' then 'pending_payment' else l.status end
  from src
  where l.id = src.locker_id
  returning src.locker_number, src.member_name, src.size
)
insert into locker_audit_report (sort, kind, locker_number, member_name, size, detail)
select 20, 'holder_restored', locker_number, member_name, size,
       'Locker row now shows the same holder as the reservation.'
from fixed;

-- 3) Link a payment when exactly one open reservation matches.
do $$
declare
  rec record;
  v_count int;
  v_res uuid;
  v_locker text;
  v_name text;
  v_size text;
begin
  for rec in
    select
      p.id,
      p.member_id,
      p.payer_name,
      public.kos_locker_payment_size_safe(p.description, p.amount_cents, p.raw) as locker_size
    from public.payments p
    where lower(p.status) in ('succeeded', 'paid', 'complete', 'completed')
      and public.kos_locker_payment_size_safe(p.description, p.amount_cents, p.raw) is not null
      and not exists (select 1 from public.lockers l where l.payment_id = p.id)
      and not exists (
        select 1 from public.locker_reservations r
        where r.payment_id = p.id and r.status <> 'cancelled'
      )
  loop
    select count(*) into v_count
    from public.locker_reservations r
    where r.status in ('queued', 'assigned')
      and r.payment_id is null
      and coalesce(r.is_renewal, false) = false
      and (rec.locker_size = 'unknown' or r.size = rec.locker_size)
      and public.kos_locker_audit_name_match(r.member_id, r.requester_name, rec.member_id, rec.payer_name);

    if v_count <> 1 then
      continue;
    end if;

    select r.id, l.locker_number,
           coalesce(public.kos_locker_person_name(r.member_id, r.requester_name), 'Name missing'),
           r.size
      into v_res, v_locker, v_name, v_size
    from public.locker_reservations r
    left join public.lockers l on l.id = r.locker_id
    where r.status in ('queued', 'assigned')
      and r.payment_id is null
      and coalesce(r.is_renewal, false) = false
      and (rec.locker_size = 'unknown' or r.size = rec.locker_size)
      and public.kos_locker_audit_name_match(r.member_id, r.requester_name, rec.member_id, rec.payer_name)
    limit 1;

    update public.locker_reservations
       set payment_id = rec.id
     where id = v_res;

    insert into locker_audit_report (sort, kind, locker_number, member_name, size, detail)
    values (
      30, 'payment_linked', v_locker, v_name, v_size,
      'Linked the matching locker payment. Paid date is the payment date.'
    );
  end loop;
end $$;

-- Copy that payment onto the locker when the sizes agree. Never onto LL4.
update public.lockers l
   set payment_id = src.payment_id,
       payment_unverified = false
from (
  select distinct on (r.locker_id)
    r.locker_id,
    r.payment_id
  from public.locker_reservations r
  join public.lockers hold on hold.id = r.locker_id
  join public.payments p on p.id = r.payment_id
  where r.status <> 'cancelled'
    and r.size = hold.size
    and upper(hold.locker_number) <> 'LL4'
    and hold.status is distinct from 'comp'
    and lower(p.status) in ('succeeded', 'paid', 'complete', 'completed')
  order by r.locker_id, r.created_at desc
) src
where l.id = src.locker_id
  and l.payment_id is null;

-- 3b) A holder who paid but has no open reservation (Doug Tully on RL7:
-- his small request was cancelled when he took the large locker).
-- Link the payment straight to the locker when the payer is the holder,
-- the size agrees, and exactly one held locker matches. Never LL4 or comp.
do $$
declare
  rec record;
  v_count int;
  v_lock uuid;
  v_num text;
  v_name text;
  v_size text;
begin
  for rec in
    select
      p.id,
      p.member_id,
      p.payer_name,
      public.kos_locker_payment_size_safe(p.description, p.amount_cents, p.raw) as locker_size
    from public.payments p
    where lower(p.status) in ('succeeded', 'paid', 'complete', 'completed')
      and public.kos_locker_payment_size_safe(p.description, p.amount_cents, p.raw) is not null
      and not exists (select 1 from public.lockers l where l.payment_id = p.id)
      and not exists (
        select 1 from public.locker_reservations r
        where r.payment_id = p.id and r.status <> 'cancelled'
      )
    order by p.created_at, p.id
  loop
    select count(*) into v_count
    from public.lockers l
    where l.payment_id is null
      and l.status is distinct from 'comp'
      and upper(l.locker_number) <> 'LL4'
      and (l.member_id is not null or nullif(btrim(coalesce(l.holder_name, '')), '') is not null)
      and (rec.locker_size = 'unknown' or l.size = rec.locker_size)
      and public.kos_locker_audit_name_match(l.member_id, l.holder_name, rec.member_id, rec.payer_name);

    if v_count <> 1 then
      continue;
    end if;

    select l.id, l.locker_number,
           coalesce(public.kos_locker_person_name(l.member_id, l.holder_name), 'Name missing'),
           l.size
      into v_lock, v_num, v_name, v_size
    from public.lockers l
    where l.payment_id is null
      and l.status is distinct from 'comp'
      and upper(l.locker_number) <> 'LL4'
      and (l.member_id is not null or nullif(btrim(coalesce(l.holder_name, '')), '') is not null)
      and (rec.locker_size = 'unknown' or l.size = rec.locker_size)
      and public.kos_locker_audit_name_match(l.member_id, l.holder_name, rec.member_id, rec.payer_name)
    limit 1;

    update public.lockers
       set payment_id = rec.id,
           payment_unverified = false
     where id = v_lock
       and payment_id is null;

    insert into locker_audit_report (sort, kind, locker_number, member_name, size, detail)
    values (
      31, 'payment_linked', v_num, v_name, v_size,
      'Linked the holder''s locker payment to this locker. Paid date is the payment date.'
    );
  end loop;
end $$;

-- 4) LL4 is the comp locker.
with fixed as (
  update public.lockers
     set status = 'comp',
         holder_name = coalesce(nullif(btrim(holder_name), ''), 'King and Queen'),
         member_id = null,
         holder_email = null,
         payment_id = null,
         payment_unverified = false
   where upper(locker_number) = 'LL4'
     and (
       status is distinct from 'comp'
       or payment_id is not null
       or member_id is not null
       or nullif(btrim(holder_name), '') is null
     )
  returning locker_number, holder_name, size
)
insert into locker_audit_report (sort, kind, locker_number, member_name, size, detail)
select 40, 'marked_comp', locker_number, holder_name, size,
       'Comp is its own status. It is not a payment.'
from fixed;

-- 5) Drop paid dates that are not a payment. Sync the rest to the payment.
with cleared as (
  update public.locker_reservations r
     set paid_at = null
   where r.payment_id is null
     and r.paid_at is not null
  returning
    coalesce(public.kos_locker_person_name(r.member_id, r.requester_name), 'Name missing') as member_name,
    r.size,
    (select l.locker_number from public.lockers l where l.id = r.locker_id) as locker_number
)
insert into locker_audit_report (sort, kind, locker_number, member_name, size, detail)
select 50, 'paid_date_cleared', locker_number, member_name, size,
       'Removed a paid date that was not on a payment.'
from cleared;

update public.locker_reservations r
   set paid_at = p.created_at
  from public.payments p
 where r.payment_id = p.id
   and r.paid_at is distinct from p.created_at;

-- 6) Status follows the holder and the payment. Comp stays comp.
update public.lockers l
   set status = case
     when l.status = 'comp' or upper(l.locker_number) = 'LL4' then 'comp'
     when l.member_id is null and nullif(btrim(coalesce(l.holder_name, '')), '') is null then 'available'
     when l.payment_id is not null then 'assigned'
     else 'pending_payment'
   end
 where l.status is distinct from 'comp'
   and upper(l.locker_number) is distinct from 'LL4';

update public.lockers
   set payment_unverified = false
 where payment_unverified
   and payment_id is not null;

update public.lockers
   set payment_unverified = true
 where upper(locker_number) = 'RL3'
   and coalesce(holder_name, '') ~* 'kim'
   and coalesce(holder_name, '') ~* 'kelly'
   and payment_id is null
   and status = 'pending_payment'
   and payment_unverified is distinct from true;

-- Notes are not a paid status.
update public.lockers
   set notes = nullif(btrim(regexp_replace(regexp_replace(notes, '\yUnpaid\y\.?', '', 'gi'), '\s{2,}', ' ', 'g')), '')
 where notes ~* '\yUnpaid\y';

update public.locker_reservations
   set notes = nullif(btrim(regexp_replace(regexp_replace(notes, '\yUnpaid\y\.?', '', 'gi'), '\s{2,}', ' ', 'g')), '')
 where notes ~* '\yUnpaid\y';

-- 7) A waiting row for a locker this member already holds at the same size.
with cut as (
  update public.locker_reservations r
     set status = 'cancelled',
         notes = left(btrim(coalesce(r.notes, '') || ' Closed because this member already holds that size.'), 500)
   where r.locker_id is null
     and r.status in ('queued', 'assigned')
     and coalesce(r.is_renewal, false) = false
     and r.member_id is not null
     and exists (
       select 1
       from public.lockers l
       where l.member_id = r.member_id
         and l.size = r.size
         and l.status in ('assigned', 'pending_payment', 'paid')
     )
  returning
    coalesce(public.kos_locker_person_name(r.member_id, r.requester_name), 'Name missing') as member_name,
    r.size
)
insert into locker_audit_report (sort, kind, locker_number, member_name, size, detail)
select 60, 'duplicate_waiting_removed', null, member_name, size,
       'Removed a waiting row because this member already has that size.'
from cut;

-- 8) One active locker per member. Keep the paid one, else the lowest number.
with ranked as (
  select
    l.id,
    l.locker_number,
    l.size,
    coalesce(public.kos_locker_person_name(l.member_id, l.holder_name), l.holder_name, 'Name missing') as member_name,
    row_number() over (
      partition by l.member_id
      order by (l.payment_id is not null) desc, (l.status = 'assigned') desc, l.locker_number, l.id
    ) as n
  from public.lockers l
  where l.member_id is not null
    and l.status in ('assigned', 'pending_payment', 'comp', 'paid')
),
cut as (
  update public.lockers l
     set status = 'available'
  from ranked
  where l.id = ranked.id
    and ranked.n > 1
  returning ranked.locker_number, ranked.member_name, ranked.size
)
insert into locker_audit_report (sort, kind, locker_number, member_name, size, detail)
select 70, 'extra_locker_cleared', locker_number, member_name, size,
       'Cleared this locker so the member keeps a single assignment.'
from cut;

-- 9) Still needs an officer.
insert into locker_audit_report (sort, kind, locker_number, member_name, size, detail)
select 80, 'unverified', l.locker_number,
       coalesce(public.kos_locker_person_name(l.member_id, l.holder_name), 'Name missing'),
       l.size,
       'Says paid. No locker payment is linked.'
from public.lockers l
where l.payment_unverified
   or (
     upper(l.locker_number) = 'RL3'
     and coalesce(l.holder_name, '') ~* 'kim'
     and coalesce(l.holder_name, '') ~* 'kelly'
     and l.payment_id is null
     and l.status = 'pending_payment'
   );

insert into locker_audit_report (sort, kind, locker_number, member_name, size, detail)
select 90, 'paid_unassigned', null,
       coalesce(public.kos_locker_person_name(r.member_id, r.requester_name), 'Name missing'),
       r.size,
       'Paid and still waiting for a locker.'
from public.locker_reservations r
join public.payments p on p.id = r.payment_id
where r.locker_id is null
  and r.status in ('queued', 'assigned')
  and coalesce(r.is_renewal, false) = false
  and lower(p.status) in ('succeeded', 'paid', 'complete', 'completed');

insert into locker_audit_report (sort, kind, locker_number, member_name, size, detail)
select 100, 'assigned_unpaid', l.locker_number,
       coalesce(public.kos_locker_person_name(l.member_id, l.holder_name), 'Name missing'),
       l.size,
       'Assigned, and no payment is linked.'
from public.lockers l
where l.status = 'pending_payment'
  and not coalesce(l.payment_unverified, false)
  and not (
    upper(l.locker_number) = 'RL3'
    and coalesce(l.holder_name, '') ~* 'kim'
    and coalesce(l.holder_name, '') ~* 'kelly'
  );

insert into locker_audit_report (sort, kind, locker_number, member_name, size, detail)
select distinct 110, 'size_mismatch', l.locker_number,
       coalesce(public.kos_locker_person_name(l.member_id, l.holder_name), 'Name missing'),
       l.size,
       'Holds this locker, and a request for a ' || r.size || ' locker is still open.'
from public.lockers l
join public.locker_reservations r
  on r.status <> 'cancelled'
 and coalesce(r.is_renewal, false) = false
 and r.size is distinct from l.size
 and (
   r.locker_id = l.id
   or (r.locker_id is null and l.member_id is not null and r.member_id = l.member_id)
 )
where l.status in ('assigned', 'pending_payment', 'paid');

insert into locker_audit_report (sort, kind, locker_number, member_name, size, detail)
select 120, 'payment_not_linked', null,
       coalesce(nullif(btrim(p.payer_name), ''), 'Name missing'),
       public.kos_locker_payment_size_safe(p.description, p.amount_cents, p.raw),
       'Locker payment is not linked to a reservation yet.'
from public.payments p
where public.kos_locker_payment_size_safe(p.description, p.amount_cents, p.raw) is not null
  and lower(p.status) in ('succeeded', 'paid', 'complete', 'completed')
  and not exists (select 1 from public.lockers l where l.payment_id = p.id)
  and not exists (
    select 1 from public.locker_reservations r
    where r.payment_id = p.id and r.status <> 'cancelled'
  );

-- Keep the one-member rule once the rows allow it.
do $$
begin
  if exists (
    select 1
    from public.lockers
    where member_id is not null
      and status in ('assigned', 'pending_payment', 'comp')
    group by member_id
    having count(*) > 1
  ) then
    raise notice 'Locker audit: one member still holds two lockers. The exception list shows extra_locker_cleared only for rows this run could clear.';
  elsif to_regclass('public.lockers_one_active_member') is null then
    create unique index lockers_one_active_member
      on public.lockers (member_id)
      where member_id is not null
        and status in ('assigned', 'pending_payment', 'comp');
  end if;
end $$;

do $$
declare
  v_bad int;
begin
  select count(*) into v_bad
  from public.lockers
  where status not in ('available', 'assigned', 'comp', 'pending_payment')
     or (status = 'available' and (
       member_id is not null
       or nullif(btrim(coalesce(holder_name, '')), '') is not null
       or payment_id is not null
     ))
     or (status = 'comp' and (
       payment_id is not null
       or nullif(btrim(coalesce(holder_name, '')), '') is null
     ))
     or (status = 'assigned' and (
       payment_id is null
       or (member_id is null and nullif(btrim(coalesce(holder_name, '')), '') is null)
     ))
     or (status = 'pending_payment' and (
       payment_id is not null
       or (member_id is null and nullif(btrim(coalesce(holder_name, '')), '') is null)
     ));
  if v_bad > 0 then
    raise notice 'Locker audit: % locker rows still fall outside the assignment check.', v_bad;
    return;
  end if;
  alter table public.lockers drop constraint if exists lockers_status_check;
  alter table public.lockers drop constraint if exists lockers_assignment_consistent;
  alter table public.lockers
    add constraint lockers_status_check
    check (status in ('available', 'assigned', 'comp', 'pending_payment'));
  alter table public.lockers
    add constraint lockers_assignment_consistent
    check (
      (status = 'available' and member_id is null and nullif(btrim(coalesce(holder_name, '')), '') is null and payment_id is null)
      or (status = 'comp' and payment_id is null and nullif(btrim(coalesce(holder_name, '')), '') is not null)
      or (status = 'assigned' and payment_id is not null and (member_id is not null or nullif(btrim(coalesce(holder_name, '')), '') is not null))
      or (status = 'pending_payment' and payment_id is null and (member_id is not null or nullif(btrim(coalesce(holder_name, '')), '') is not null))
    );
exception when others then
  raise notice 'Locker audit: assignment check was not added: %', sqlerrm;
end $$;

select kind, locker_number, member_name, size, detail
from locker_audit_report
order by sort, locker_number nulls last, member_name, kind;
