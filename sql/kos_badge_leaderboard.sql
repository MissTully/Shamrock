-- Craic Cup: Badges leaderboard.
-- Members can only read their own member_badges rows, so this exposes a
-- read-only, names-and-badges-only list for signed-in members.
-- Idempotent: safe to run more than once.

create schema if not exists kos_internal;

create or replace view public.v_badge_leaderboard as
select null::integer as place, null::uuid as member_id, null::text as first_name,
       null::text as last_name, null::integer as badge_count, null::text[] as badge_ids,
       null::timestamptz as last_earned_at
where false;

create or replace function kos_internal.badge_leaderboard_rows()
returns setof public.v_badge_leaderboard
language sql stable security definer
set search_path to 'public'
as $fn$
  with b as (
    select mb.member_id,
           count(*)::integer as badge_count,
           array_agg(mb.badge_id::text order by coalesce(d.sort, 999), mb.badge_id::text) as badge_ids,
           max(mb.earned_at) as last_earned_at
    from member_badges mb
    left join badge_defs d on d.id::text = mb.badge_id::text
    group by mb.member_id
  )
  select row_number() over (order by b.badge_count desc, b.last_earned_at asc nulls last, m.last_name, m.first_name)::integer,
         m.id, m.first_name, m.last_name, b.badge_count, b.badge_ids, b.last_earned_at
  from b
  join members m on m.id = b.member_id
  where m.merged_into is null
    and m.membership_status is distinct from 'prospect'
  order by 1
$fn$;

create or replace view public.v_badge_leaderboard as
  select * from kos_internal.badge_leaderboard_rows();

revoke all on function kos_internal.badge_leaderboard_rows() from public, anon;
grant execute on function kos_internal.badge_leaderboard_rows() to authenticated;
grant usage on schema kos_internal to authenticated;
revoke all on public.v_badge_leaderboard from anon;
grant select on public.v_badge_leaderboard to authenticated;
