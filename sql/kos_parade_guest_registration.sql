-- NOT APPLIED. Review, then run in the Supabase SQL editor on oazwkwflgbthojvnclfc.
-- Guest parade registration: public form, inviting-member approval, then
-- payment-link email. Safe to re-run.
--
-- Event Studio fields (parade events only in the UI):
--   guest_capacity          blank or 0 means no guests; that parade is omitted
--                           from the public guest form. Set per parade.
--   guest_fee_cents         standard / "others" guest fee
--   guest_fee_family_cents  optional Immediate Family / Under 12 fee
--   guest_payment_url       Zeffy (or other) checkout link emailed after approval
--   guest_requires_21       21+ attestation; default true. Turn off for
--                           SantaFest and Children's Gasparilla.
--
-- Bylaw fee guidance (Article 7 Personal Guests), not yet confirmed against
-- a current bylaws copy, so amounts are editable in Event Studio. Prefill
-- in the UI is fine:
--   SantaFest and Children's Gasparilla: $10 Immediate Family / Under 12,
--   $25 Others. Other parades: set the guest fee in Event Studio.
-- Gasparilla Parade of Pirates allows no guests. Children's Gasparilla does.
-- Do not change live event rows here. Officers set these in Event Studio
-- after this SQL is applied. An optional commented seed is at the bottom.
--
-- Approved guests (status payment_sent or paid) count toward guest_capacity.
-- No waitlist. Notifications go only to the inviting member (and the guest).
-- Officers have a read-only-plus-cancel list. The member's approval alone
-- sends the payment link. Members cannot approve themselves.

-- ---------------------------------------------------------------------------
-- A. Event columns
-- ---------------------------------------------------------------------------
alter table public.events
  add column if not exists guest_capacity integer,
  add column if not exists guest_fee_cents integer,
  add column if not exists guest_fee_family_cents integer,
  add column if not exists guest_payment_url text,
  add column if not exists guest_requires_21 boolean not null default true;

alter table public.events drop constraint if exists events_guest_capacity_check;
alter table public.events
  add constraint events_guest_capacity_check
  check (guest_capacity is null or guest_capacity >= 0);

alter table public.events drop constraint if exists events_guest_fee_cents_check;
alter table public.events
  add constraint events_guest_fee_cents_check
  check (guest_fee_cents is null or guest_fee_cents >= 0);

alter table public.events drop constraint if exists events_guest_fee_family_cents_check;
alter table public.events
  add constraint events_guest_fee_family_cents_check
  check (guest_fee_family_cents is null or guest_fee_family_cents >= 0);

comment on column public.events.guest_capacity is
  'Parade guest-march spots. Null or 0 means no guests and the parade is hidden from the public guest form. Separate from capacity (member RSVP) and volunteer_cap.';
comment on column public.events.guest_fee_cents is
  'Standard / others guest parade fee in cents. Editable in Event Studio.';
comment on column public.events.guest_fee_family_cents is
  'Optional Immediate Family / Under 12 guest fee in cents.';
comment on column public.events.guest_payment_url is
  'Checkout link emailed to a guest only after the inviting member approves.';
comment on column public.events.guest_requires_21 is
  'When true, the public guest form requires a 21 or older attestation.';

-- ---------------------------------------------------------------------------
-- B. Registrations
-- ---------------------------------------------------------------------------
create table if not exists public.parade_guest_registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text,
  sponsor_first_name text,
  sponsor_last_name text,
  sponsor_email text not null,
  sponsor_member_id uuid not null references public.members(id),
  relationship text,
  fee_tier text,
  fee_cents integer,
  age_attested_21 boolean not null default false,
  is_under_12 boolean not null default false,
  waiver_name text not null,
  waiver_accepted_at timestamptz not null,
  status text not null default 'pending_sponsor'
    check (status in ('pending_sponsor', 'payment_sent', 'paid', 'declined', 'cancelled')),
  payment_token uuid not null default gen_random_uuid(),
  payment_id uuid references public.payments(id),
  paid_at timestamptz,
  approved_at timestamptz,
  declined_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid,
  reminder_sent_at timestamptz,
  last_payment_email_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists parade_guest_registrations_token_idx
  on public.parade_guest_registrations (payment_token);

create unique index if not exists parade_guest_registrations_open_email_idx
  on public.parade_guest_registrations (event_id, lower(email))
  where status in ('pending_sponsor', 'payment_sent', 'paid');

create index if not exists parade_guest_registrations_sponsor_idx
  on public.parade_guest_registrations (sponsor_member_id, created_at desc);

create index if not exists parade_guest_registrations_event_status_idx
  on public.parade_guest_registrations (event_id, status);

alter table public.parade_guest_registrations enable row level security;

drop policy if exists parade_guests_select_own_sponsor on public.parade_guest_registrations;
create policy parade_guests_select_own_sponsor
  on public.parade_guest_registrations
  for select
  to authenticated
  using (sponsor_member_id = public.kos_current_member_id());

revoke all on table public.parade_guest_registrations from public, anon, authenticated;
grant select on table public.parade_guest_registrations to authenticated;

-- ---------------------------------------------------------------------------
-- C. Helpers
-- ---------------------------------------------------------------------------
create or replace function public.kos_can_review_parade_guests()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.is_krewe_officer() or public.can_manage_events();
$$;

create or replace function public.kos_parade_guest_spots_used(p_event uuid)
returns integer
language sql
stable
set search_path to 'public'
as $$
  select count(*)::integer
  from public.parade_guest_registrations g
  where g.event_id = p_event
    and g.status in ('payment_sent', 'paid');
$$;

create or replace function public.kos_parade_guest_lock(p_event uuid)
returns void
language plpgsql
set search_path to 'public'
as $$
begin
  perform pg_advisory_xact_lock(hashtext('parade_guest:' || p_event::text));
end;
$$;

create or replace function public.kos_parade_guest_fee_label(p_cents integer)
returns text
language sql
immutable
set search_path to 'public'
as $$
  select case
    when p_cents is null then null
    when p_cents = 0 then '$0'
    else '$' || to_char(p_cents / 100.0, 'FM999,990.00')
  end;
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
  return v_base || v_sep || 'kos_guest=' || p_token::text;
end;
$$;

create or replace function public.kos_find_active_sponsor(p_email text)
returns public.members
language plpgsql
stable
set search_path to 'public'
as $$
declare
  v_row public.members;
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if v_email = '' or position('@' in v_email) = 0 then
    return null;
  end if;
  select m.* into v_row
    from public.members m
   where lower(m.email) = v_email
     and m.merged_into is null
     and lower(coalesce(m.membership_status, '')) = 'active'
   order by m.created_at nulls last
   limit 1;
  return v_row;
end;
$$;

create or replace function public.kos_parade_guest_email_wrap(p_title text, p_body text)
returns text
language sql
immutable
set search_path to 'public'
as $$
  select
    '<div style="font-family:Georgia,serif;font-size:16px;line-height:1.5;color:#1a1a1a;">'
    || '<p style="margin:0 0 12px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#2d5a27;">Krewe of Shamrock</p>'
    || '<h1 style="margin:0 0 16px;font-size:22px;color:#1f3d1c;">'
    || public.kos_email_html_escape(p_title) || '</h1>'
    || p_body
    || '<p style="margin:24px 0 0;font-size:13px;color:#555;">Questions: secretary@kreweofshamrock.com</p>'
    || '</div>';
$$;

create or replace function public.kos_parade_guest_public_row(e public.events)
returns jsonb
language plpgsql
stable
set search_path to 'public'
as $$
declare
  v_used integer;
  v_cap integer := e.guest_capacity;
begin
  v_used := public.kos_parade_guest_spots_used(e.id);
  return jsonb_build_object(
    'id', e.id,
    'name', e.name,
    'start_time', e.start_time,
    'end_time', e.end_time,
    'location', e.location,
    'guest_capacity', v_cap,
    'spots_taken', v_used,
    'spots_left', case when v_cap is null then 0 else greatest(v_cap - v_used, 0) end,
    'is_full', v_cap is null or v_cap <= 0 or v_used >= v_cap,
    'guest_fee_cents', e.guest_fee_cents,
    'guest_fee_family_cents', e.guest_fee_family_cents,
    'guest_fee_label', public.kos_parade_guest_fee_label(e.guest_fee_cents),
    'guest_fee_family_label', public.kos_parade_guest_fee_label(e.guest_fee_family_cents),
    'guest_requires_21', coalesce(e.guest_requires_21, true),
    'fees_ready', (e.guest_fee_cents is not null or e.guest_fee_family_cents is not null)
  );
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

-- ---------------------------------------------------------------------------
-- D. Event Studio settings (does not replace officer_upsert_event)
-- ---------------------------------------------------------------------------
create or replace function public.officer_set_parade_guest_settings(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_id uuid;
  v_row public.events%rowtype;
  v_cap integer;
  v_fee integer;
  v_family integer;
  v_url text;
  v_req21 boolean;
begin
  if not public.can_manage_events() then
    return jsonb_build_object('ok', false, 'message', 'Not authorized.');
  end if;

  begin
    v_id := nullif(p->>'id', '')::uuid;
  exception when others then
    return jsonb_build_object('ok', false, 'message', 'That event was not found.');
  end;
  if v_id is null then
    return jsonb_build_object('ok', false, 'message', 'That event was not found.');
  end if;

  select * into v_row from public.events e where e.id = v_id and coalesce(e.source, '') <> 'ikc';
  if not found then
    return jsonb_build_object('ok', false, 'message', 'Event not found or cannot be edited.');
  end if;

  if lower(coalesce(v_row.event_type, '')) <> 'parade' then
    return jsonb_build_object('ok', true, 'event', to_jsonb(v_row), 'skipped', true);
  end if;

  v_cap := null;
  if p ? 'guest_capacity' then
    begin
      v_cap := nullif(btrim(coalesce(p->>'guest_capacity', '')), '')::integer;
    exception when others then
      return jsonb_build_object('ok', false, 'message', 'Guest march spots must be a whole number.');
    end;
    if v_cap is not null and v_cap < 0 then
      return jsonb_build_object('ok', false, 'message', 'Guest march spots must be zero or more.');
    end if;
  else
    v_cap := v_row.guest_capacity;
  end if;

  v_fee := v_row.guest_fee_cents;
  if p ? 'guest_fee_cents' then
    begin
      v_fee := nullif(btrim(coalesce(p->>'guest_fee_cents', '')), '')::integer;
    exception when others then
      return jsonb_build_object('ok', false, 'message', 'The guest fee must be a number.');
    end;
    if v_fee is not null and v_fee < 0 then
      return jsonb_build_object('ok', false, 'message', 'The guest fee must be zero or more.');
    end if;
  end if;

  v_family := v_row.guest_fee_family_cents;
  if p ? 'guest_fee_family_cents' then
    begin
      v_family := nullif(btrim(coalesce(p->>'guest_fee_family_cents', '')), '')::integer;
    exception when others then
      return jsonb_build_object('ok', false, 'message', 'The family guest fee must be a number.');
    end;
    if v_family is not null and v_family < 0 then
      return jsonb_build_object('ok', false, 'message', 'The family guest fee must be zero or more.');
    end if;
  end if;

  v_url := v_row.guest_payment_url;
  if p ? 'guest_payment_url' then
    v_url := nullif(btrim(coalesce(p->>'guest_payment_url', '')), '');
    if v_url is not null and v_url !~* '^https?://' then
      return jsonb_build_object('ok', false, 'message', 'The guest payment link must start with http:// or https://.');
    end if;
  end if;

  v_req21 := coalesce(v_row.guest_requires_21, true);
  if p ? 'guest_requires_21' then
    v_req21 := coalesce((p->>'guest_requires_21')::boolean, true);
  end if;

  update public.events e
     set guest_capacity = v_cap,
         guest_fee_cents = v_fee,
         guest_fee_family_cents = v_family,
         guest_payment_url = v_url,
         guest_requires_21 = v_req21,
         updated_at = now()
   where e.id = v_id
   returning * into v_row;

  return jsonb_build_object('ok', true, 'event', to_jsonb(v_row));
end;
$$;

revoke all on function public.officer_set_parade_guest_settings(jsonb) from public, anon;
grant execute on function public.officer_set_parade_guest_settings(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- E. Public list and register
-- ---------------------------------------------------------------------------
create or replace function public.list_public_parade_guest_events()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  return jsonb_build_object(
    'ok', true,
    'events', coalesce((
      select jsonb_agg(public.kos_parade_guest_public_row(e) order by e.start_time nulls last, e.name)
      from public.events e
      where lower(coalesce(e.event_type, '')) = 'parade'
        and coalesce(e.source, 'krewe') = 'krewe'
        and lower(coalesce(e.status, 'published')) = 'published'
        and coalesce(e.guest_capacity, 0) > 0
        and (
          e.end_time is not null and e.end_time >= now()
          or (e.end_time is null and e.start_time is not null
              and ((e.start_time at time zone 'America/New_York')::date
                   >= (now() at time zone 'America/New_York')::date))
          or e.start_time is null
        )
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.list_public_parade_guest_events() from public;
grant execute on function public.list_public_parade_guest_events() to anon, authenticated;

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
  v_rel text;
  v_tier text;
  v_fee integer;
  v_under12 boolean;
  v_age21 boolean;
  v_used integer;
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
  v_rel := nullif(left(btrim(coalesce(p->>'relationship', '')), 80), '');
  v_under12 := coalesce((p->>'is_under_12')::boolean, false);
  v_age21 := coalesce((p->>'age_attested_21')::boolean, false);

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

  v_sponsor := public.kos_find_active_sponsor(v_sponsor_email);
  if v_sponsor.id is null then
    return jsonb_build_object('ok', false, 'message',
      'We could not find an active Krewe member with that email. Check the spelling with the member who invited you.');
  end if;
  if lower(coalesce(v_sponsor.email, '')) = v_email then
    return jsonb_build_object('ok', false, 'message',
      'A member cannot register as their own guest.');
  end if;

  if v_under12 or lower(coalesce(v_rel, '')) in ('immediate_family', 'family', 'under_12', 'under12') then
    v_tier := 'family_or_under_12';
  else
    v_tier := 'other';
  end if;
  if v_tier = 'family_or_under_12' and v_event.guest_fee_family_cents is not null then
    v_fee := v_event.guest_fee_family_cents;
  else
    v_fee := v_event.guest_fee_cents;
  end if;

  perform public.kos_parade_guest_lock(v_id);
  v_used := public.kos_parade_guest_spots_used(v_id);
  if v_used >= v_event.guest_capacity then
    v_msg := 'All guest spots for this parade are filled.';
    perform public.enqueue_email(
      v_email,
      v_first || ' ' || v_last,
      'Guest spots are filled: ' || v_event.name,
      public.kos_parade_guest_email_wrap(
        'Guest spots are filled',
        '<p style="margin:0 0 12px;">Thank you for trying to register as a guest for <b>'
        || public.kos_email_html_escape(v_event.name)
        || '</b>.</p><p style="margin:0 0 12px;">All guest spots for this parade are filled.</p>'
      ),
      'parade_guest_full',
      null
    );
    return jsonb_build_object('ok', false, 'code', 'full', 'message', v_msg);
  end if;

  if exists (
    select 1 from public.parade_guest_registrations g
     where g.event_id = v_id
       and lower(g.email) = v_email
       and g.status in ('pending_sponsor', 'payment_sent', 'paid')
  ) then
    return jsonb_build_object('ok', false, 'message',
      'A registration for this parade with that email is already on file.');
  end if;

  insert into public.parade_guest_registrations (
    event_id, first_name, last_name, email, phone,
    sponsor_first_name, sponsor_last_name, sponsor_email, sponsor_member_id,
    relationship, fee_tier, fee_cents, age_attested_21, is_under_12,
    waiver_name, waiver_accepted_at, status
  ) values (
    v_id, v_first, v_last, v_email, v_phone,
    nullif(left(btrim(coalesce(p->>'sponsor_first_name', '')), 80), ''),
    nullif(left(btrim(coalesce(p->>'sponsor_last_name', '')), 80), ''),
    v_sponsor_email, v_sponsor.id,
    v_rel, v_tier, v_fee, v_age21, v_under12,
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
      || '</b>, and named you as the inviting member.</p>'
      || '<p style="margin:0 0 12px;">Open the Member Hub, go to My Krewe, and choose Approve or Decline. Your approval sends this guest the payment link. No officer step is needed.</p>'
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
    'status', 'pending_sponsor'
  );
end;
$$;

revoke all on function public.register_parade_guest(jsonb) from public;
grant execute on function public.register_parade_guest(jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- F. Inviting member: list, approve, decline, cancel, resend
-- ---------------------------------------------------------------------------
create or replace function public.list_my_parade_guests()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_mid uuid := public.kos_current_member_id();
begin
  if v_mid is null then
    return jsonb_build_object('ok', false, 'message', 'Please sign in.', 'guests', '[]'::jsonb);
  end if;
  return jsonb_build_object(
    'ok', true,
    'guests', coalesce((
      select jsonb_agg(public.kos_parade_guest_member_row(g) order by ev.start_time nulls last, g.created_at)
      from public.parade_guest_registrations g
      join public.events ev on ev.id = g.event_id
      where g.sponsor_member_id = v_mid
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.list_my_parade_guests() from public, anon;
grant execute on function public.list_my_parade_guests() to authenticated;

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
  v_fee := coalesce(public.kos_parade_guest_fee_label(g.fee_cents), 'the posted guest fee');
  perform public.enqueue_email(
    g.email,
    g.first_name || ' ' || g.last_name,
    'Your guest payment link for ' || ev.name,
    public.kos_parade_guest_email_wrap(
      'Your guest payment link',
      '<p style="margin:0 0 12px;">The member who invited you approved your registration to march with the Krewe at <b>'
      || public.kos_email_html_escape(ev.name)
      || '</b>.</p>'
      || '<p style="margin:0 0 12px;">Your guest fee is <b>'
      || public.kos_email_html_escape(v_fee)
      || '</b>. Please use this payment link:</p>'
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

revoke all on function public.kos_send_parade_guest_payment_email(uuid) from public, anon, authenticated;

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

  perform public.kos_parade_guest_lock(g.event_id);
  v_used := public.kos_parade_guest_spots_used(g.event_id);
  if v_used >= ev.guest_capacity then
    return jsonb_build_object('ok', false, 'code', 'full', 'message',
      'All guest spots for this parade are filled. You cannot approve this guest.');
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
    'message', 'Approved. We emailed this guest the payment link.');
end;
$$;

revoke all on function public.approve_parade_guest(uuid) from public, anon;
grant execute on function public.approve_parade_guest(uuid) to authenticated;

create or replace function public.decline_parade_guest(p_id uuid, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  g public.parade_guest_registrations;
  ev public.events%rowtype;
  v_mid uuid := public.kos_current_member_id();
begin
  if v_mid is null then
    return jsonb_build_object('ok', false, 'message', 'Please sign in.');
  end if;
  select * into g from public.parade_guest_registrations where id = p_id;
  if not found or g.sponsor_member_id is distinct from v_mid then
    return jsonb_build_object('ok', false, 'message', 'That guest registration was not found.');
  end if;
  if g.status not in ('pending_sponsor', 'payment_sent') then
    return jsonb_build_object('ok', false, 'message', 'This registration can no longer be declined.');
  end if;
  select * into ev from public.events where id = g.event_id;
  update public.parade_guest_registrations
     set status = 'declined',
         declined_at = now(),
         decision_note = nullif(left(btrim(coalesce(p_note, '')), 400), ''),
         updated_at = now()
   where id = p_id;
  perform public.enqueue_email(
    g.email,
    g.first_name || ' ' || g.last_name,
    'Update on your guest registration for ' || ev.name,
    public.kos_parade_guest_email_wrap(
      'Your guest registration was declined',
      '<p style="margin:0 0 12px;">The member who invited you declined your guest registration for <b>'
      || public.kos_email_html_escape(ev.name)
      || '</b>.</p><p style="margin:0;">If you think this was a mistake, please contact that member directly.</p>'
    ),
    'parade_guest_declined',
    g.sponsor_member_id
  );
  return jsonb_build_object('ok', true, 'status', 'declined', 'message', 'Declined. We emailed the guest.');
end;
$$;

revoke all on function public.decline_parade_guest(uuid, text) from public, anon;
grant execute on function public.decline_parade_guest(uuid, text) to authenticated;

create or replace function public.cancel_parade_guest(p_id uuid, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  g public.parade_guest_registrations;
  ev public.events%rowtype;
  v_mid uuid := public.kos_current_member_id();
  v_officer boolean := public.kos_can_review_parade_guests();
begin
  if v_mid is null then
    return jsonb_build_object('ok', false, 'message', 'Please sign in.');
  end if;
  select * into g from public.parade_guest_registrations where id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'That guest registration was not found.');
  end if;
  if g.sponsor_member_id is distinct from v_mid and not v_officer then
    return jsonb_build_object('ok', false, 'message', 'That guest registration was not found.');
  end if;
  if g.status = 'cancelled' then
    return jsonb_build_object('ok', true, 'status', 'cancelled', 'message', 'Already cancelled.');
  end if;
  if g.status = 'declined' then
    return jsonb_build_object('ok', false, 'message', 'A declined registration does not need to be cancelled.');
  end if;
  select * into ev from public.events where id = g.event_id;
  update public.parade_guest_registrations
     set status = 'cancelled',
         cancelled_at = now(),
         cancelled_by = v_mid,
         decision_note = nullif(left(btrim(coalesce(p_note, '')), 400), ''),
         updated_at = now()
   where id = p_id;
  perform public.enqueue_email(
    g.email,
    g.first_name || ' ' || g.last_name,
    'Your guest registration was cancelled: ' || ev.name,
    public.kos_parade_guest_email_wrap(
      'Your guest registration was cancelled',
      '<p style="margin:0 0 12px;">Your guest registration for <b>'
      || public.kos_email_html_escape(ev.name)
      || '</b> has been cancelled.</p>'
      || case when g.status = 'paid'
           then '<p style="margin:0;">If you already paid, please write secretary@kreweofshamrock.com about a refund. This cancellation does not issue a refund by itself.</p>'
           else '<p style="margin:0;">No payment is due.</p>'
         end
    ),
    'parade_guest_cancelled',
    g.sponsor_member_id
  );
  return jsonb_build_object('ok', true, 'status', 'cancelled',
    'message', 'Cancelled. We emailed the guest. This does not issue a refund.');
end;
$$;

revoke all on function public.cancel_parade_guest(uuid, text) from public, anon;
grant execute on function public.cancel_parade_guest(uuid, text) to authenticated;

create or replace function public.resend_parade_guest_payment(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  g public.parade_guest_registrations;
  v_mid uuid := public.kos_current_member_id();
  v_send jsonb;
begin
  if v_mid is null then
    return jsonb_build_object('ok', false, 'message', 'Please sign in.');
  end if;
  select * into g from public.parade_guest_registrations where id = p_id;
  if not found or g.sponsor_member_id is distinct from v_mid then
    return jsonb_build_object('ok', false, 'message', 'That guest registration was not found.');
  end if;
  if g.status <> 'payment_sent' then
    return jsonb_build_object('ok', false, 'message',
      case when g.status = 'paid' then 'This guest has already paid.'
           else 'A payment link can be sent only after you approve this guest.' end);
  end if;
  v_send := public.kos_send_parade_guest_payment_email(p_id);
  if coalesce(v_send->>'ok', '') <> 'true' then
    return v_send;
  end if;
  update public.parade_guest_registrations
     set reminder_sent_at = now(), updated_at = now()
   where id = p_id;
  return jsonb_build_object('ok', true, 'message', 'We resent the payment link to this guest.');
end;
$$;

revoke all on function public.resend_parade_guest_payment(uuid) from public, anon;
grant execute on function public.resend_parade_guest_payment(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- G. Officer list and cancel (reuse cancel_parade_guest)
-- ---------------------------------------------------------------------------
create or replace function public.list_officer_parade_guests()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not public.kos_can_review_parade_guests() then
    return jsonb_build_object('ok', false, 'message', 'Not authorized.', 'parades', '[]'::jsonb);
  end if;
  return jsonb_build_object(
    'ok', true,
    'parades', coalesce((
      select jsonb_agg(row_data order by start_time nulls last, name)
      from (
        select e.name,
               e.start_time,
               e.id as event_id,
               e.guest_capacity,
               public.kos_parade_guest_spots_used(e.id) as spots_taken,
               jsonb_build_object(
                 'id', e.id,
                 'name', e.name,
                 'start_time', e.start_time,
                 'guest_capacity', e.guest_capacity,
                 'spots_taken', public.kos_parade_guest_spots_used(e.id),
                 'spots_label', public.kos_parade_guest_spots_used(e.id)::text
                                || ' of '
                                || coalesce(e.guest_capacity, 0)::text,
                 'guest_fee_cents', e.guest_fee_cents,
                 'guest_fee_family_cents', e.guest_fee_family_cents,
                 'guests', coalesce((
                   select jsonb_agg(public.kos_parade_guest_member_row(g) order by g.created_at)
                   from public.parade_guest_registrations g
                   where g.event_id = e.id
                 ), '[]'::jsonb)
               ) as row_data
        from public.events e
        where lower(coalesce(e.event_type, '')) = 'parade'
          and coalesce(e.source, 'krewe') = 'krewe'
          and (
            coalesce(e.guest_capacity, 0) > 0
            or exists (select 1 from public.parade_guest_registrations g where g.event_id = e.id)
          )
      ) s
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.list_officer_parade_guests() from public, anon;
grant execute on function public.list_officer_parade_guests() to authenticated;

-- ---------------------------------------------------------------------------
-- H. Paid-status matching (webhook + payments insert)
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
    p->>'campaign_url',
    p->>'url',
    p#>>'{raw,data,payment,url}',
    p#>>'{raw,data,payment,campaign_url}',
    p#>>'{raw,data,payment,metadata,kos_guest}',
    p->>'description',
    p::text
  );
  v_match := substring(v_text from 'kos_guest=([0-9a-fA-F-]{36})');
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

  if g.id is null and coalesce(array_length(v_emails, 1), 0) > 0 then
    select r.* into g
      from public.parade_guest_registrations r
      join public.events e on e.id = r.event_id
     where r.status = 'payment_sent'
       and lower(r.email) = any (v_emails)
       and (
         v_amount is null
         or r.fee_cents is null
         or r.fee_cents = v_amount
       )
     order by
       case when v_amount is not null and r.fee_cents = v_amount then 0 else 1 end,
       r.last_payment_email_at desc nulls last,
       r.approved_at desc nulls last
     limit 1;
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

revoke all on function public.kos_apply_parade_guest_payment(jsonb) from public, anon, authenticated;
grant execute on function public.kos_apply_parade_guest_payment(jsonb) to service_role;

create or replace function public.kos_payments_match_parade_guest()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_payload jsonb;
begin
  v_payload := jsonb_build_object(
    'payment_id', new.id,
    'amount_cents', new.amount_cents,
    'payer_email', new.payer_email,
    'description', new.description,
    'raw', new.raw
  );
  if new.raw is not null then
    v_payload := v_payload || new.raw;
  end if;
  perform public.kos_apply_parade_guest_payment(v_payload);
  return new;
end;
$$;

drop trigger if exists kos_payments_match_parade_guest on public.payments;
create trigger kos_payments_match_parade_guest
  after insert or update of status, payer_email, amount_cents, raw
  on public.payments
  for each row
  when (new.provider = 'zeffy' and lower(coalesce(new.status, '')) in ('succeeded', 'paid', 'completed', 'complete'))
  execute function public.kos_payments_match_parade_guest();

-- ---------------------------------------------------------------------------
-- I. Unpaid reminders for the inviting member (and a resend to the guest)
--    Call from a later cron or by hand. Not scheduled in this file.
-- ---------------------------------------------------------------------------
create or replace function public.kos_remind_unpaid_parade_guests()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  g public.parade_guest_registrations;
  ev public.events%rowtype;
  sp public.members;
  v_count integer := 0;
begin
  for g in
    select *
      from public.parade_guest_registrations r
     where r.status = 'payment_sent'
       and r.approved_at is not null
       and r.approved_at < now() - interval '3 days'
       and (r.reminder_sent_at is null or r.reminder_sent_at < now() - interval '3 days')
  loop
    select * into ev from public.events where id = g.event_id;
    select * into sp from public.members where id = g.sponsor_member_id;
    perform public.enqueue_email(
      coalesce(sp.email, g.sponsor_email),
      trim(both from coalesce(sp.first_name, '') || ' ' || coalesce(sp.last_name, '')),
      'Reminder: ' || g.first_name || ' ' || g.last_name || ' has not paid for ' || ev.name,
      public.kos_parade_guest_email_wrap(
        'Your guest has not paid yet',
        '<p style="margin:0 0 12px;"><b>'
        || public.kos_email_html_escape(g.first_name || ' ' || g.last_name)
        || '</b> is approved to march at <b>'
        || public.kos_email_html_escape(ev.name)
        || '</b>, but we have not recorded their guest fee yet.</p>'
        || '<p style="margin:0;">Open My Krewe to resend the payment link or cancel the spot. <a href="https://www.kreweofshamrock.com/members.html#krewe">Open My Krewe</a></p>'
      ),
      'parade_guest_unpaid_reminder',
      g.sponsor_member_id
    );
    perform public.kos_send_parade_guest_payment_email(g.id);
    update public.parade_guest_registrations
       set reminder_sent_at = now(), updated_at = now()
     where id = g.id;
    v_count := v_count + 1;
  end loop;
  return jsonb_build_object('ok', true, 'reminded', v_count);
end;
$$;

revoke all on function public.kos_remind_unpaid_parade_guests() from public, anon, authenticated;
grant execute on function public.kos_remind_unpaid_parade_guests() to service_role;

-- ---------------------------------------------------------------------------
-- J. Grants for helpers used by RPCs (keep helpers locked down)
-- ---------------------------------------------------------------------------
revoke all on function public.kos_can_review_parade_guests() from public, anon;
grant execute on function public.kos_can_review_parade_guests() to authenticated;
revoke all on function public.kos_parade_guest_spots_used(uuid) from public, anon, authenticated;
revoke all on function public.kos_parade_guest_lock(uuid) from public, anon, authenticated;
revoke all on function public.kos_find_active_sponsor(text) from public, anon, authenticated;
revoke all on function public.kos_extract_parade_guest_token(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- K. Optional seed (commented, not applied)
--    After this migration runs, set values in Event Studio. Example only:
--
-- update public.events
--    set guest_capacity = 20,
--        guest_fee_cents = 2500,
--        guest_fee_family_cents = 1000,
--        guest_requires_21 = false
--  where source = 'krewe'
--    and event_type = 'parade'
--    and name in ('SantaFest', 'Children''s Gasparilla');
--
-- Gasparilla Parade of Pirates allows no guests: leave guest_capacity null or 0.
-- Sant'Yago Knight Parade and St. Patrick's Day Parade: set a guest fee and
-- spots in Event Studio if the board wants guests, plus the Zeffy link.
-- ---------------------------------------------------------------------------
