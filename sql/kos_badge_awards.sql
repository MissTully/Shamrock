-- Craic Cup badge awards
-- Awards first_rsvp, first_attend, first_volunteer and parade_ready automatically.
-- host stays manual: officers grant it with officer_grant_badge().
-- Idempotent: safe to run more than once. member_badges(member_id, badge_id) is unique.

-- 1. Core helper: award a badge once
create or replace function public.kos_award_badge(p_member uuid, p_badge text, p_at timestamptz default now())
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_rows int;
begin
  if p_member is null or p_badge is null then return false; end if;
  insert into public.member_badges (member_id, badge_id, earned_at)
  values (p_member, p_badge, coalesce(p_at, now()))
  on conflict (member_id, badge_id) do nothing;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;
revoke all on function public.kos_award_badge(uuid, text, timestamptz) from public, anon, authenticated;

-- 2. Parade Ready check, same gates as the Hub chip:
--    dues paid this year (officers and board are exempt), waiver signed this year,
--    and a mandatory meeting attended this year.
create or replace function public.kos_member_parade_ready(p_member uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    (
      exists (select 1 from public.dues_payments d
              where d.member_id = m.id and d.paid
                and d.membership_year = extract(year from current_date)::int)
      or coalesce(m.member_role, '') in ('officer', 'captain', 'board')
      or exists (select 1 from public.profiles p
                 join public.member_roles r on r.user_id = p.id
                 where p.member_id = m.id
                   and r.role in ('officer', 'captain', 'board', 'treasurer', 'secretary'))
    )
    and exists (select 1 from public.waivers w
                where w.member_id = m.id
                  and w.season_year = extract(year from current_date)::int)
    and exists (select 1 from public.event_signups s
                join public.events e on e.id = s.event_id
                where s.member_id = m.id and s.status = 'attended'
                  and e.event_type = 'meeting' and e.is_mandatory
                  and e.start_time >= date_trunc('year', now()))
  from public.members m
  where m.id = p_member
    and m.merged_into is null
    and coalesce(m.membership_status, '') not in ('merged', 'declined', 'archived');
$$;
revoke all on function public.kos_member_parade_ready(uuid) from public, anon, authenticated;

create or replace function public.kos_recompute_parade_ready_badge(p_member uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if coalesce(public.kos_member_parade_ready(p_member), false) then
    return public.kos_award_badge(p_member, 'parade_ready');
  end if;
  return false;
end;
$$;
revoke all on function public.kos_recompute_parade_ready_badge(uuid) from public, anon, authenticated;

-- 3. Trigger: event_signups (first RSVP, first attendance, Parade Ready via meeting)
create or replace function public.kos_badges_from_signup()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.member_id is null then return new; end if;
  if coalesce(new.status, '') not in ('cancelled', 'canceled', 'declined', 'waitlist', 'waitlisted') then
    perform public.kos_award_badge(new.member_id, 'first_rsvp', new.created_at);
  end if;
  if new.status = 'attended' then
    perform public.kos_award_badge(new.member_id, 'first_attend');
    perform public.kos_recompute_parade_ready_badge(new.member_id);
  end if;
  return new;
end;
$$;
drop trigger if exists kos_badges_from_signup on public.event_signups;
create trigger kos_badges_from_signup
  after insert or update of status on public.event_signups
  for each row execute function public.kos_badges_from_signup();

-- 4. Trigger: door_checkins (a door check-in counts as attending)
create or replace function public.kos_badges_from_checkin()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.member_id is not null then
    perform public.kos_award_badge(new.member_id, 'first_attend', new.checked_at);
  end if;
  return new;
end;
$$;
drop trigger if exists kos_badges_from_checkin on public.door_checkins;
create trigger kos_badges_from_checkin
  after insert on public.door_checkins
  for each row execute function public.kos_badges_from_checkin();

-- 5. Trigger: volunteer_hours (first approved worked entry; in-kind never counts)
create or replace function public.kos_badges_from_volunteer_hours()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.member_id is not null
     and new.status = 'approved'
     and coalesce(new.source, '') <> 'in_kind'
     and coalesce(new.is_demo, false) = false then
    perform public.kos_award_badge(new.member_id, 'first_volunteer', coalesce(new.reviewed_at, now()));
  end if;
  return new;
end;
$$;
drop trigger if exists kos_badges_from_volunteer_hours on public.volunteer_hours;
create trigger kos_badges_from_volunteer_hours
  after insert or update of status, source on public.volunteer_hours
  for each row execute function public.kos_badges_from_volunteer_hours();

-- 6. Triggers: dues_payments and waivers (Parade Ready)
create or replace function public.kos_badges_parade_ready_trg()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.member_id is not null then
    perform public.kos_recompute_parade_ready_badge(new.member_id);
  end if;
  return new;
end;
$$;
drop trigger if exists kos_badges_parade_ready on public.dues_payments;
create trigger kos_badges_parade_ready
  after insert or update on public.dues_payments
  for each row execute function public.kos_badges_parade_ready_trg();
drop trigger if exists kos_badges_parade_ready on public.waivers;
create trigger kos_badges_parade_ready
  after insert or update on public.waivers
  for each row execute function public.kos_badges_parade_ready_trg();

-- 7. Officer grant for host (or any badge), officers only
create or replace function public.officer_grant_badge(p_member uuid, p_badge text default 'host')
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_krewe_officer() then
    return jsonb_build_object('ok', false, 'message', 'Officers only');
  end if;
  if not exists (select 1 from public.badge_defs where id = p_badge) then
    return jsonb_build_object('ok', false, 'message', 'Unknown badge');
  end if;
  if not exists (select 1 from public.members where id = p_member and merged_into is null) then
    return jsonb_build_object('ok', false, 'message', 'Unknown member');
  end if;
  return jsonb_build_object('ok', true, 'new', public.kos_award_badge(p_member, p_badge));
end;
$$;
revoke all on function public.officer_grant_badge(uuid, text) from public, anon;
grant execute on function public.officer_grant_badge(uuid, text) to authenticated;

-- 8. Backfill (earned_at uses the earliest qualifying moment where known)
insert into public.member_badges (member_id, badge_id, earned_at)
select s.member_id, 'first_rsvp', min(s.created_at)
from public.event_signups s
where s.member_id is not null
  and coalesce(s.status, '') not in ('cancelled', 'canceled', 'declined', 'waitlist', 'waitlisted')
group by s.member_id
on conflict (member_id, badge_id) do nothing;

insert into public.member_badges (member_id, badge_id, earned_at)
select member_id, 'first_attend', min(at) from (
  select member_id, checked_at as at from public.door_checkins where member_id is not null
  union all
  select member_id, created_at from public.event_signups where member_id is not null and status = 'attended'
) a
group by member_id
on conflict (member_id, badge_id) do nothing;

insert into public.member_badges (member_id, badge_id, earned_at)
select v.member_id, 'first_volunteer', min(coalesce(v.reviewed_at, v.created_at))
from public.volunteer_hours v
where v.member_id is not null and v.status = 'approved'
  and coalesce(v.source, '') <> 'in_kind' and coalesce(v.is_demo, false) = false
group by v.member_id
on conflict (member_id, badge_id) do nothing;

insert into public.member_badges (member_id, badge_id, earned_at)
select m.id, 'parade_ready', now()
from public.members m
where coalesce(public.kos_member_parade_ready(m.id), false)
on conflict (member_id, badge_id) do nothing;

-- 9. Backfill: ticket buyers count as Showed Up (first_attend)
--    Events: Mini Golf and Lunch (d0ed40e0-f242-4532-88e1-89ff5bf1d3ea, 2026-09-19)
--            Tartan Ball (c64d25bb-90cb-4350-a141-b4f8ade1e9d1, 2026-10-24)
--    No picnic event exists in the database, so none is included.
--    Matching: member_id when present, else member email, else an exact
--    first + last name that matches exactly one member. Unmatched buyers are skipped.
with mem as (
  select id, lower(trim(email)) em, lower(trim(first_name)) fn, lower(trim(last_name)) ln
  from public.members where merged_into is null and coalesce(membership_status,'') not in ('merged','declined','archived')
),
raw as (
  select 'payments' src, p.member_id mid, lower(trim(p.payer_email)) em, null::text fn, null::text ln, coalesce(p.created_at, now()) at
  from public.payments p
  where p.event_id in ('d0ed40e0-f242-4532-88e1-89ff5bf1d3ea','c64d25bb-90cb-4350-a141-b4f8ade1e9d1')
    and coalesce(p.status,'') ~* '^(paid|succeeded|completed|success|approved)$'
  union all
  select 'signup_paid', s.member_id, null, null, null, s.created_at
  from public.event_signups s
  where s.event_id in ('d0ed40e0-f242-4532-88e1-89ff5bf1d3ea','c64d25bb-90cb-4350-a141-b4f8ade1e9d1')
    and s.payment_status in ('paid','already_purchased')
  union all
  select 'legacy_minigolf', null, lower(trim(l.email)), lower(trim(l.first_name)), lower(trim(l.last_name)), l.paid_at
  from public.legacy_payments l
  where l.origin_details ilike 'KREWE OF SHAMROCK MINI GOLF%' and coalesce(l.refunded_cents,0) < coalesce(l.amount_cents,1)
  union all
  select 'legacy_reg_minigolf', null, lower(trim(r.email)), lower(trim(r.first_name)), lower(trim(r.last_name)), coalesce(r.registered_at, r.event_start)
  from public.legacy_event_registrations r
  where r.wa_event_id = 6797040  -- KREWE OF SHAMROCK MINI GOLF & LUNCH! (Wild Apricot, 2026-09-19)
  union all
  select 'tb_order', null, lower(trim(o.primary_email)), null, null, coalesce(o.submitted_at, o.created_at)
  from public.tartan_ball_orders o
  union all
  select 'tb_guest', null, null, lower(trim(g.first_name)), lower(trim(g.last_name)), o.submitted_at
  from public.tartan_ball_guests g join public.tartan_ball_orders o on o.id = g.order_id
),
matched as (
  select r.*, coalesce(r.mid,
    (select m.id from mem m where r.em is not null and m.em = r.em limit 1),
    (select min(m.id::text)::uuid from mem m where r.fn is not null and m.fn = r.fn and m.ln = r.ln
       having count(*) = 1)) member_id
  from raw r
)
insert into public.member_badges (member_id, badge_id, earned_at)
select member_id, 'first_attend', min(at)
from matched
where member_id is not null
group by member_id
on conflict (member_id, badge_id) do nothing;
