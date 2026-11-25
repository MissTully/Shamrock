-- Krewe of Shamrock: retire the old locker board.
-- NOT APPLIED. Run this last, after sql/kos_locker_desk.sql and
-- sql/kos_locker_desk_audit.sql, and only after the Officer Desk lockers
-- tool loads from officer_locker_board().
--
-- This drops public.locker_units and the old RPCs officer_save_locker and
-- my_locker_board when nothing else still uses them.
-- It does not drop public.lockers or public.locker_reservations.

do $$
declare
  r record;
  v_deps text;
begin
  for r in
    select p.oid, p.oid::regprocedure as sig, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('officer_save_locker', 'my_locker_board')
  loop
    select string_agg(distinct other_name, ', ')
      into v_deps
    from (
      select pn.nspname || '.' || pp.proname as other_name
      from pg_depend d
      join pg_proc pp on pp.oid = d.objid
      join pg_namespace pn on pn.oid = pp.pronamespace
      where d.refobjid = r.oid
        and d.classid = 'pg_proc'::regclass
        and d.deptype = 'n'
        and pp.oid <> r.oid
        and pp.proname not in ('officer_save_locker', 'my_locker_board')
    ) dep;

    if v_deps is not null then
      raise notice 'Left % in place. Still used by %.', r.sig, v_deps;
    else
      execute 'drop function ' || r.sig::text;
      raise notice 'Dropped %.', r.sig;
    end if;
  end loop;

  if to_regclass('public.locker_units') is null then
    raise notice 'public.locker_units is already gone.';
    return;
  end if;

  select string_agg(distinct dep.who, ', ')
    into v_deps
  from (
    select pn.nspname || '.' || pp.proname as who
    from pg_depend d
    join pg_proc pp on pp.oid = d.objid
    join pg_namespace pn on pn.oid = pp.pronamespace
    where d.refobjid = 'public.locker_units'::regclass
      and d.classid = 'pg_proc'::regclass
      and d.deptype = 'n'
      and pp.proname not in ('officer_save_locker', 'my_locker_board')
    union
    select nv.nspname || '.' || c.relname
    from pg_depend d
    join pg_rewrite w on w.oid = d.objid
    join pg_class c on c.oid = w.ev_class
    join pg_namespace nv on nv.oid = c.relnamespace
    where d.refobjid = 'public.locker_units'::regclass
      and d.classid = 'pg_rewrite'::regclass
      and c.relname <> 'locker_units'
  ) dep;

  if v_deps is not null then
    raise notice 'Left public.locker_units in place. Still used by %.', v_deps;
  else
    drop table public.locker_units;
    raise notice 'Dropped public.locker_units.';
  end if;
end $$;
