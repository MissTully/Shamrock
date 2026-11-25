-- NOT APPLIED. Review, then run this file in the Supabase SQL editor for
-- project oazwkwflgbthojvnclfc. Do not treat this file as already live.
--
-- Krewe giving: one-time donation intents, officer list, and a thank-you email.
-- Safe to re-run.
--
-- After this file:
--   1. Deploy supabase/functions/zeffy-webhook so inferKind classifies the
--      Give to the Krewe form before the row is written. This file also
--      reclassifies a payment whose URL or title already says it is that
--      form, so a gift is not left as an event ticket.
--   2. Confirm kos_runtime_flags.kos_donation_zeffy_url. The seed below is
--      https://www.zeffy.com/en-US/donation-form/give-to-the-krewe-of-shamrock
--      with amount_param amount (lowercase). Zeffy prefills ?amount=25.
--      Amount does not work. A later edit of that flag is the live switch.
--      A blank or placeholder URL is filled in. A real URL already stored
--      is left as it is. amount_param is set to amount on each run because
--      that is the parameter the form accepts.
--
-- Match rule (same as supabase/functions/zeffy-webhook/donation-match.mjs):
--   newest pending intent for the member (payment member_id or payer email)
--   with the same amount_cents, created within 24 hours before the payment
--   (5 minutes of clock skew allowed), else the only pending intent when
--   its amount differs. A lone same-amount intent older than 24 hours stays
--   pending.
-- Thank-you emails use outbound_emails purpose donation_thanks:<payment id>
-- and the existing Resend cron. One email per payment. Public gifts with no
-- intent still get the thank-you, without a Hub note. A Zeffy answer to
-- "Would you like to add a note with your gift?" is used when the Hub note
-- is empty.
--
-- Who can read the officer list: can_view_payments() (Treasurer, President,
-- Secretary, Membership, Finance, and Technology chairs, plus an extra
-- payments grant) and the Charity Committee chair. Vice President is not
-- included unless they already have the payments tool.

create table if not exists public.kos_runtime_flags (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.kos_runtime_flags (key, value)
values (
  'kos_donation_zeffy_url',
  jsonb_build_object(
    'url', 'https://www.zeffy.com/en-US/donation-form/give-to-the-krewe-of-shamrock',
    'amount_param', 'amount'
  )
)
on conflict (key) do update
  set value = jsonb_build_object(
        'url', case
          when nullif(btrim(public.kos_runtime_flags.value->>'url'), '') is null
            or public.kos_runtime_flags.value->>'url' ilike '%placeholder%'
            then 'https://www.zeffy.com/en-US/donation-form/give-to-the-krewe-of-shamrock'
          else public.kos_runtime_flags.value->>'url'
        end,
        'amount_param', 'amount'
      ),
      updated_at = now();

create or replace function public.kos_donation_form_url()
returns text
language sql
stable
security definer
set search_path to public
as $$
  select nullif(btrim(coalesce(f.value->>'url', '')), '')
  from public.kos_runtime_flags f
  where f.key = 'kos_donation_zeffy_url';
$$;

create or replace function public.kos_donation_amount_param()
returns text
language sql
stable
security definer
set search_path to public
as $$
  select coalesce(nullif(btrim(f.value->>'amount_param'), ''), 'amount')
  from public.kos_runtime_flags f
  where f.key = 'kos_donation_zeffy_url';
$$;

revoke all on function public.kos_donation_form_url() from public, anon;
revoke all on function public.kos_donation_amount_param() from public, anon;
grant execute on function public.kos_donation_form_url() to authenticated, service_role;
grant execute on function public.kos_donation_amount_param() to authenticated, service_role;

create or replace function public.list_public_donation_form()
returns jsonb
language sql
stable
security definer
set search_path to public
as $$
  select jsonb_build_object(
    'zeffy_url', coalesce(public.kos_donation_form_url(), ''),
    'amount_param', coalesce(public.kos_donation_amount_param(), 'amount')
  );
$$;

revoke all on function public.list_public_donation_form() from public;
grant execute on function public.list_public_donation_form() to anon, authenticated;

comment on function public.list_public_donation_form() is
  'Public Give link. zeffy_url and amount_param from kos_runtime_flags.kos_donation_zeffy_url. amount_param defaults to amount.';

create table if not exists public.donation_intents (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  amount_cents integer not null,
  note text,
  status text not null default 'pending',
  payment_id uuid references public.payments(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint donation_intents_amount_check check (amount_cents >= 100 and amount_cents <= 100000000),
  constraint donation_intents_status_check check (status in ('pending', 'paid')),
  constraint donation_intents_note_len check (note is null or char_length(note) <= 500)
);

create index if not exists donation_intents_member_created_idx
  on public.donation_intents (member_id, created_at desc);

create index if not exists donation_intents_pending_idx
  on public.donation_intents (member_id, created_at desc)
  where status = 'pending' and payment_id is null;

create unique index if not exists donation_intents_payment_uidx
  on public.donation_intents (payment_id)
  where payment_id is not null;

comment on table public.donation_intents is
  'One-time Hub gift intents. status pending until a Zeffy donation payment is matched, then paid. Members read their own rows. Writes go through RPCs.';

alter table public.donation_intents enable row level security;

drop policy if exists donation_intents_select_own on public.donation_intents;
create policy donation_intents_select_own
  on public.donation_intents
  for select
  to authenticated
  using (member_id = (select public.kos_current_member_id()));

revoke all on table public.donation_intents from public, anon;
grant select on table public.donation_intents to authenticated;

create or replace function public.kos_is_charity_chair()
returns boolean
language plpgsql
stable
security definer
set search_path to public
as $$
declare
  v_member uuid;
  v_title text := '';
  v_status text := '';
  v_ok boolean := false;
begin
  if auth.uid() is null then
    return false;
  end if;
  v_member := public.kos_current_member_id();
  if v_member is null then
    return false;
  end if;
  select coalesce(m.officer_title, ''), coalesce(m.membership_status, '')
    into v_title, v_status
  from public.members m
  where m.id = v_member
    and m.merged_into is null;
  if not found or v_status not in ('active', 'pending-renewal') then
    return false;
  end if;
  if to_regprocedure('public.kos_title_keys_in(text)') is not null then
    execute 'select ''chair_charity'' = any (public.kos_title_keys_in($1))'
      into v_ok
      using v_title;
    if coalesce(v_ok, false) then
      return true;
    end if;
  end if;
  -- Chair segment that names Charity. Vice President is a different segment
  -- and does not match. A title string can hold several jobs.
  if exists (
    select 1
    from unnest(regexp_split_to_array(coalesce(v_title, ''), '\s*[·|,;]\s*')) seg
    where btrim(seg) ~* 'charit'
      and btrim(seg) ~* '(co[ -]?chair|committee chair|\ychair\y)'
      and btrim(seg) !~* 'vice'
  ) then
    return true;
  end if;
  return false;
end;
$$;

comment on function public.kos_is_charity_chair() is
  'True for the Charity/Fundraising chair title. Not Vice President, and not a general officer.';

revoke all on function public.kos_is_charity_chair() from public, anon;
grant execute on function public.kos_is_charity_chair() to authenticated;

create or replace function public.kos_can_view_donations()
returns boolean
language plpgsql
stable
security definer
set search_path to public
as $$
declare
  v_payments boolean := false;
begin
  if auth.uid() is null then
    return false;
  end if;
  if to_regprocedure('public.can_view_payments()') is not null then
    execute 'select public.can_view_payments()' into v_payments;
  elsif to_regprocedure('public.has_tool(text)') is not null then
    execute 'select public.has_tool($1)' into v_payments using 'payments';
  end if;
  return coalesce(v_payments, false) or public.kos_is_charity_chair();
end;
$$;

comment on function public.kos_can_view_donations() is
  'Payments roles (can_view_payments) plus the Charity Committee chair. Vice President is included only when they already have payments.';

revoke all on function public.kos_can_view_donations() from public, anon;
grant execute on function public.kos_can_view_donations() to authenticated;

create or replace function public.kos_create_donation_intent(p_amount_cents integer, p_note text)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
declare
  v_member uuid;
  v_note text;
  v_row public.donation_intents%rowtype;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'message', 'Please sign in to give from the Hub.');
  end if;
  v_member := public.kos_current_member_id();
  if v_member is null then
    return jsonb_build_object('ok', false, 'message', 'We could not find your member record. Please sign in again.');
  end if;
  if p_amount_cents is null or p_amount_cents < 100 or p_amount_cents > 100000000 then
    return jsonb_build_object('ok', false, 'message', 'Enter a gift of at least $1.');
  end if;
  v_note := nullif(btrim(coalesce(p_note, '')), '');
  if v_note is not null and char_length(v_note) > 500 then
    return jsonb_build_object('ok', false, 'message', 'Please keep your note to 500 characters.');
  end if;
  insert into public.donation_intents (member_id, amount_cents, note, status)
  values (v_member, p_amount_cents, v_note, 'pending')
  returning * into v_row;
  return jsonb_build_object(
    'ok', true,
    'intent', jsonb_build_object(
      'id', v_row.id,
      'amount_cents', v_row.amount_cents,
      'note', v_row.note,
      'status', v_row.status,
      'created_at', v_row.created_at,
      'matched', false
    )
  );
end;
$$;

revoke all on function public.kos_create_donation_intent(integer, text) from public, anon;
grant execute on function public.kos_create_donation_intent(integer, text) to authenticated;

create or replace function public.kos_list_my_donation_intents()
returns jsonb
language plpgsql
stable
security definer
set search_path to public
as $$
declare
  v_member uuid;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'message', 'Please sign in to see your gifts.');
  end if;
  v_member := public.kos_current_member_id();
  if v_member is null then
    return jsonb_build_object('ok', false, 'gifts', '[]'::jsonb);
  end if;
  return jsonb_build_object(
    'ok', true,
    'gifts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id,
        'amount_cents', i.amount_cents,
        'note', i.note,
        'status', i.status,
        'created_at', i.created_at,
        'matched', (i.status = 'paid' or i.payment_id is not null)
      ) order by i.created_at desc)
      from public.donation_intents i
      where i.member_id = v_member
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.kos_list_my_donation_intents() from public, anon;
grant execute on function public.kos_list_my_donation_intents() to authenticated;

-- Pull a note answer out of a Zeffy payload. The Give to the Krewe question
-- wins. Any other question whose label contains the word note is the fallback.
create or replace function public.kos_zeffy_donation_note(p_raw jsonb)
returns text
language plpgsql
stable
set search_path to public
as $$
declare
  v_node jsonb;
  v_queue jsonb[] := array[coalesce(p_raw, 'null'::jsonb)];
  v_depth int[] := array[0];
  v_i int;
  v_child jsonb;
  v_label text;
  v_answer text;
  v_gift text;
  v_other text;
  v_n int := 0;
begin
  if p_raw is null or jsonb_typeof(p_raw) = 'null' then
    return null;
  end if;
  while coalesce(cardinality(v_queue), 0) > 0 and v_n < 400 loop
    v_n := v_n + 1;
    v_node := v_queue[array_lower(v_queue, 1)];
    v_i := v_depth[array_lower(v_depth, 1)];
    v_queue := v_queue[array_lower(v_queue, 1) + 1 : array_upper(v_queue, 1)];
    v_depth := v_depth[array_lower(v_depth, 1) + 1 : array_upper(v_depth, 1)];
    if v_node is null or jsonb_typeof(v_node) = 'null' then
      continue;
    end if;
    if jsonb_typeof(v_node) = 'object' then
      v_label := lower(btrim(coalesce(
        case when jsonb_typeof(v_node->'question') = 'string' then v_node->>'question' else null end,
        case when jsonb_typeof(v_node->'question') = 'object'
          then coalesce(v_node#>>'{question,text}', v_node#>>'{question,label}', v_node#>>'{question,title}')
          else null end,
        v_node->>'label',
        v_node->>'name',
        v_node->>'title',
        ''
      )));
      v_answer := btrim(coalesce(
        case when jsonb_typeof(v_node->'answer') = 'string' then v_node->>'answer'
             when jsonb_typeof(v_node->'answer') = 'object' then coalesce(v_node#>>'{answer,text}', v_node#>>'{answer,value}')
             else null end,
        case when jsonb_typeof(v_node->'value') = 'string' then v_node->>'value' else null end,
        case when jsonb_typeof(v_node->'response') = 'string' then v_node->>'response' else null end,
        ''
      ));
      if v_answer <> '' and v_label not like '%email%' then
        if v_label like '%note with your gift%' then
          v_gift := coalesce(v_gift, v_answer);
        elsif v_label ~ '\mnote\M' and v_other is null then
          v_other := v_answer;
        end if;
      end if;
      if v_i < 8 then
        for v_child in select value from jsonb_each(v_node) loop
          if jsonb_typeof(v_child) in ('object', 'array') then
            v_queue := v_queue || v_child;
            v_depth := v_depth || (v_i + 1);
          end if;
        end loop;
      end if;
    elsif jsonb_typeof(v_node) = 'array' and v_i < 8 then
      for v_child in select value from jsonb_array_elements(v_node) loop
        if jsonb_typeof(v_child) in ('object', 'array') then
          v_queue := v_queue || v_child;
          v_depth := v_depth || (v_i + 1);
        end if;
      end loop;
    end if;
  end loop;
  return nullif(btrim(coalesce(v_gift, v_other, '')), '');
end;
$$;

revoke all on function public.kos_zeffy_donation_note(jsonb) from public, anon;
grant execute on function public.kos_zeffy_donation_note(jsonb) to authenticated;

do $$
begin
  if to_regprocedure('public.kos_html_esc(text)') is null then
    execute $fn$
      create function public.kos_html_esc(t text)
      returns text
      language sql
      immutable
      set search_path to ''
      as $body$
        select replace(replace(replace(replace(coalesce(t, ''),
          '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;');
      $body$;
    $fn$;
  end if;
end $$;

create or replace function public.kos_apply_donation_payment(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
declare
  pay public.payments%rowtype;
  v_pick public.donation_intents%rowtype;
  v_existing public.donation_intents%rowtype;
  v_one public.donation_intents%rowtype;
  v_count int := 0;
  v_note text;
  v_first text;
  v_date text;
  v_total text;
  v_body text;
  v_hello text;
  v_updated uuid;
begin
  if nullif(btrim(coalesce(p->>'payment_id', '')), '') is not null then
    select * into pay from public.payments where id = (p->>'payment_id')::uuid;
  end if;
  if pay.id is null and nullif(btrim(coalesce(p->>'provider_payment_id', '')), '') is not null then
    select * into pay
    from public.payments
    where provider = 'zeffy'
      and provider_payment_id = p->>'provider_payment_id'
    order by created_at desc
    limit 1;
  end if;
  if pay.id is null then
    return jsonb_build_object('ok', false, 'reason', 'payment_not_found');
  end if;
  if pay.product_kind is distinct from 'donation' then
    return jsonb_build_object('ok', false, 'reason', 'not_donation');
  end if;

  select * into v_existing
  from public.donation_intents
  where payment_id = pay.id
  limit 1;

  if v_existing.id is null then
    select i.* into v_pick
    from public.donation_intents i
    join public.members m on m.id = i.member_id
    where i.status = 'pending'
      and i.payment_id is null
      and (
        (pay.member_id is not null and i.member_id = pay.member_id)
        or (
          nullif(btrim(coalesce(pay.payer_email, '')), '') is not null
          and lower(m.email) = lower(pay.payer_email)
          and m.merged_into is null
        )
      )
      and i.amount_cents = pay.amount_cents
      and i.created_at >= pay.created_at - interval '24 hours'
      and i.created_at <= pay.created_at + interval '5 minutes'
    order by i.created_at desc, i.id desc
    limit 1;

    if v_pick.id is null then
      select count(*) into v_count
      from public.donation_intents i
      join public.members m on m.id = i.member_id
      where i.status = 'pending'
        and i.payment_id is null
        and (
          (pay.member_id is not null and i.member_id = pay.member_id)
          or (
            nullif(btrim(coalesce(pay.payer_email, '')), '') is not null
            and lower(m.email) = lower(pay.payer_email)
            and m.merged_into is null
          )
        );
      if v_count = 1 then
        select i.* into v_one
        from public.donation_intents i
        join public.members m on m.id = i.member_id
        where i.status = 'pending'
          and i.payment_id is null
          and (
            (pay.member_id is not null and i.member_id = pay.member_id)
            or (
              nullif(btrim(coalesce(pay.payer_email, '')), '') is not null
              and lower(m.email) = lower(pay.payer_email)
              and m.merged_into is null
            )
          )
        limit 1;
        if v_one.amount_cents is distinct from pay.amount_cents then
          v_pick := v_one;
        end if;
      end if;
    end if;

    if v_pick.id is not null then
      v_updated := null;
      update public.donation_intents
         set payment_id = pay.id,
             status = 'paid',
             updated_at = now()
       where id = v_pick.id
         and payment_id is null
         and status = 'pending'
       returning id into v_updated;
      if v_updated is null then
        v_pick.id := null;
        v_pick.note := null;
        v_pick.member_id := null;
      elsif pay.member_id is null then
        update public.payments
           set member_id = v_pick.member_id
         where id = pay.id
           and member_id is null;
        pay.member_id := v_pick.member_id;
      end if;
    end if;
  else
    v_pick := v_existing;
  end if;

  v_note := nullif(btrim(coalesce(v_pick.note, '')), '');
  if v_note is null then
    v_note := nullif(btrim(coalesce(p->>'zeffy_note', '')), '');
  end if;
  if v_note is null then
    v_note := public.kos_zeffy_donation_note(pay.raw);
  end if;

  if lower(coalesce(pay.status, '')) in ('succeeded', 'paid', 'completed', 'complete', 'succeded')
     and nullif(btrim(coalesce(pay.payer_email, '')), '') is not null
  then
    perform pg_advisory_xact_lock(hashtext('donation_thanks:' || pay.id::text));
    if not exists (
      select 1 from public.outbound_emails
      where purpose = 'donation_thanks:' || pay.id::text
    ) then
      v_first := split_part(coalesce(pay.payer_name, ''), ' ', 1);
      v_date := to_char(pay.created_at at time zone 'America/New_York', 'FMMonth FMDD, YYYY');
      v_total := '$' || to_char(coalesce(pay.amount_cents, 0) / 100.0, 'FM999990.00');
      v_hello := case
        when v_first <> '' then 'Hi ' || public.kos_html_esc(v_first) || ','
        else 'Hi,'
      end;
      v_body := '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1f2d24">'
        || '<div style="background:#0b5d33;color:#fff;padding:18px 22px;border-radius:10px 10px 0 0">'
        || '<div style="font-size:20px;font-weight:700">Krewe of Shamrock</div>'
        || '<div style="font-size:14px;opacity:.9">With thanks</div></div>'
        || '<div style="border:1px solid #d9e6dc;border-top:0;padding:22px;border-radius:0 0 10px 10px">'
        || '<p>' || v_hello || '</p>'
        || '<p>Thank you for your gift of <b>' || public.kos_html_esc(v_total) || '</b> on '
        || public.kos_html_esc(v_date)
        || '. Your kindness helps the Krewe show up for Tampa Bay kids and families. We are glad you are with us.</p>'
        || case when v_note is not null then
             '<p style="background:#eef6f0;padding:12px 14px;border-radius:8px">Your note: '
             || public.kos_html_esc(v_note) || '</p>'
           else '' end
        || '<p>Zeffy emails the official tax receipt separately. Please look for that message from Zeffy when you need it for your records.</p>'
        || '<p>With gratitude,<br>Krewe of Shamrock</p></div></div>';
      perform public.enqueue_email(
        pay.payer_email,
        pay.payer_name,
        'Thank you for your gift to the Krewe of Shamrock',
        v_body,
        'donation_thanks:' || pay.id::text,
        coalesce(v_pick.member_id, pay.member_id)
      );
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'payment_id', pay.id,
    'matched', v_pick.id is not null,
    'intent_id', v_pick.id,
    'note', v_note
  );
end;
$$;

revoke all on function public.kos_apply_donation_payment(jsonb) from public, anon, authenticated;
grant execute on function public.kos_apply_donation_payment(jsonb) to service_role;

comment on function public.kos_apply_donation_payment(jsonb) is
  'Match a donation payment to a Hub intent and queue one thank-you. Idempotent per payment via donation_thanks:<id>. Service role and the payments trigger only.';

create or replace function public.kos_payment_is_donation(p_raw jsonb, p_description text)
returns boolean
language plpgsql
stable
security definer
set search_path to public
as $$
declare
  v_blob text := lower(coalesce(p_raw::text, '') || ' ' || coalesce(p_description, ''));
  v_url text := lower(coalesce(public.kos_donation_form_url(), ''));
  v_slug text;
begin
  if position('/donation-form/' in v_blob) > 0 or position('/donation/' in v_blob) > 0 then
    return true;
  end if;
  if position('give to the krewe' in v_blob) > 0 then
    return true;
  end if;
  if v_url <> '' and position('placeholder' in v_url) = 0 then
    v_slug := regexp_replace(rtrim(v_url, '/'), '^.*/', '');
    if v_slug <> '' and position(v_slug in v_blob) > 0 then
      return true;
    end if;
  end if;
  return false;
end;
$$;

revoke all on function public.kos_payment_is_donation(jsonb, text) from public, anon, authenticated;

create or replace function public.kos_payments_classify_donation()
returns trigger
language plpgsql
security definer
set search_path to public
as $$
begin
  if new.product_kind in ('store', 'background_check') then
    return new;
  end if;
  if coalesce(new.description, '') ilike '%locker%' then
    return new;
  end if;
  if public.kos_payment_is_donation(new.raw, new.description) then
    new.product_kind := 'donation';
    new.event_id := null;
  end if;
  return new;
end;
$$;

drop trigger if exists kos_payments_classify_donation on public.payments;
create trigger kos_payments_classify_donation
  before insert on public.payments
  for each row execute function public.kos_payments_classify_donation();

create or replace function public.kos_payments_apply_donation()
returns trigger
language plpgsql
security definer
set search_path to public
as $$
begin
  if new.product_kind = 'donation' then
    begin
      perform public.kos_apply_donation_payment(jsonb_build_object('payment_id', new.id));
    exception when others then
      raise warning 'donation apply failed for %: %', new.id, sqlerrm;
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists kos_payments_apply_donation on public.payments;
create trigger kos_payments_apply_donation
  after insert on public.payments
  for each row execute function public.kos_payments_apply_donation();

revoke all on function public.kos_payments_classify_donation() from public, anon, authenticated;
revoke all on function public.kos_payments_apply_donation() from public, anon, authenticated;

create or replace function public.kos_list_donations()
returns jsonb
language plpgsql
stable
security definer
set search_path to public
as $$
begin
  if auth.uid() is null or not public.kos_can_view_donations() then
    return jsonb_build_object('ok', false, 'message', 'These gifts are visible to the payments desk and the Charity chair.');
  end if;
  return jsonb_build_object(
    'ok', true,
    'rows', coalesce((
      select jsonb_agg(row_to_json(r)::jsonb order by r.created_at desc)
      from (
        select
          p.id as payment_id,
          p.created_at,
          p.amount_cents,
          p.payer_name as donor_name,
          p.payer_email,
          p.member_id,
          nullif(btrim(concat_ws(' ', m.first_name, m.last_name)), '') as member_name,
          coalesce(nullif(btrim(i.note), ''), public.kos_zeffy_donation_note(p.raw)) as note,
          case when i.id is not null then 'matched' else 'unmatched' end as match_status
        from public.payments p
        left join public.donation_intents i on i.payment_id = p.id
        left join public.members m on m.id = coalesce(i.member_id, p.member_id)
        where p.product_kind = 'donation'
          and lower(coalesce(p.status, '')) in ('succeeded', 'paid', 'completed', 'complete', 'succeded')
      ) r
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.kos_list_donations() from public, anon;
grant execute on function public.kos_list_donations() to authenticated;

comment on function public.kos_list_donations() is
  'Donation payments joined to matched intents: date, amount, donor, member, and note. Payments roles and the Charity chair.';

-- Officer-facing view. security_invoker so payments RLS still applies.
-- Charity chairs who cannot select payments should use kos_list_donations().
drop view if exists public.donation_ledger;
create view public.donation_ledger
with (security_invoker = true) as
select
  p.id as payment_id,
  p.created_at,
  p.amount_cents,
  p.payer_name as donor_name,
  p.payer_email,
  p.member_id,
  nullif(btrim(concat_ws(' ', m.first_name, m.last_name)), '') as member_name,
  coalesce(nullif(btrim(i.note), ''), public.kos_zeffy_donation_note(p.raw)) as note,
  i.id as intent_id,
  i.status as intent_status
from public.payments p
left join public.donation_intents i on i.payment_id = p.id
left join public.members m on m.id = coalesce(i.member_id, p.member_id)
where p.product_kind = 'donation'
  and public.kos_can_view_donations();

comment on view public.donation_ledger is
  'Donation payments with the matched Hub note. Visible only when kos_can_view_donations() is true. Invoker security keeps payments RLS in force.';

revoke all on table public.donation_ledger from public, anon;
grant select on table public.donation_ledger to authenticated;
