-- Parade guest parties: one adult per registration, optional named children.
-- NOT APPLIED to the live database. Safe to re-run.
-- Do not change live event rows. Do not schedule the reminder cron.
--
-- Each adult registers themselves (own email, own waiver) and pays one
-- "Parade guest" ticket (standard fee, $25 in the season campaign).
-- They may add their children under 12 / immediate family, each by name,
-- at the family fee ($10), bought in the same checkout as
-- "Parade guest, immediate family or under 12" x N. No other adults.
-- Every person counts against the parade's guest spots.
-- If the parade requires 21+, children cannot be added.
-- The inviting member approves the whole registration.
-- Paid matching: token first, else one payment_sent row whose email and
-- fee total match the Zeffy payment. If more than one row matches, do
-- not pick one.

-- ---------------------------------------------------------------------------
-- A. Columns
-- ---------------------------------------------------------------------------
alter table public.parade_guest_registrations
  add column if not exists minors jsonb not null default '[]'::jsonb,
  add column if not exists adult_fee_cents integer,
  add column if not exists child_fee_cents integer;

alter table public.parade_guest_registrations
  drop constraint if exists parade_guest_registrations_minors_is_array;
alter table public.parade_guest_registrations
  add constraint parade_guest_registrations_minors_is_array
  check (jsonb_typeof(minors) = 'array');

comment on column public.parade_guest_registrations.minors is
  'Named minor children on this adult registration. Each object has first_name and last_name. Other adults are not allowed here.';
comment on column public.parade_guest_registrations.fee_cents is
  'Total due for the registration: adult fee plus child fee times the number of children.';
comment on column public.parade_guest_registrations.adult_fee_cents is
  'Per-person standard fee quoted when the adult registered (Parade guest ticket).';
comment on column public.parade_guest_registrations.child_fee_cents is
  'Per-child family fee quoted when the adult registered (Parade guest, immediate family or under 12).';

-- ---------------------------------------------------------------------------
-- B. Helpers
-- ---------------------------------------------------------------------------
create or replace function public.kos_parade_guest_party_size(p_minors jsonb)
returns integer
language sql
immutable
set search_path to 'public'
as $$
  select 1 + coalesce(
    jsonb_array_length(
      case when jsonb_typeof(coalesce(p_minors, '[]'::jsonb)) = 'array'
           then coalesce(p_minors, '[]'::jsonb)
           else '[]'::jsonb
      end
    ),
    0
  );
$$;

create or replace function public.kos_parade_guest_normalize_minors(p jsonb)
returns jsonb
language plpgsql
immutable
set search_path to 'public'
as $$
declare
  v_in jsonb := coalesce(p, '[]'::jsonb);
  v_item jsonb;
  v_first text;
  v_last text;
  v_out jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(v_in) <> 'array' then
    return jsonb_build_object('ok', false, 'message', 'Children must be a list of names.');
  end if;
  if jsonb_array_length(v_in) > 20 then
    return jsonb_build_object('ok', false, 'message', 'Please add no more than 20 children on one registration.');
  end if;
  for v_item in select value from jsonb_array_elements(v_in)
  loop
    v_first := nullif(left(btrim(coalesce(v_item->>'first_name', v_item->>'firstName', '')), 80), '');
    v_last := nullif(left(btrim(coalesce(v_item->>'last_name', v_item->>'lastName', '')), 80), '');
    if v_first is null and v_last is null then
      continue;
    end if;
    if v_first is null or v_last is null then
      return jsonb_build_object('ok', false, 'message',
        'Please enter a first and last name for each child, or remove a blank child row.');
    end if;
    v_out := v_out || jsonb_build_array(jsonb_build_object('first_name', v_first, 'last_name', v_last));
  end loop;
  return jsonb_build_object('ok', true, 'minors', v_out);
end;
$$;

create or replace function public.kos_parade_guest_ticket_adult()
returns text
language sql
immutable
as $$ select 'Parade guest'; $$;

create or replace function public.kos_parade_guest_ticket_child()
returns text
language sql
immutable
as $$ select 'Parade guest, immediate family or under 12'; $$;

create or replace function public.kos_parade_guest_spots_used(p_event uuid)
returns integer
language sql
stable
set search_path to 'public'
as $$
  select coalesce(sum(public.kos_parade_guest_party_size(g.minors)), 0)::integer
  from public.parade_guest_registrations g
  where g.event_id = p_event
    and g.status in ('payment_sent', 'paid');
$$;

create or replace function public.kos_parade_guest_payment_url(p_base text, p_token uuid)
returns text
language plpgsql
immutable
set search_path to 'public'
as $$
declare
  v_base text := nullif(btrim(coalesce(p_base, '')), '');
  v_sep text;
begin
  if v_base is null or p_token is null then
    return v_base;
  end if;
  v_sep := case when position('?' in v_base) > 0 then '&' else '?' end;
  -- kos_guest is our matcher. utm_content is also set because Zeffy has
  -- been observed to round-trip UTM parameters on payment records.
  return v_base
    || v_sep
    || 'kos_guest=' || p_token::text
    || '&utm_content=kos_guest_' || p_token::text;
end;
$$;

create or replace function public.kos_parade_guest_member_row(g public.parade_guest_registrations)
returns jsonb
language plpgsql
stable
set search_path to 'public'
as $$
declare
  ev public.events;
  sp public.members;
  v_minors jsonb := coalesce(g.minors, '[]'::jsonb);
  v_size integer := public.kos_parade_guest_party_size(v_minors);
begin
  select * into ev from public.events where id = g.event_id;
  select * into sp from public.members where id = g.sponsor_member_id;
  return jsonb_build_object(
    'id', g.id,
    'event_id', g.event_id,
    'parade_name', ev.name,
    'start_time', ev.start_time,
    'end_time', ev.end_time,
    'first_name', g.first_name,
    'last_name', g.last_name,
    'email', g.email,
    'phone', g.phone,
    'sponsor_member_id', g.sponsor_member_id,
    'sponsor_name', trim(both from coalesce(sp.first_name, '') || ' ' || coalesce(sp.last_name, '')),
    'sponsor_email', coalesce(sp.email, g.sponsor_email),
    'relationship', g.relationship,
    'fee_tier', g.fee_tier,
    'fee_cents', g.fee_cents,
    'fee_label', public.kos_parade_guest_fee_label(g.fee_cents),
    'adult_fee_cents', g.adult_fee_cents,
    'adult_fee_label', public.kos_parade_guest_fee_label(g.adult_fee_cents),
    'child_fee_cents', g.child_fee_cents,
    'child_fee_label', public.kos_parade_guest_fee_label(g.child_fee_cents),
    'minors', v_minors,
    'child_count', v_size - 1,
    'party_size', v_size,
    'status', g.status,
    'paid', g.status = 'paid',
    'paid_at', g.paid_at,
    'approved_at', g.approved_at,
    'created_at', g.created_at,
    'waiver_name', g.waiver_name,
    'waiver_accepted_at', g.waiver_accepted_at,
    'reminder_sent_at', g.reminder_sent_at,
    'last_payment_email_at', g.last_payment_email_at,
    'decision_note', g.decision_note
  );
end;
$$;

revoke all on function public.kos_parade_guest_party_size(jsonb) from public, anon, authenticated;
grant execute on function public.kos_parade_guest_party_size(jsonb) to authenticated;
revoke all on function public.kos_parade_guest_normalize_minors(jsonb) from public, anon, authenticated;
revoke all on function public.kos_parade_guest_ticket_adult() from public, anon, authenticated;
revoke all on function public.kos_parade_guest_ticket_child() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- C. Register (party size, 21+ blocks children, quoted fees)
-- ---------------------------------------------------------------------------
create or replace function public.register_parade_guest(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_event public.events%rowtype;
  v_sponsor public.members;
  v_id uuid;
  v_email text;
  v_sponsor_email text;
  v_first text;
  v_last text;
  v_phone text;
  v_waiver text;
  v_minors_res jsonb;
  v_minors jsonb := '[]'::jsonb;
  v_child_count integer := 0;
  v_size integer := 1;
  v_tier text;
  v_fee integer;
  v_adult_fee integer;
  v_child_fee integer;
  v_age21 boolean;
  v_used integer;
  v_left integer;
  v_msg text;
begin
  begin
    v_id := nullif(p->>'event_id', '')::uuid;
  exception when others then
    return jsonb_build_object('ok', false, 'message', 'Please choose a parade.');
  end;
  if v_id is null then
    return jsonb_build_object('ok', false, 'message', 'Please choose a parade.');
  end if;

  v_first := nullif(left(btrim(coalesce(p->>'first_name', '')), 80), '');
  v_last := nullif(left(btrim(coalesce(p->>'last_name', '')), 80), '');
  v_email := lower(btrim(coalesce(p->>'email', '')));
  v_phone := nullif(left(btrim(coalesce(p->>'phone', '')), 40), '');
  v_waiver := nullif(left(btrim(coalesce(p->>'waiver_name', '')), 120), '');
  v_sponsor_email := lower(btrim(coalesce(p->>'sponsor_email', '')));
  v_age21 := coalesce((p->>'age_attested_21')::boolean, false);
  v_minors_res := public.kos_parade_guest_normalize_minors(coalesce(p->'minors', '[]'::jsonb));
  if coalesce(v_minors_res->>'ok', '') <> 'true' then
    return jsonb_build_object('ok', false, 'message', coalesce(v_minors_res->>'message', 'Please check the children listed on this form.'));
  end if;
  v_minors := coalesce(v_minors_res->'minors', '[]'::jsonb);
  v_child_count := coalesce(jsonb_array_length(v_minors), 0);
  v_size := 1 + v_child_count;

  if v_first is null or v_last is null then
    return jsonb_build_object('ok', false, 'message', 'Please enter your first and last name.');
  end if;
  if v_email = '' or position('@' in v_email) = 0 then
    return jsonb_build_object('ok', false, 'message', 'Please enter a valid email address.');
  end if;
  if v_sponsor_email = '' or position('@' in v_sponsor_email) = 0 then
    return jsonb_build_object('ok', false, 'message', 'Please enter the inviting member''s email.');
  end if;
  if v_email = v_sponsor_email then
    return jsonb_build_object('ok', false, 'message',
      'A member cannot register as their own guest. Use the inviting member''s email, not yours.');
  end if;
  if v_waiver is null then
    return jsonb_build_object('ok', false, 'message', 'Please type your name to sign the liability waiver.');
  end if;
  if coalesce((p->>'waiver_accepted')::boolean, false) is not true then
    return jsonb_build_object('ok', false, 'message', 'Please accept the liability waiver to continue.');
  end if;

  select * into v_event from public.events e where e.id = v_id;
  if not found
     or lower(coalesce(v_event.event_type, '')) <> 'parade'
     or coalesce(v_event.source, 'krewe') <> 'krewe'
     or lower(coalesce(v_event.status, '')) <> 'published'
     or coalesce(v_event.guest_capacity, 0) <= 0 then
    return jsonb_build_object('ok', false, 'message', 'That parade is not open for guest registration.');
  end if;

  if coalesce(v_event.guest_requires_21, true) and not v_age21 then
    return jsonb_build_object('ok', false, 'message',
      'Guests for this parade must confirm they are 21 or older.');
  end if;
  if coalesce(v_event.guest_requires_21, true) and v_child_count > 0 then
    return jsonb_build_object('ok', false, 'message',
      'This parade requires guests to be 21 or older. Children cannot be added.');
  end if;
  if v_event.guest_fee_cents is null then
    return jsonb_build_object('ok', false, 'message',
      'This parade does not have a guest fee posted yet.');
  end if;
  if v_child_count > 0 and v_event.guest_fee_family_cents is null then
    return jsonb_build_object('ok', false, 'message',
      'This parade does not have a family / under 12 fee posted, so children cannot be added.');
  end if;

  v_sponsor := public.kos_find_active_sponsor(v_sponsor_email);
  if v_sponsor.id is null then
    return jsonb_build_object('ok', false, 'message',
      'We could not find an active Krewe member with that email. Check the spelling with the member who invited you.');
  end if;
  if lower(coalesce(v_sponsor.email, '')) = v_email then
    return jsonb_build_object('ok', false, 'message',
      'A member cannot register as their own guest.');
  end if;

  v_adult_fee := v_event.guest_fee_cents;
  v_child_fee := case when v_child_count > 0 then v_event.guest_fee_family_cents else null end;
  v_fee := v_adult_fee + coalesce(v_child_fee, 0) * v_child_count;
  v_tier := case when v_child_count > 0 then 'adult_plus_children' else 'adult' end;

  perform public.kos_parade_guest_lock(v_id);
  v_used := public.kos_parade_guest_spots_used(v_id);
  v_left := greatest(v_event.guest_capacity - v_used, 0);
  if v_used + v_size > v_event.guest_capacity then
    if v_left <= 0 then
      v_msg := 'All guest spots for this parade are filled.';
    else
      v_msg := 'Only ' || v_left::text || ' guest spots are left. This registration is for '
        || v_size::text || ' people.';
    end if;
    perform public.enqueue_email(
      v_email,
      v_first || ' ' || v_last,
      'Guest spots are filled: ' || v_event.name,
      public.kos_parade_guest_email_wrap(
        'Guest spots are filled',
        '<p style="margin:0 0 12px;">Thank you for trying to register as a guest for <b>'
        || public.kos_email_html_escape(v_event.name)
        || '</b>.</p><p style="margin:0 0 12px;">'
        || public.kos_email_html_escape(v_msg)
        || '</p>'
      ),
      'parade_guest_full',
      null
    );
    return jsonb_build_object('ok', false, 'code', 'full', 'message', v_msg, 'spots_left', v_left);
  end if;

  if exists (
    select 1 from public.parade_guest_registrations g
     where g.event_id = v_id
       and lower(g.email) = v_email
       and g.status in ('pending_sponsor', 'payment_sent', 'paid')
  ) then
    return jsonb_build_object('ok', false, 'message',
      'A registration for this parade with that email is already on file. Each adult must register themselves. You can add your children to your own registration.');
  end if;

  insert into public.parade_guest_registrations (
    event_id, first_name, last_name, email, phone,
    sponsor_first_name, sponsor_last_name, sponsor_email, sponsor_member_id,
    relationship, fee_tier, fee_cents, adult_fee_cents, child_fee_cents,
    minors, age_attested_21, is_under_12,
    waiver_name, waiver_accepted_at, status
  ) values (
    v_id, v_first, v_last, v_email, v_phone,
    nullif(left(btrim(coalesce(p->>'sponsor_first_name', '')), 80), ''),
    nullif(left(btrim(coalesce(p->>'sponsor_last_name', '')), 80), ''),
    v_sponsor_email, v_sponsor.id,
    null, v_tier, v_fee, v_adult_fee, v_child_fee,
    v_minors, v_age21, false,
    v_waiver, now(), 'pending_sponsor'
  )
  returning id into v_id;

  perform public.enqueue_email(
    v_sponsor.email,
    trim(both from coalesce(v_sponsor.first_name, '') || ' ' || coalesce(v_sponsor.last_name, '')),
    'Please approve a parade guest: ' || v_first || ' ' || v_last,
    public.kos_parade_guest_email_wrap(
      'A guest asked you to approve them',
      '<p style="margin:0 0 12px;"><b>'
      || public.kos_email_html_escape(v_first || ' ' || v_last)
      || '</b> registered to march with the Krewe at <b>'
      || public.kos_email_html_escape(v_event.name)
      || '</b>, and named you as the inviting member.'
      || case when v_child_count > 0 then
           ' This registration includes '
           || v_child_count::text
           || ' child'
           || case when v_child_count = 1 then '' else 'ren' end
           || ' and uses '
           || v_size::text
           || ' guest spots.'
         else ''
         end
      || '</p>'
      || '<p style="margin:0 0 12px;">Open the Member Hub, go to My Krewe, and choose Approve or Decline. Your approval sends this guest the payment link for the whole registration. No officer step is needed.</p>'
      || '<p style="margin:0;"><a href="https://www.kreweofshamrock.com/members.html#krewe">Open My Krewe</a></p>'
    ),
    'parade_guest_sponsor_request',
    v_sponsor.id
  );

  perform public.enqueue_email(
    v_email,
    v_first || ' ' || v_last,
    'We received your guest registration for ' || v_event.name,
    public.kos_parade_guest_email_wrap(
      'We received your registration',
      '<p style="margin:0 0 12px;">Thanks for registering as a guest for <b>'
      || public.kos_email_html_escape(v_event.name)
      || '</b>.</p><p style="margin:0;">We asked the member who invited you to approve your registration. If they approve, you will get a separate email with the payment link. Please do not pay until you receive that email.</p>'
    ),
    'parade_guest_received',
    v_sponsor.id
  );

  return jsonb_build_object(
    'ok', true,
    'message', 'Thanks. We asked the member who invited you to approve your registration. If they approve, you will receive a payment link by email.',
    'status', 'pending_sponsor',
    'party_size', v_size
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- D. Payment email names people, total, and exact Zeffy ticket labels
-- ---------------------------------------------------------------------------
create or replace function public.kos_send_parade_guest_payment_email(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  g public.parade_guest_registrations;
  ev public.events%rowtype;
  v_url text;
  v_fee text;
  v_minors jsonb;
  v_child_count integer;
  v_size integer;
  v_adult_fee integer;
  v_child_fee integer;
  v_people text;
  v_tickets text;
  v_child jsonb;
begin
  select * into g from public.parade_guest_registrations where id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'Registration not found.');
  end if;
  select * into ev from public.events where id = g.event_id;
  v_url := public.kos_parade_guest_payment_url(ev.guest_payment_url, g.payment_token);
  if v_url is null then
    return jsonb_build_object('ok', false, 'message',
      'This parade does not have a guest payment link yet. An officer needs to add the Zeffy link in Event Studio.');
  end if;
  v_minors := coalesce(g.minors, '[]'::jsonb);
  v_size := public.kos_parade_guest_party_size(v_minors);
  v_child_count := v_size - 1;
  v_adult_fee := coalesce(g.adult_fee_cents, ev.guest_fee_cents);
  v_child_fee := coalesce(g.child_fee_cents, ev.guest_fee_family_cents);
  v_fee := coalesce(public.kos_parade_guest_fee_label(g.fee_cents), 'the posted guest fee');

  v_people := '<li>' || public.kos_email_html_escape(g.first_name || ' ' || g.last_name)
    || ' (adult guest, 1 ticket named '
    || public.kos_email_html_escape(public.kos_parade_guest_ticket_adult())
    || ', '
    || public.kos_email_html_escape(coalesce(public.kos_parade_guest_fee_label(v_adult_fee), 'standard fee'))
    || ')</li>';
  if v_child_count > 0 then
    for v_child in select value from jsonb_array_elements(v_minors)
    loop
      v_people := v_people
        || '<li>'
        || public.kos_email_html_escape(coalesce(v_child->>'first_name', '') || ' ' || coalesce(v_child->>'last_name', ''))
        || ' (child, ticket named '
        || public.kos_email_html_escape(public.kos_parade_guest_ticket_child())
        || ', '
        || public.kos_email_html_escape(coalesce(public.kos_parade_guest_fee_label(v_child_fee), 'family fee'))
        || ')</li>';
    end loop;
  end if;

  v_tickets := '<p style="margin:0 0 12px;">On the Zeffy payment page, choose:</p><ul style="margin:0 0 12px;padding-left:20px;">'
    || '<li>1 ticket named <b>'
    || public.kos_email_html_escape(public.kos_parade_guest_ticket_adult())
    || '</b> ('
    || public.kos_email_html_escape(coalesce(public.kos_parade_guest_fee_label(v_adult_fee), 'standard fee'))
    || ')</li>';
  if v_child_count > 0 then
    v_tickets := v_tickets
      || '<li>'
      || v_child_count::text
      || ' ticket'
      || case when v_child_count = 1 then '' else 's' end
      || ' named <b>'
      || public.kos_email_html_escape(public.kos_parade_guest_ticket_child())
      || '</b> ('
      || public.kos_email_html_escape(coalesce(public.kos_parade_guest_fee_label(v_child_fee), 'family fee'))
      || ' each)</li>';
  end if;
  v_tickets := v_tickets
    || '</ul><p style="margin:0 0 12px;">Your total is <b>'
    || public.kos_email_html_escape(v_fee)
    || '</b>. Complete this as one checkout. Pay with the email you registered with ('
    || public.kos_email_html_escape(g.email)
    || ').</p>';

  perform public.enqueue_email(
    g.email,
    g.first_name || ' ' || g.last_name,
    'Your guest payment link for ' || ev.name,
    public.kos_parade_guest_email_wrap(
      'Your guest payment link',
      '<p style="margin:0 0 12px;">The member who invited you approved your registration to march with the Krewe at <b>'
      || public.kos_email_html_escape(ev.name)
      || '</b>.</p>'
      || '<p style="margin:0 0 8px;">This registration covers:</p>'
      || '<ul style="margin:0 0 12px;padding-left:20px;">' || v_people || '</ul>'
      || v_tickets
      || '<p style="margin:0 0 16px;"><a href="' || public.kos_email_html_escape(v_url)
      || '" style="display:inline-block;background:#2d5a27;color:#fff;padding:10px 18px;border-radius:999px;text-decoration:none;font-weight:700;">Pay the guest parade fee</a></p>'
      || '<p style="margin:0;font-size:14px;color:#555;">If the button does not work, copy this address: '
      || public.kos_email_html_escape(v_url) || '</p>'
    ),
    'parade_guest_payment_link',
    g.sponsor_member_id
  );
  update public.parade_guest_registrations
     set last_payment_email_at = now(), updated_at = now()
   where id = p_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- E. Approve: party must fit remaining spots
-- ---------------------------------------------------------------------------
create or replace function public.approve_parade_guest(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  g public.parade_guest_registrations;
  ev public.events%rowtype;
  v_mid uuid := public.kos_current_member_id();
  v_me public.members;
  v_used integer;
  v_size integer;
  v_left integer;
  v_send jsonb;
begin
  if v_mid is null then
    return jsonb_build_object('ok', false, 'message', 'Please sign in.');
  end if;
  select * into v_me from public.members where id = v_mid;
  select * into g from public.parade_guest_registrations where id = p_id;
  if not found or g.sponsor_member_id is distinct from v_mid then
    return jsonb_build_object('ok', false, 'message', 'That guest registration was not found.');
  end if;
  if lower(g.email) = lower(coalesce(v_me.email, '')) then
    return jsonb_build_object('ok', false, 'message', 'Members cannot approve themselves as a guest.');
  end if;
  if g.status in ('payment_sent', 'paid') then
    return jsonb_build_object('ok', true, 'message', 'This guest is already approved.', 'status', g.status);
  end if;
  if g.status <> 'pending_sponsor' then
    return jsonb_build_object('ok', false, 'message', 'This registration can no longer be approved.');
  end if;

  select * into ev from public.events where id = g.event_id;
  if coalesce(ev.guest_capacity, 0) <= 0 then
    return jsonb_build_object('ok', false, 'message', 'This parade is not accepting guests.');
  end if;
  if nullif(btrim(coalesce(ev.guest_payment_url, '')), '') is null then
    return jsonb_build_object('ok', false, 'message',
      'This parade does not have a guest payment link yet. Please ask an officer to add the link in Event Studio, then approve again.');
  end if;
  if ev.guest_fee_cents is null and ev.guest_fee_family_cents is null then
    return jsonb_build_object('ok', false, 'message',
      'This parade does not have a guest fee posted yet. Please ask an officer to set the fee in Event Studio, then approve again.');
  end if;
  if coalesce(ev.guest_requires_21, true) and public.kos_parade_guest_party_size(g.minors) > 1 then
    return jsonb_build_object('ok', false, 'message',
      'This parade requires guests to be 21 or older. Children cannot be approved on this registration.');
  end if;

  v_size := public.kos_parade_guest_party_size(g.minors);
  perform public.kos_parade_guest_lock(g.event_id);
  v_used := public.kos_parade_guest_spots_used(g.event_id);
  v_left := greatest(ev.guest_capacity - v_used, 0);
  if v_used + v_size > ev.guest_capacity then
    if v_left <= 0 then
      return jsonb_build_object('ok', false, 'code', 'full', 'message',
        'All guest spots for this parade are filled. You cannot approve this guest.');
    end if;
    return jsonb_build_object('ok', false, 'code', 'full', 'message',
      'Only ' || v_left::text || ' guest spots are left. This registration is for '
      || v_size::text || ' people. You cannot approve it.');
  end if;

  update public.parade_guest_registrations
     set status = 'payment_sent',
         approved_at = now(),
         updated_at = now()
   where id = p_id
     and status = 'pending_sponsor'
  returning * into g;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'This registration can no longer be approved.');
  end if;

  v_send := public.kos_send_parade_guest_payment_email(p_id);
  if coalesce(v_send->>'ok', '') <> 'true' then
    update public.parade_guest_registrations
       set status = 'pending_sponsor', approved_at = null, updated_at = now()
     where id = p_id;
    return jsonb_build_object('ok', false, 'message', coalesce(v_send->>'message', 'Could not send the payment email.'));
  end if;

  return jsonb_build_object('ok', true, 'status', 'payment_sent',
    'message', 'Approved. We emailed this guest the payment link for the whole registration.');
end;
$$;

-- ---------------------------------------------------------------------------
-- F. Paid matching: token first, else unique email + total
-- ---------------------------------------------------------------------------
create or replace function public.kos_extract_parade_guest_token(p jsonb)
returns uuid
language plpgsql
immutable
set search_path to 'public'
as $$
declare
  v_text text;
  v_match text;
begin
  v_text := concat_ws(' ',
    p->>'kos_guest',
    p#>>'{metadata,kos_guest}',
    p#>>'{meta,kos_guest}',
    p#>>'{payment,metadata,kos_guest}',
    p->>'utm_content',
    p#>>'{metadata,utm_content}',
    p#>>'{meta,utm_content}',
    p#>>'{raw,data,payment,utm_content}',
    p#>>'{raw,data,payment,metadata,utm_content}',
    p->>'campaign_url',
    p->>'url',
    p#>>'{raw,data,payment,url}',
    p#>>'{raw,data,payment,campaign_url}',
    p#>>'{raw,data,payment,metadata,kos_guest}',
    p->>'description',
    p::text
  );
  v_match := substring(v_text from 'kos_guest[=_]([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})');
  if v_match is null then
    v_match := substring(v_text from '([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})');
    if v_text !~* 'kos_guest' and p->>'kos_guest' is null and p#>>'{metadata,kos_guest}' is null then
      v_match := null;
    end if;
  end if;
  if v_match is null then
    return null;
  end if;
  begin
    return v_match::uuid;
  exception when others then
    return null;
  end;
end;
$$;

create or replace function public.kos_apply_parade_guest_payment(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_token uuid;
  v_pay uuid;
  v_amount integer;
  g public.parade_guest_registrations;
  ev public.events%rowtype;
  v_emails text[] := array[]::text[];
  v_email text;
  v_matches integer := 0;
begin
  v_token := public.kos_extract_parade_guest_token(p);
  begin
    v_pay := nullif(p->>'payment_id', '')::uuid;
  exception when others then
    v_pay := null;
  end;
  begin
    v_amount := nullif(p->>'amount_cents', '')::integer;
  exception when others then
    v_amount := null;
  end;
  if p->'payer_emails' is not null and jsonb_typeof(p->'payer_emails') = 'array' then
    for v_email in select lower(btrim(x)) from jsonb_array_elements_text(p->'payer_emails') x
    loop
      if v_email <> '' and position('@' in v_email) > 0 and not (v_email = any (v_emails)) then
        v_emails := v_emails || v_email;
      end if;
    end loop;
  end if;
  v_email := lower(btrim(coalesce(p->>'payer_email', '')));
  if v_email <> '' and position('@' in v_email) > 0 and not (v_email = any (v_emails)) then
    v_emails := v_emails || v_email;
  end if;

  if v_token is not null then
    select * into g from public.parade_guest_registrations where payment_token = v_token;
  end if;

  if g.id is null and coalesce(array_length(v_emails, 1), 0) > 0 and v_amount is not null then
    select count(*) into v_matches
      from public.parade_guest_registrations r
     where r.status = 'payment_sent'
       and lower(r.email) = any (v_emails)
       and r.fee_cents is not null
       and r.fee_cents = v_amount;
    if v_matches > 1 then
      return jsonb_build_object(
        'ok', false,
        'matched', false,
        'code', 'ambiguous',
        'message', 'More than one unpaid guest registration matches this email and payment total. An officer needs to match it by hand.'
      );
    end if;
    if v_matches = 1 then
      select r.* into g
        from public.parade_guest_registrations r
       where r.status = 'payment_sent'
         and lower(r.email) = any (v_emails)
         and r.fee_cents is not null
         and r.fee_cents = v_amount
       limit 1;
    end if;
  end if;

  if g.id is null then
    return jsonb_build_object('ok', false, 'matched', false);
  end if;
  if g.status = 'paid' then
    return jsonb_build_object('ok', true, 'matched', true, 'already_paid', true, 'id', g.id);
  end if;
  if g.status not in ('payment_sent', 'pending_sponsor') then
    return jsonb_build_object('ok', false, 'matched', false, 'message', 'Registration is not awaiting payment.');
  end if;
  -- Token matches should still require the paid total to equal the registration
  -- total when Zeffy sent an amount, so a partial payment is not marked paid.
  if v_token is not null and v_amount is not null and g.fee_cents is not null and g.fee_cents <> v_amount then
    return jsonb_build_object('ok', false, 'matched', false, 'code', 'amount_mismatch',
      'message', 'A payment was found for this registration, but the amount does not match the total due.');
  end if;

  select * into ev from public.events where id = g.event_id;
  update public.parade_guest_registrations
     set status = 'paid',
         paid_at = now(),
         payment_id = coalesce(v_pay, payment_id),
         approved_at = coalesce(approved_at, now()),
         updated_at = now()
   where id = g.id;

  if v_pay is not null then
    update public.payments
       set event_id = coalesce(event_id, g.event_id)
     where id = v_pay;
  end if;

  perform public.enqueue_email(
    g.email,
    g.first_name || ' ' || g.last_name,
    'We received your guest parade payment: ' || ev.name,
    public.kos_parade_guest_email_wrap(
      'Payment received',
      '<p style="margin:0;">Thank you. We recorded your guest fee for <b>'
      || public.kos_email_html_escape(ev.name)
      || '</b>. See you on the route.</p>'
    ),
    'parade_guest_paid',
    g.sponsor_member_id
  );

  return jsonb_build_object('ok', true, 'matched', true, 'id', g.id, 'status', 'paid');
end;
$$;

revoke all on function public.kos_parade_guest_normalize_minors(jsonb) from public, anon, authenticated;
revoke all on function public.kos_extract_parade_guest_token(jsonb) from public, anon, authenticated;
