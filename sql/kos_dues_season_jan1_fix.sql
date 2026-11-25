-- NOT APPLIED. Do not run this against the live project from the app,
-- a webhook, or a script. After review, paste this file into the Supabase
-- SQL editor for project oazwkwflgbthojvnclfc (Krewe of Shamrock) and run it.
-- Safe to re-run.
--
-- Keep paid dues for the June-May season from being treated as unpaid
-- on January 1. There is no pg_cron dues rollover job. The leftover risk
-- is code that still uses the calendar year.
--
-- kos_member_parade_ready still used extract(year from current_date)
-- and date_trunc('year', now()). The database TimeZone is UTC, so that
-- flips at 7:00 PM Eastern on December 31. This file matches the
-- function to public.kos_dues_season_year and the same June-May
-- meeting window as v_parade_ready. A 2026 paid row stays current
-- on January 1, 2027, and stays current through May 31, 2027.
-- June 1, 2027 starts membership year 2027.
--
-- officer_list_invoice_targets and officer_create_and_send_invoices
-- still defaulted a missing year to the calendar year. On January 1,
-- 2027 that would be 2027, so an officer invoice run could create a
-- new unpaid 2027 row for a member who already paid 2026 season dues.
-- The default is now public.kos_dues_season_year(). A year passed in
-- is unchanged. Existing paid rows are not updated.

-- ---------------------------------------------------------------------------
-- 1) Parade Ready badge helper (same season window as v_parade_ready)
-- ---------------------------------------------------------------------------
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
                and d.membership_year = public.kos_dues_season_year())
      or coalesce(m.member_role, '') in ('officer', 'captain', 'board')
      or exists (select 1 from public.profiles p
                 join public.member_roles r on r.user_id = p.id
                 where p.member_id = m.id
                   and r.role in ('officer', 'captain', 'board', 'treasurer', 'secretary'))
    )
    and exists (select 1 from public.waivers w
                where w.member_id = m.id
                  and w.season_year = public.kos_dues_season_year())
    and exists (select 1 from public.event_signups s
                join public.events e on e.id = s.event_id
                where s.member_id = m.id and s.status = 'attended'
                  and e.event_type = 'meeting' and e.is_mandatory
                  and (e.start_time at time zone 'America/New_York')::date
                      >= make_date(public.kos_dues_season_year(), 6, 1)
                  and (e.start_time at time zone 'America/New_York')::date
                      < make_date(public.kos_dues_season_year() + 1, 6, 1))
  from public.members m
  where m.id = p_member
    and m.merged_into is null
    and coalesce(m.membership_status, '') not in ('merged', 'declined', 'archived');
$$;

comment on function public.kos_member_parade_ready(uuid) is
  'Parade Ready gates use kos_dues_season_year (June-May). November 2026 and January 2027 both use membership year 2026.';

revoke all on function public.kos_member_parade_ready(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2) Officer invoice list: default year is the dues season, not the calendar year
-- ---------------------------------------------------------------------------
create or replace function public.officer_list_invoice_targets(
  p_filter text default 'unpaid',
  p_year integer default null,
  p_q text default '',
  p_limit integer default 80
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_filter text := lower(coalesce(nullif(btrim(p_filter), ''), 'unpaid'));
  v_year integer := coalesce(p_year, public.kos_dues_season_year());
  v_q text := lower(btrim(coalesce(p_q, '')));
  v_limit integer := greatest(1, least(coalesce(p_limit, 80), 200));
begin
  if not (public.is_krewe_officer() or public.has_tool('send_invoices')) then
    return jsonb_build_object('ok', false, 'message', 'Officers only.', 'targets', '[]'::jsonb);
  end if;
  if v_filter not in ('unpaid', 'active', 'search') then
    return jsonb_build_object('ok', false, 'message', 'Invalid filter.', 'targets', '[]'::jsonb);
  end if;

  if v_filter = 'unpaid' then
    return jsonb_build_object(
      'ok', true,
      'filter', v_filter,
      'year', v_year,
      'targets', coalesce((
        select jsonb_agg(to_jsonb(x) order by x.last_name, x.first_name)
        from (
          select d.member_id as id, m.first_name, m.last_name, lower(m.email) as email,
                 d.membership_year, d.amount, d.paid, d.due_date, d.id as dues_payment_id,
                 coalesce(m.officer_title, '') as officer_title
          from public.dues_payments d
          join public.members m on m.id = d.member_id
          where d.paid = false
            and m.merged_into is null
            and m.membership_status in ('active', 'lapsed', 'pending-renewal')
            and (p_year is null or d.membership_year = v_year)
          order by m.last_name, m.first_name
          limit v_limit
        ) x
      ), '[]'::jsonb)
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'filter', v_filter,
    'year', v_year,
    'targets', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.last_name, x.first_name)
      from (
        select m.id, m.first_name, m.last_name, lower(m.email) as email,
               v_year as membership_year,
               coalesce(d.amount, 375)::numeric as amount,
               coalesce(d.paid, false) as paid,
               d.due_date,
               d.id as dues_payment_id,
               coalesce(m.officer_title, '') as officer_title
        from public.members m
        left join public.dues_payments d
          on d.member_id = m.id and d.membership_year = v_year
        where m.merged_into is null
          and m.membership_status = 'active'
          and m.email is not null and position('@' in m.email) > 0
          and (
            v_filter = 'active'
            or v_q = ''
            or lower(m.first_name) like '%' || v_q || '%'
            or lower(m.last_name) like '%' || v_q || '%'
            or lower(m.email) like '%' || v_q || '%'
            or lower(m.first_name || ' ' || m.last_name) like '%' || v_q || '%'
          )
        order by m.last_name, m.first_name
        limit v_limit
      ) x
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.officer_list_invoice_targets(text, integer, text, integer) from public, anon;
grant execute on function public.officer_list_invoice_targets(text, integer, text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 3) Officer invoice create: default year is the dues season, not the calendar year
-- ---------------------------------------------------------------------------
create or replace function public.officer_create_and_send_invoices(
  p_member_ids uuid[],
  p_year integer default null,
  p_amount numeric default null,
  p_note text default null,
  p_invoice_type text default 'dues_year',
  p_send_email boolean default true,
  p_pay_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_year integer := coalesce(p_year, public.kos_dues_season_year());
  v_type text := lower(coalesce(nullif(btrim(p_invoice_type), ''), 'dues_year'));
  v_amount numeric;
  v_note text := nullif(btrim(p_note), '');
  v_pay text := coalesce(
    nullif(btrim(p_pay_url), ''),
    'https://www.zeffy.com/en-US/ticketing/krewe-of-shamrock-membership'
  );
  v_created integer := 0;
  v_updated integer := 0;
  v_emailed integer := 0;
  v_ids uuid[] := '{}';
  v_dues_ids uuid[] := '{}';
  r record;
  v_dues_id uuid;
  v_amt numeric;
  v_subj text;
  v_body text;
  v_body_wrapped text;
  v_log_id uuid;
  v_name text;
begin
  if not (public.is_krewe_officer() or public.has_tool('send_invoices')) then
    return jsonb_build_object('ok', false, 'message', 'Officers only.');
  end if;
  if p_member_ids is null or cardinality(p_member_ids) = 0 then
    return jsonb_build_object('ok', false, 'message', 'Pick at least one member.');
  end if;
  if v_type not in ('dues_year', 'custom') then
    return jsonb_build_object('ok', false, 'message', 'Invoice type must be dues_year or custom.');
  end if;
  if v_type = 'custom' and (p_amount is null or p_amount <= 0) then
    return jsonb_build_object('ok', false, 'message', 'Custom invoices need a positive amount.');
  end if;

  for r in
    select m.id, m.first_name, m.last_name, lower(m.email) as email
    from public.members m
    where m.id = any(p_member_ids)
      and m.merged_into is null
  loop
    v_amt := coalesce(p_amount, 375);
    select id, amount into v_dues_id, v_amount
    from public.dues_payments
    where member_id = r.id and membership_year = v_year
    limit 1;

    if v_dues_id is null then
      insert into public.dues_payments (member_id, membership_year, amount, due_date, paid, notes)
      values (
        r.id, v_year, v_amt,
        make_date(v_year, 6, 30),
        false,
        coalesce(v_note, case when v_type = 'custom' then 'Custom invoice' else 'Dues invoice' end)
      )
      returning id into v_dues_id;
      v_created := v_created + 1;
    else
      update public.dues_payments
         set amount = case when p_amount is not null then p_amount else amount end,
             notes = case
                       when v_note is not null then
                         trim(both from coalesce(notes, '') || case when coalesce(notes, '') = '' then '' else E'\n' end || v_note)
                       else notes
                     end,
             paid = case when paid then paid else false end
       where id = v_dues_id
         and paid = false;
      if found then v_updated := v_updated + 1; end if;
      select amount into v_amt from public.dues_payments where id = v_dues_id;
    end if;

    v_ids := array_append(v_ids, r.id);
    v_dues_ids := array_append(v_dues_ids, v_dues_id);

    if p_send_email and r.email is not null and position('@' in r.email) > 0 then
      if exists (select 1 from public.dues_payments where id = v_dues_id and paid = true) then
        continue;
      end if;
      v_name := nullif(btrim(coalesce(r.first_name, '') || ' ' || coalesce(r.last_name, '')), '');
      v_subj := 'Krewe of Shamrock dues invoice (' || v_year::text || ')';
      v_body :=
        '<p>Hi ' || coalesce(r.first_name, 'friend') || ',</p>' ||
        '<p>This is your Krewe of Shamrock membership invoice for <b>' || v_year::text || '</b>.</p>' ||
        '<p><b>Amount due:</b> $' || trim(to_char(v_amt, 'FM999990.00')) || '</p>' ||
        case when v_note is not null then '<p>' || replace(replace(v_note, '<', '&lt;'), '>', '&gt;') || '</p>' else '' end ||
        '<p>Please pay securely through our Zeffy membership form (no card numbers are collected in the Member Hub):</p>' ||
        '<p style="margin:18px 0;"><a href="' || v_pay || '" ' ||
        'style="display:inline-block;background:#14532d;color:#fff;padding:12px 18px;border-radius:999px;' ||
        'text-decoration:none;font-weight:700;">Pay dues on Zeffy</a></p>' ||
        '<p style="font-size:13px;color:#5f6b5a;">Or open Member Hub, Home, and use the Pay dues path when available.</p>' ||
        '<p>If you already paid, thank you. You can ignore this note.</p>' ||
        '<p>Slainte,<br>Krewe of Shamrock</p>';
      v_body_wrapped := public.wrap_all_krewe_email_html(v_subj, v_body);
      perform public.enqueue_email(r.email, v_name, v_subj, v_body_wrapped, 'invoice_notice', r.id);
      v_emailed := v_emailed + 1;
    end if;
  end loop;

  insert into public.officer_outreach_log
    (kind, audience, subject, body_html, recipient_count, member_ids, meta, sent_by)
  values (
    'invoice',
    v_type,
    'Invoices ' || v_year::text,
    coalesce(v_note, ''),
    cardinality(v_ids),
    v_ids,
    jsonb_build_object(
      'year', v_year,
      'amount', p_amount,
      'created', v_created,
      'updated', v_updated,
      'emailed', v_emailed,
      'dues_payment_ids', to_jsonb(v_dues_ids),
      'pay_url', v_pay,
      'send_email', p_send_email
    ),
    auth.uid()
  )
  returning id into v_log_id;

  return jsonb_build_object(
    'ok', true,
    'id', v_log_id,
    'created', v_created,
    'updated', v_updated,
    'emailed', v_emailed,
    'member_count', cardinality(v_ids),
    'year', v_year,
    'message', 'Created/updated ' || (v_created + v_updated)::text ||
               ' invoice(s)' ||
               case when p_send_email then '; queued ' || v_emailed::text || ' email notice(s).' else '.' end
  );
end;
$$;

revoke all on function public.officer_create_and_send_invoices(uuid[], integer, numeric, text, text, boolean, text) from public, anon;
grant execute on function public.officer_create_and_send_invoices(uuid[], integer, numeric, text, text, boolean, text) to authenticated;
