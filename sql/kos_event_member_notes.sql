-- Members-only event notes (gate codes, lockbox, parking).
-- NOT APPLIED. Run only after Melissa approves. Safe to re-run.
--
-- Why: the Float Workday event (17199c3c-f4f4-4842-a314-0ed9f9d75543)
-- had its gate code in events.description. description is public: it is
-- in v_public_events, granted to anon, rendered on event-signup.html and
-- in its schema.org JSON-LD for search engines. This moves the gate code
-- to a new column that anon cannot select.

-- A. Column. anon only has column-level grants on events (see
--    kos_event_member_address_anon_lockdown.sql), so a new column is not
--    readable by anon. Revoke explicitly anyway.
alter table public.events add column if not exists member_notes text;
comment on column public.events.member_notes is
  'Members-only notes (gate code, lockbox, parking). Never exposed to anon or public pages. Shown in the Member Hub.';
revoke select (member_notes) on table public.events from anon;
revoke select (member_notes) on table public.events from public;
grant select (member_notes) on table public.events to authenticated;

-- B. Officers save notes through this RPC (Event Studio calls it after
--    officer_upsert_event, so that big function stays unchanged).
create or replace function public.officer_set_event_member_notes(p_event_id uuid, p_notes text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_manage_events() then
    raise exception 'Not allowed';
  end if;
  update public.events
     set member_notes = nullif(btrim(coalesce(p_notes, '')), '')
   where id = p_event_id;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'Event not found');
  end if;
  return jsonb_build_object('ok', true, 'event_id', p_event_id);
end;
$$;
revoke all on function public.officer_set_event_member_notes(uuid, text) from public, anon;
grant execute on function public.officer_set_event_member_notes(uuid, text) to authenticated;

-- C. Move the Float Workday gate code out of the public description.
--    Only runs while the description still holds the gate code text.
update public.events
   set member_notes = btrim(description),
       description  = 'Float workday. Members: sign in to the Member Hub for the address and gate code.'
 where id = '17199c3c-f4f4-4842-a314-0ed9f9d75543'
   and description ~* 'gate';

-- D. Check: should return 0 rows.
select id, name from public.events where description ~* 'gate ?code';
