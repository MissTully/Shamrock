-- APPLY BY HAND in the Supabase SQL editor. Do not run this from a deploy.
-- Safe to re-run.
--
-- Approved worked volunteer hours pay a flat 30 Clovers on the Craic Cup.
-- In-kind donations pay none. The same hours row cannot pay twice.
--
-- Volunteer hours label this season 2027 (June through May, the year the
-- season ends, krewe_volunteer_season_year). The Craic Cup labels this
-- season 2026 (July through June, the year the season started,
-- craic_season_year). Ledger rows use the Cup's own function.
--
-- Top Volunteers already sums clover_ledger rows whose reason is
-- volunteer_bonus or volunteer_priority_bonus for craic_season_year().
-- These awards use volunteer_bonus and that Cup year, so the board and
-- the season standings pick them up. No view change is required.
--
-- Depends on: volunteer_hours, clover_ledger, members,
--   craic_season_year(), krewe_volunteer_season_year().

-- ---------------------------------------------------------------------------
-- 1. Link a ledger row to the hours log that earned it
-- ---------------------------------------------------------------------------
alter table public.clover_ledger
  add column if not exists source_hours_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'clover_ledger_source_hours_id_fkey'
      and conrelid = 'public.clover_ledger'::regclass
  ) then
    alter table public.clover_ledger
      add constraint clover_ledger_source_hours_id_fkey
      foreign key (source_hours_id)
      references public.volunteer_hours(id)
      on delete cascade;
  end if;
end $$;

create unique index if not exists clover_ledger_source_hours_id_uidx
  on public.clover_ledger (source_hours_id);

comment on column public.clover_ledger.source_hours_id is
  'volunteer_hours row that earned this volunteer_bonus. Unique so one log pays once. Null on every other Clover award.';

-- ---------------------------------------------------------------------------
-- 2. In-kind vs worked hours
--    volunteer_hours.source already stores in_kind (the Member Desk form
--    sends p_kind = in_kind, and log_my_volunteer_hours writes source).
--    No new is_in_kind column. Description match catches a donation that
--    was saved without that source, then the backfill below tags it.
-- ---------------------------------------------------------------------------
create or replace function public.volunteer_hours_is_in_kind(
  p_source text,
  p_activity text,
  p_notes text
)
returns boolean
language sql
immutable
set search_path to 'public'
as $fn$
  select coalesce(p_source, '') = 'in_kind'
    or coalesce(p_activity, '') || ' ' || coalesce(p_notes, '') ~* (
         'in[- ]kind'
      || '|\$12\s*(=|counts as)\s*1\s*hour'
      || '|donat(e|ed|ion)'
      || '|gift cards?'
      || '|bourbon'
      || '|cigars?'
      || '|\yliquor\y'
      || '|\ybooze\y'
      || '|\yvodka\y'
      || '|\ywhiskey\y'
      || '|\ywhisky\y'
      || '|\ygin\y'
      || '|\ywine\y'
      || '|\yalcohol\y'
    );
$fn$;

comment on function public.volunteer_hours_is_in_kind(text, text, text) is
  'True for an in-kind donation: source in_kind, or a description of donated goods ($12 = 1 hour, bourbon, cigars, gift cards, liquor, booze, wine, and the like).';

revoke all on function public.volunteer_hours_is_in_kind(text, text, text) from public;
grant execute on function public.volunteer_hours_is_in_kind(text, text, text) to authenticated;

-- Noon in New York keeps a July 1 date inside the Cup season that date belongs to.
create or replace function public.volunteer_hours_craic_season(p_worked_on date)
returns integer
language sql
stable
set search_path to 'public'
as $fn$
  select public.craic_season_year(
    (
      (coalesce(p_worked_on, (timezone('America/New_York', now()))::date) + time '12:00')
      at time zone 'America/New_York'
    )
  );
$fn$;

comment on function public.volunteer_hours_craic_season(date) is
  'Craic Cup season for a volunteer hours date. Uses craic_season_year, not the June-May hours label.';

revoke all on function public.volunteer_hours_craic_season(date) from public;
grant execute on function public.volunteer_hours_craic_season(date) to authenticated;

-- Tag existing donation logs that were saved without source = in_kind.
update public.volunteer_hours v
   set source = 'in_kind'
 where v.source is distinct from 'in_kind'
   and coalesce(v.source, 'manual') = 'manual'
   and public.volunteer_hours_is_in_kind(v.source, v.activity, v.notes);

-- ---------------------------------------------------------------------------
-- 3. Award, or take the award back
-- ---------------------------------------------------------------------------
create or replace function public.kos_volunteer_hours_clover_bonus()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_award boolean;
begin
  if tg_op = 'DELETE' then
    delete from public.clover_ledger
     where source_hours_id = old.id
       and reason = 'volunteer_bonus';
    return old;
  end if;

  v_award := new.status = 'approved'
    and coalesce(new.is_demo, false) = false
    and not public.volunteer_hours_is_in_kind(new.source, new.activity, new.notes);

  if v_award then
    insert into public.clover_ledger (
      member_id, clovers, reason, season_year, notes, source_hours_id
    ) values (
      new.member_id,
      30,
      'volunteer_bonus',
      public.volunteer_hours_craic_season(new.worked_on),
      'Approved worked volunteer hours (' || new.id::text || ').',
      new.id
    )
    on conflict (source_hours_id) do nothing;
  else
    -- Pending, rejected, in-kind, or a demo row: that log does not keep Clovers.
    delete from public.clover_ledger
     where source_hours_id = new.id
       and reason = 'volunteer_bonus';
  end if;

  return new;
end;
$fn$;

revoke all on function public.kos_volunteer_hours_clover_bonus() from public;

-- If a member describes a donation but leaves the form on "Hours worked",
-- store source = in_kind so the column and the Clover rule agree.
create or replace function public.kos_volunteer_hours_tag_in_kind()
returns trigger
language plpgsql
set search_path to 'public'
as $fn$
begin
  if coalesce(new.source, 'manual') = 'manual'
     and public.volunteer_hours_is_in_kind(new.source, new.activity, new.notes) then
    new.source := 'in_kind';
  end if;
  return new;
end;
$fn$;

revoke all on function public.kos_volunteer_hours_tag_in_kind() from public;

drop trigger if exists kos_volunteer_hours_tag_in_kind on public.volunteer_hours;
create trigger kos_volunteer_hours_tag_in_kind
  before insert or update of source, activity, notes
  on public.volunteer_hours
  for each row
  execute function public.kos_volunteer_hours_tag_in_kind();

drop trigger if exists kos_volunteer_hours_clover_bonus on public.volunteer_hours;
create trigger kos_volunteer_hours_clover_bonus
  after insert
     or delete
     or update of status, approved, source, activity, notes, is_demo, worked_on
  on public.volunteer_hours
  for each row
  execute function public.kos_volunteer_hours_clover_bonus();

-- ---------------------------------------------------------------------------
-- 4. Tammy Miller, 12 Sep 2026, 8 hours, entered twice.
--    Keep the earlier row. Reject the later one (fe4713ec, created after
--    39707aee). Review note is exactly Duplicate entry.
-- ---------------------------------------------------------------------------
with pair as (
  select v.id,
         row_number() over (order by v.created_at asc, v.id asc) as rn
  from public.volunteer_hours v
  join public.members m on m.id = v.member_id
  where (v.id::text like 'fe4713ec%' or v.id::text like '39707aee%')
    and m.first_name = 'Tammy'
    and m.last_name = 'Miller'
    and v.worked_on = date '2026-09-12'
    and v.hours = 8
)
update public.volunteer_hours v
   set status = 'rejected',
       approved = false,
       review_note = 'Duplicate entry'
  from pair
 where v.id = pair.id
   and pair.rn > 1
   and (
     v.status is distinct from 'rejected'
     or v.approved is distinct from false
     or v.review_note is distinct from 'Duplicate entry'
   );

-- ---------------------------------------------------------------------------
-- 5. One-time backfill: approved worked hours in the current hours season
--    whose work date falls in the current Craic Cup season. Same rules as
--    the trigger. on conflict do nothing, so a second run adds nothing.
-- ---------------------------------------------------------------------------
insert into public.clover_ledger (
  member_id, clovers, reason, season_year, notes, source_hours_id
)
select
  v.member_id,
  30,
  'volunteer_bonus',
  public.volunteer_hours_craic_season(v.worked_on),
  'Approved worked volunteer hours (' || v.id::text || ').',
  v.id
from public.volunteer_hours v
join public.members m on m.id = v.member_id
where v.status = 'approved'
  and coalesce(v.approved, false) = true
  and coalesce(v.is_demo, false) = false
  and m.merged_into is null
  and not public.volunteer_hours_is_in_kind(v.source, v.activity, v.notes)
  and v.season_year = public.krewe_volunteer_season_year(
        (timezone('America/New_York', now()))::date
      )
  and public.volunteer_hours_craic_season(v.worked_on) = public.craic_season_year()
on conflict (source_hours_id) do nothing;
