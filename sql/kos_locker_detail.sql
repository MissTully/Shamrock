-- Krewe of Shamrock: locker detail window.
-- Project: oazwkwflgbthojvnclfc. Safe to re-run. Run after sql/kos_locker_desk.sql.
--
-- Adds two officer RPCs used by the locker window in assets/kos-lockers.js:
--   officer_locker_detail(p_locker_number)        one locker, its notes and history
--   officer_locker_update_details(...)            correct the holder, email, or notes
-- and lets locker_assignment_history record an 'edit'.
--
-- Same gate as the other locker tools: public.kos_can_manage_lockers().
-- Payments are still recorded with officer_locker_record_payment (cash, check)
-- or officer_locker_link_payment (Zeffy). A correction never stamps a paid date.

alter table public.locker_assignment_history
  drop constraint if exists locker_assignment_history_action_check;
alter table public.locker_assignment_history
  add constraint locker_assignment_history_action_check
  check (action in ('assign', 'move', 'free', 'comp', 'link_payment', 'record_payment', 'edit'));

-- ---------------------------------------------------------------------------
-- One locker: board facts, raw holder fields, and history
-- ---------------------------------------------------------------------------
create or replace function public.officer_locker_detail(p_locker_number text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $fn$
declare
  v_num text := upper(btrim(coalesce(p_locker_number, '')));
  v_lock public.lockers%rowtype;
  v_board jsonb;
  v_row jsonb;
  v_history jsonb;
begin
  if not public.kos_can_manage_lockers() then
    return jsonb_build_object('ok', false, 'message', 'Officers only.');
  end if;
  if v_num = '' then
    return jsonb_build_object('ok', false, 'message', 'Choose a locker.');
  end if;
  select * into v_lock from public.lockers where upper(locker_number) = v_num;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'No locker with that number.');
  end if;

  v_board := public.officer_locker_board();
  select e into v_row
  from jsonb_array_elements(coalesce(v_board->'lockers', '[]'::jsonb)) e
  where upper(e->>'locker_number') = v_num
  limit 1;

  select coalesce(jsonb_agg(to_jsonb(h) order by h.created_at desc, h.id desc), '[]'::jsonb)
    into v_history
  from (
    select
      hist.id,
      hist.created_at,
      hist.action,
      coalesce(public.kos_locker_person_name(hist.member_id, hist.holder_name), hist.holder_name) as holder_name,
      hist.from_locker_number,
      hist.to_locker_number,
      hist.note,
      pay.amount_cents,
      pay.created_at as paid_at,
      case
        when pay.id is null then ''
        when pay.provider = 'off_zeffy' then 'Off Zeffy'
        else 'Zeffy'
      end as source,
      public.kos_locker_person_name(hist.performed_by, null) as performed_by_name
    from public.locker_assignment_history hist
    left join public.payments pay on pay.id = hist.payment_id
    where hist.locker_id = v_lock.id
       or upper(coalesce(hist.from_locker_number, '')) = v_num
       or upper(coalesce(hist.to_locker_number, '')) = v_num
    order by hist.created_at desc, hist.id desc
    limit 50
  ) h;

  return jsonb_build_object(
    'ok', true,
    'locker', coalesce(v_row, '{}'::jsonb) || jsonb_build_object(
      'id', v_lock.id,
      'locker_number', v_lock.locker_number,
      'size', v_lock.size,
      'member_id', v_lock.member_id,
      'member_name', public.kos_locker_person_name(v_lock.member_id, null),
      'raw_holder_name', v_lock.holder_name,
      'holder_email', v_lock.holder_email,
      'notes', v_lock.notes
    ),
    'history', v_history
  );
end;
$fn$;

-- ---------------------------------------------------------------------------
-- Correct the holder, email, or notes on a locker that is in use
-- ---------------------------------------------------------------------------
-- p_member_id set: link that roster member. The name comes from the roster.
-- p_member_id null and p_holder_name set: an unlinked holder by name.
-- Notes can be saved on any locker, including an open one.
-- The payment stays on the locker. Use Move to put a person in another locker.
create or replace function public.officer_locker_update_details(
  p_locker_number text,
  p_member_id uuid default null,
  p_holder_name text default null,
  p_holder_email text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_num text := upper(btrim(coalesce(p_locker_number, '')));
  v_lock public.lockers%rowtype;
  v_old_name text;
  v_new_name text;
  v_email text := nullif(btrim(coalesce(p_holder_email, '')), '');
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_other text;
  v_changes text[] := '{}';
begin
  if not public.kos_can_manage_lockers() then
    return jsonb_build_object('ok', false, 'message', 'Officers only.');
  end if;
  perform set_config('kos.locker_officer', '1', true);
  if v_num = '' then
    return jsonb_build_object('ok', false, 'message', 'Choose a locker.');
  end if;
  select * into v_lock from public.lockers where upper(locker_number) = v_num for update;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'No locker with that number.');
  end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('ok', false, 'message', 'That email address does not look right.');
  end if;
  if v_notes is not null and length(v_notes) > 1000 then
    return jsonb_build_object('ok', false, 'message', 'Keep notes under 1000 characters.');
  end if;

  v_old_name := public.kos_locker_person_name(v_lock.member_id, v_lock.holder_name);

  -- An open locker only takes notes. Assign it to give it a holder.
  if v_lock.status = 'available' then
    if p_member_id is not null or nullif(btrim(coalesce(p_holder_name, '')), '') is not null then
      return jsonb_build_object('ok', false, 'message', v_num || ' is open. Use Assign to give it a holder.');
    end if;
    if v_notes is distinct from nullif(btrim(coalesce(v_lock.notes, '')), '') then
      update public.lockers set notes = v_notes where id = v_lock.id;
      perform public.kos_locker_history(v_lock.id, null, null, 'edit', null, v_num, null, 'Notes updated');
      return jsonb_build_object('ok', true, 'locker_number', v_num, 'message', 'Notes saved for ' || v_num || '.');
    end if;
    return jsonb_build_object('ok', true, 'locker_number', v_num, 'message', 'Nothing changed.');
  end if;

  if p_member_id is not null then
    if not exists (select 1 from public.members m where m.id = p_member_id) then
      return jsonb_build_object('ok', false, 'message', 'That member is not on the roster.');
    end if;
    select l.locker_number into v_other
    from public.lockers l
    where l.member_id = p_member_id
      and l.id <> v_lock.id
      and l.status in ('assigned', 'pending_payment', 'comp')
    limit 1;
    if v_other is not null then
      return jsonb_build_object(
        'ok', false,
        'message', 'That member already has locker ' || v_other || '. Open ' || v_other || ' and move or free it first.'
      );
    end if;
    v_new_name := public.kos_locker_person_name(p_member_id, p_holder_name);
  else
    v_new_name := public.kos_locker_person_name(null, p_holder_name);
  end if;

  if v_new_name is null then
    return jsonb_build_object('ok', false, 'message', 'Enter the holder name or pick a roster member.');
  end if;

  if v_lock.member_id is distinct from p_member_id then
    v_changes := v_changes || (
      case
        when p_member_id is null then 'Unlinked from the roster'
        else 'Linked to roster member ' || v_new_name
      end
    );
  end if;
  if v_old_name is distinct from v_new_name then
    v_changes := v_changes || ('Holder ' || coalesce(v_old_name, 'blank') || ' to ' || v_new_name);
  end if;
  if v_email is distinct from nullif(btrim(coalesce(v_lock.holder_email, '')), '') then
    v_changes := v_changes || 'Email updated'::text;
  end if;
  if v_notes is distinct from nullif(btrim(coalesce(v_lock.notes, '')), '') then
    v_changes := v_changes || 'Notes updated'::text;
  end if;

  if coalesce(array_length(v_changes, 1), 0) = 0 then
    return jsonb_build_object('ok', true, 'locker_number', v_num, 'message', 'Nothing changed.');
  end if;

  update public.lockers
     set member_id = p_member_id,
         holder_name = v_new_name,
         holder_email = v_email,
         notes = v_notes,
         assigned_at = coalesce(v_lock.assigned_at, now())
   where id = v_lock.id;

  perform public.kos_locker_history(
    v_lock.id, p_member_id, v_new_name, 'edit', null, v_num, null,
    array_to_string(v_changes, '. ')
  );

  return jsonb_build_object(
    'ok', true,
    'locker_number', v_num,
    'message', 'Saved ' || v_num || '. ' || array_to_string(v_changes, '. ') || '.'
  );
end;
$fn$;

revoke all on function public.officer_locker_detail(text) from public, anon;
revoke all on function public.officer_locker_update_details(text, uuid, text, text, text) from public, anon;
grant execute on function public.officer_locker_detail(text) to authenticated;
grant execute on function public.officer_locker_update_details(text, uuid, text, text, text) to authenticated;
