-- NOT APPLIED. Do not run this from the website, a webhook, or a script
-- against the live database. Paste it into the Supabase SQL editor only
-- after you have read it.
--
-- Project: oazwkwflgbthojvnclfc
-- Run after sql/kos_membership_pipeline_dashboard.sql.
-- Safe to run again.
--
-- Tim Birnley (0faff37d-3794-47e6-a665-ae47f87a4e53) and
-- Susan Dreisbaugh (6740f3b2-40ce-404d-9081-971d5f967752) are already
-- active members. This file records the finished journey so the pipeline
-- shows both of them as complete:
--   Background check paid Oct 31, 2026, $75 couple, one payment linked to both
--   Passed
--   Dues paid Nov 3, 2026, $375 each
--   Active
-- It does not change membership_status. It does not queue mail, and it does
-- not call the payment or invoice functions. The new applicant flow is only
-- for payments that arrive after this backfill.
--
-- Other payments still filed as other, whose text matches a background check
-- campaign, are refiled and linked the same way: history only, no status
-- change, no mail.

-- ---------------------------------------------------------------------------
-- 1) The known couple payment and the two dues rows.
-- ---------------------------------------------------------------------------
update public.payments
   set product_kind = 'background_check',
       member_id = '0faff37d-3794-47e6-a665-ae47f87a4e53',
       partner_member_id = '6740f3b2-40ce-404d-9081-971d5f967752',
       amount_cents = 7500,
       description = coalesce(nullif(btrim(description), ''), 'Krewe of Shamrock Background Check - Couple'),
       created_at = timestamptz '2026-10-31 15:00:00-04',
       raw = coalesce(raw, '{}'::jsonb) || jsonb_build_object(
         'background_check_chair_notified', 'skipped_backfill',
         'backfill', true,
         'do_not_email', true
       )
 where id = '8ebf108a-80c4-432a-9ce0-13ce7196d55c';

update public.members
   set partner_member_id = '6740f3b2-40ce-404d-9081-971d5f967752'
 where id = '0faff37d-3794-47e6-a665-ae47f87a4e53'
   and (partner_member_id is null or partner_member_id = '6740f3b2-40ce-404d-9081-971d5f967752');

update public.members
   set partner_member_id = '0faff37d-3794-47e6-a665-ae47f87a4e53'
 where id = '6740f3b2-40ce-404d-9081-971d5f967752'
   and (partner_member_id is null or partner_member_id = '0faff37d-3794-47e6-a665-ae47f87a4e53');

insert into public.payments (
  id, provider, provider_event_id, provider_payment_id,
  amount_cents, currency, status, payer_name, description,
  product_kind, member_id, created_at, raw
)
values
  (
    'b3750001-1113-4113-8000-0faff37d4e53',
    'backfill',
    'backfill-dues-0faff37d-3794-47e6-a665-ae47f87a4e53',
    'backfill-dues-0faff37d-3794-47e6-a665-ae47f87a4e53',
    37500, 'usd', 'succeeded', 'Tim Birnley', 'Krewe of Shamrock Membership',
    'dues', '0faff37d-3794-47e6-a665-ae47f87a4e53',
    timestamptz '2026-11-03 15:00:00-05',
    jsonb_build_object('backfill', true, 'do_not_email', true, 'background_check_chair_notified', 'skipped_backfill')
  ),
  (
    'b3750002-1113-4113-8000-6740f3b29677',
    'backfill',
    'backfill-dues-6740f3b2-40ce-404d-9081-971d5f967752',
    'backfill-dues-6740f3b2-40ce-404d-9081-971d5f967752',
    37500, 'usd', 'succeeded', 'Susan Dreisbaugh', 'Krewe of Shamrock Membership',
    'dues', '6740f3b2-40ce-404d-9081-971d5f967752',
    timestamptz '2026-11-03 15:00:00-05',
    jsonb_build_object('backfill', true, 'do_not_email', true, 'background_check_chair_notified', 'skipped_backfill')
  )
on conflict (provider_event_id) do update
  set product_kind = 'dues',
      amount_cents = 37500,
      member_id = excluded.member_id,
      created_at = excluded.created_at,
      raw = excluded.raw;

-- Paid dues rows for the tracker. Direct table write. No invoice function.
insert into public.dues_payments (
  member_id, membership_year, amount, due_date, paid, paid_date, payment_method,
  membership_level, standard_amount, notes
)
select v.member_id, 2026, 375, date '2026-11-03', true, date '2026-11-03', 'card',
       'full', 375, 'Recorded with the completed application. No dues email was sent.'
  from (values
    ('0faff37d-3794-47e6-a665-ae47f87a4e53'::uuid),
    ('6740f3b2-40ce-404d-9081-971d5f967752'::uuid)
  ) as v(member_id)
 where to_regclass('public.dues_payments') is not null
   and not exists (
     select 1 from public.dues_payments d
      where d.member_id = v.member_id
        and d.membership_year = 2026
   );

update public.dues_payments
   set paid = true,
       paid_date = date '2026-11-03',
       amount = case when coalesce(amount, 0) = 0 then 375 else amount end,
       payment_method = coalesce(nullif(payment_method, ''), 'card')
 where member_id in (
     '0faff37d-3794-47e6-a665-ae47f87a4e53',
     '6740f3b2-40ce-404d-9081-971d5f967752'
   )
   and membership_year = 2026
   and paid is distinct from true;

-- ---------------------------------------------------------------------------
-- 2) History for the finished journey. Status on the member row is not touched.
-- ---------------------------------------------------------------------------
insert into public.membership_application_actions (
  member_id, action, note, from_status, to_status, actor_name, created_at
)
select step.member_id, step.action, step.note, step.from_status, step.to_status,
       'Membership record', step.created_at
  from (values
    ('0faff37d-3794-47e6-a665-ae47f87a4e53'::uuid, 'background_check',
      'Joining packet sent.', 'pending-new', 'background-check',
      timestamptz '2026-10-24 15:00:00-04'),
    ('6740f3b2-40ce-404d-9081-971d5f967752'::uuid, 'background_check',
      'Joining packet sent.', 'pending-new', 'background-check',
      timestamptz '2026-10-24 15:00:00-04'),
    ('0faff37d-3794-47e6-a665-ae47f87a4e53'::uuid, 'background_check_paid',
      'Background check paid. Payment 8ebf108a-80c4-432a-9ce0-13ce7196d55c',
      'background-check', 'bg_paid', timestamptz '2026-10-31 15:00:00-04'),
    ('6740f3b2-40ce-404d-9081-971d5f967752'::uuid, 'background_check_paid',
      'Background check paid. Payment 8ebf108a-80c4-432a-9ce0-13ce7196d55c',
      'background-check', 'bg_paid', timestamptz '2026-10-31 15:00:00-04'),
    ('0faff37d-3794-47e6-a665-ae47f87a4e53'::uuid, 'dues_pending',
      'Passed background check. No dues email was sent from this record.',
      'bg_paid', 'dues-pending', timestamptz '2026-11-02 15:00:00-05'),
    ('6740f3b2-40ce-404d-9081-971d5f967752'::uuid, 'dues_pending',
      'Passed background check. No dues email was sent from this record.',
      'bg_paid', 'dues-pending', timestamptz '2026-11-02 15:00:00-05'),
    ('0faff37d-3794-47e6-a665-ae47f87a4e53'::uuid, 'dues_paid',
      'Dues paid $375.', 'dues-pending', 'dues-pending',
      timestamptz '2026-11-03 15:00:00-05'),
    ('6740f3b2-40ce-404d-9081-971d5f967752'::uuid, 'dues_paid',
      'Dues paid $375.', 'dues-pending', 'dues-pending',
      timestamptz '2026-11-03 15:00:00-05')
  ) as step(member_id, action, note, from_status, to_status, created_at)
 where exists (
     select 1 from public.members m
      where m.id = step.member_id
        and m.membership_status = 'active'
   )
   and not exists (
     select 1 from public.membership_application_actions a
      where a.member_id = step.member_id
        and a.action = step.action
        and a.note = step.note
   );

insert into public.membership_application_actions (
  member_id, action, note, from_status, to_status, actor_name, created_at
)
select m.id, 'approve',
       'Active member. No welcome email was sent from this record.',
       'dues-pending', 'active', 'Membership record',
       timestamptz '2026-11-04 15:00:00-05'
  from public.members m
 where m.id in (
     '0faff37d-3794-47e6-a665-ae47f87a4e53',
     '6740f3b2-40ce-404d-9081-971d5f967752'
   )
   and m.membership_status = 'active'
   and not exists (
     select 1 from public.membership_application_actions a
      where a.member_id = m.id
        and a.action = 'approve'
   );

-- ---------------------------------------------------------------------------
-- 3) Any other payment still filed as other that matches a background check
--    campaign. Link what we can. Leave status alone. Do not mail.
-- ---------------------------------------------------------------------------
do $generic$
declare
  r record;
  v_member uuid;
  v_partner uuid;
  v_couple boolean;
  v_status text;
  v_email text;
begin
  for r in
    select p.id, p.payer_email, p.payer_name, p.description, p.amount_cents, p.created_at, p.member_id, p.raw
      from public.payments p
     where p.product_kind = 'other'
       and p.id <> '8ebf108a-80c4-432a-9ce0-13ce7196d55c'
       and (
         coalesce(p.description, '') ~* 'background check'
         or coalesce(p.description, '') ~* 'krewe-of-shamrock-background-check'
         or coalesce(p.raw::text, '') ~* 'krewe-of-shamrock-background-check'
       )
  loop
    v_member := r.member_id;
    v_email := lower(btrim(coalesce(r.payer_email, '')));
    if v_member is null and v_email <> '' then
      select m.id into v_member
        from public.members m
       where m.merged_into is null
         and lower(btrim(coalesce(m.email, ''))) = v_email
       order by m.created_at
       limit 1;
    end if;

    v_couple := coalesce(r.amount_cents, 0) >= 7000
      or coalesce(r.description, '') ~* 'couple'
      or coalesce(r.raw::text, '') ~* 'background-check-couple';
    v_partner := null;
    if v_member is not null and (
      v_couple
      or exists (
        select 1 from public.members m
         where m.id = v_member and m.application_fee_type = 'dual'
      )
    ) then
      v_partner := public.kos_match_application_partner(v_member);
      if v_partner = v_member then
        v_partner := null;
      end if;
    end if;

    update public.payments
       set product_kind = 'background_check',
           member_id = coalesce(member_id, v_member),
           partner_member_id = coalesce(partner_member_id, v_partner),
           raw = coalesce(raw, '{}'::jsonb) || jsonb_build_object(
             'background_check_chair_notified', 'skipped_backfill',
             'backfill', true,
             'do_not_email', true
           )
     where id = r.id;

    if v_member is not null and v_partner is not null then
      update public.members
         set partner_member_id = v_partner
       where id = v_member
         and (partner_member_id is null or partner_member_id = v_partner);
      update public.members
         set partner_member_id = v_member
       where id = v_partner
         and (partner_member_id is null or partner_member_id = v_member);
    end if;

    if v_member is not null then
      select m.membership_status into v_status
        from public.members m
       where m.id = v_member;
      if not exists (
        select 1 from public.membership_application_actions a
         where a.member_id = v_member
           and a.action = 'background_check_paid'
           and a.note like '%' || r.id::text || '%'
      ) then
        insert into public.membership_application_actions (
          member_id, action, note, from_status, to_status, actor_name, created_at
        ) values (
          v_member,
          'background_check_paid',
          'Background check paid. Payment ' || r.id::text,
          v_status,
          v_status,
          'Membership record',
          coalesce(r.created_at, now())
        );
      end if;
      if v_partner is not null and not exists (
        select 1 from public.membership_application_actions a
         where a.member_id = v_partner
           and a.action = 'background_check_paid'
           and a.note like '%' || r.id::text || '%'
      ) then
        insert into public.membership_application_actions (
          member_id, action, note, from_status, to_status, actor_name, created_at
        ) values (
          v_partner,
          'background_check_paid',
          'Background check paid. Payment ' || r.id::text,
          v_status,
          v_status,
          'Membership record',
          coalesce(r.created_at, now())
        );
      end if;
    end if;
  end loop;
end
$generic$;
