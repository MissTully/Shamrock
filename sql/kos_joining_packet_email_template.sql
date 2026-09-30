-- Joining packet email: chairs edit the greeting and the explanatory
-- paragraphs. The finish button, background check pay buttons, and dues
-- notes and pay buttons stay out of that text.
--
-- APPLY THIS IN THE SUPABASE SQL EDITOR. The website deploy does not run it.
--   Project: oazwkwflgbthojvnclfc
--   Melissa applies this file. Do not apply it from the site deploy.
--   Run after sql/kos_prospect_background_check_email.sql.
--   Safe to run again. A second run does not overwrite a saved draft.
--
-- Does not turn prospect email on. This file never updates
-- kos_runtime_flags key membership_prospect_emails.
--
-- Send joining packet (Move to background check) reads the saved draft
-- through kos_prospect_background_check_email_html. Payment web addresses
-- stay in background_check_payments and kos_dues_catalog. They are not
-- columns on the template and they are not accepted in the free text.
--
-- If you run sql/kos_membership_application_staged.sql,
-- sql/kos_membership_background_check_invoice.sql, or
-- sql/kos_prospect_background_check_email.sql again, run this file again
-- afterward.

-- ---------------------------------------------------------------------------
-- 1) One draft row. Reviewers write it only through the functions below.
-- ---------------------------------------------------------------------------
create table if not exists public.kos_joining_packet_template (
  id text primary key,
  subject text not null,
  greeting text not null,
  intro text not null,
  finish_heading text not null,
  finish_body text not null,
  finish_after text not null,
  fee_heading text not null,
  fee_intro text not null,
  dues_heading text not null,
  dues_intro text not null,
  closing text not null,
  signoff text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

comment on table public.kos_joining_packet_template is
  'Draft copy for the joining packet email. Editable greeting and paragraphs only. Pay links are not stored here.';

alter table public.kos_joining_packet_template enable row level security;
revoke all on table public.kos_joining_packet_template from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2) Default letter. Same words as the original joining packet.
-- ---------------------------------------------------------------------------
create or replace function public.kos_joining_packet_email_defaults()
returns jsonb
language sql
immutable
set search_path = public
as $defaults$
  select jsonb_build_object(
    'subject', $s$We're glad you're joining the Krewe$s$,
    'greeting', $s$Dear {{first_name}},$s$,
    'intro', $s$We're so glad you're joining the Krewe of Shamrock. We're excited to have you. The Membership Chair has opened the background check, and the rest of this note is simply how to finish joining, whenever you're ready.$s$,
    'finish_heading', $s$Let's finish your application$s$,
    'finish_body', $s$When you have a quiet moment, open your private link and finish the full application. It asks for a driver's license number and a Social Security number. We use those only for the background check, and we hold them confidentially.$s$,
    'finish_after', $s$This email doesn't include those numbers. Your link expires in 21 days.$s$,
    'fee_heading', $s$Your background check fee$s$,
    'fee_intro', $s$This fee is separate from membership dues. Pick the one that matches your application.$s$,
    'dues_heading', $s$Pick the membership that fits$s$,
    'dues_intro', $s$Membership dues are separate from the background check fee. Read the short note for each level, then use that level's button when it feels right. If you choose Auxiliary, that fee already includes the background check and the membership portion, so you don't also pay the background check above. If you're not sure which level fits, write to treasurer@kreweofshamrock.com and we'll help before you pay.$s$,
    'closing', $s$Welcome to the Krewe. We can't wait to have you with us.$s$,
    'signoff', $s$Sláinte,$s$ || chr(10) || $s$Krewe of Shamrock$s$
  );
$defaults$;

revoke all on function public.kos_joining_packet_email_defaults() from public, anon, authenticated;

comment on function public.kos_joining_packet_email_defaults() is
  'Internal. Default joining packet subject and paragraphs. No payment web addresses.';

insert into public.kos_joining_packet_template (
  id, subject, greeting, intro, finish_heading, finish_body, finish_after,
  fee_heading, fee_intro, dues_heading, dues_intro, closing, signoff
)
select
  'draft',
  d->>'subject',
  d->>'greeting',
  d->>'intro',
  d->>'finish_heading',
  d->>'finish_body',
  d->>'finish_after',
  d->>'fee_heading',
  d->>'fee_intro',
  d->>'dues_heading',
  d->>'dues_intro',
  d->>'closing',
  d->>'signoff'
from (select public.kos_joining_packet_email_defaults() as d) seed
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 3) Keep web addresses and markup out of the free text.
-- ---------------------------------------------------------------------------
create or replace function public.kos_joining_packet_text_problem(
  p_label text,
  p_text text,
  p_max integer
)
returns text
language plpgsql
immutable
set search_path = public
as $problem$
declare
  v_text text := btrim(coalesce(p_text, ''));
  v_opens integer;
  v_tokens integer;
begin
  if v_text = '' then
    return 'Add the ' || p_label || ' before you save.';
  end if;
  if char_length(v_text) > p_max then
    return 'The ' || p_label || ' is too long.';
  end if;
  if position('—' in v_text) > 0 or position('–' in v_text) > 0 then
    return 'Use a period or a comma instead of a long dash in the ' || p_label || '.';
  end if;
  if v_text ~* 'https?://'
     or v_text ~* 'www\.'
     or v_text ~* 'zeffy\.com'
     or position('token=' in lower(v_text)) > 0
     or v_text ~ '<[a-zA-Z/!]' then
    return 'Payment links and web addresses stay out of the ' || p_label || '. The finish button and pay buttons are added automatically.';
  end if;
  v_opens := (char_length(v_text) - char_length(replace(v_text, '{{', ''))) / 2;
  v_tokens := (char_length(v_text) - char_length(replace(v_text, '{{first_name}}', ''))) / char_length('{{first_name}}');
  if v_opens <> v_tokens then
    return 'The only placeholder is {{first_name}}.';
  end if;
  return null;
end;
$problem$;

revoke all on function public.kos_joining_packet_text_problem(text, text, integer) from public, anon, authenticated;

create or replace function public.kos_joining_packet_template_check(p_template jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $check$
declare
  v_key text;
  v_label text;
  v_max integer;
  v_problem text;
  v_clean jsonb := '{}'::jsonb;
begin
  if p_template is null or jsonb_typeof(p_template) <> 'object' then
    return jsonb_build_object('ok', false, 'message', 'The letter needs a subject and the explanatory paragraphs.');
  end if;
  for v_key, v_label, v_max in
    select item_key, item_label, item_max
      from (values
        ('subject'::text, 'subject'::text, 140),
        ('greeting'::text, 'greeting'::text, 180),
        ('intro'::text, 'opening'::text, 2000),
        ('finish_heading'::text, 'application heading'::text, 120),
        ('finish_body'::text, 'application note'::text, 2000),
        ('finish_after'::text, 'note after the application button'::text, 2000),
        ('fee_heading'::text, 'background check heading'::text, 120),
        ('fee_intro'::text, 'background check note'::text, 2000),
        ('dues_heading'::text, 'membership heading'::text, 120),
        ('dues_intro'::text, 'membership note'::text, 2000),
        ('closing'::text, 'closing'::text, 2000),
        ('signoff'::text, 'sign-off'::text, 240)
      ) as fields(item_key, item_label, item_max)
  loop
    v_problem := public.kos_joining_packet_text_problem(v_label, p_template->>v_key, v_max);
    if v_problem is not null then
      return jsonb_build_object('ok', false, 'message', v_problem);
    end if;
    v_clean := v_clean || jsonb_build_object(v_key, btrim(p_template->>v_key));
  end loop;
  return jsonb_build_object('ok', true, 'template', v_clean);
end;
$check$;

revoke all on function public.kos_joining_packet_template_check(jsonb) from public, anon, authenticated;

create or replace function public.kos_joining_packet_email_copy()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $copy$
declare
  v_defaults jsonb := public.kos_joining_packet_email_defaults();
  v_row public.kos_joining_packet_template%rowtype;
begin
  select * into v_row
    from public.kos_joining_packet_template
   where id = 'draft';
  if not found then
    return v_defaults;
  end if;
  return jsonb_build_object(
    'subject', coalesce(nullif(btrim(v_row.subject), ''), v_defaults->>'subject'),
    'greeting', coalesce(nullif(btrim(v_row.greeting), ''), v_defaults->>'greeting'),
    'intro', coalesce(nullif(btrim(v_row.intro), ''), v_defaults->>'intro'),
    'finish_heading', coalesce(nullif(btrim(v_row.finish_heading), ''), v_defaults->>'finish_heading'),
    'finish_body', coalesce(nullif(btrim(v_row.finish_body), ''), v_defaults->>'finish_body'),
    'finish_after', coalesce(nullif(btrim(v_row.finish_after), ''), v_defaults->>'finish_after'),
    'fee_heading', coalesce(nullif(btrim(v_row.fee_heading), ''), v_defaults->>'fee_heading'),
    'fee_intro', coalesce(nullif(btrim(v_row.fee_intro), ''), v_defaults->>'fee_intro'),
    'dues_heading', coalesce(nullif(btrim(v_row.dues_heading), ''), v_defaults->>'dues_heading'),
    'dues_intro', coalesce(nullif(btrim(v_row.dues_intro), ''), v_defaults->>'dues_intro'),
    'closing', coalesce(nullif(btrim(v_row.closing), ''), v_defaults->>'closing'),
    'signoff', coalesce(nullif(btrim(v_row.signoff), ''), v_defaults->>'signoff')
  );
end;
$copy$;

revoke all on function public.kos_joining_packet_email_copy() from public, anon, authenticated;

comment on function public.kos_joining_packet_email_copy() is
  'Internal. Saved joining packet draft, or the default letter when no draft is stored.';

create or replace function public.kos_joining_packet_email_subject()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    nullif(btrim(public.kos_joining_packet_email_copy()->>'subject'), ''),
    'We''re glad you''re joining the Krewe'
  );
$$;

revoke all on function public.kos_joining_packet_email_subject() from public, anon, authenticated;

comment on function public.kos_joining_packet_email_subject() is
  'Internal. Subject line for Send joining packet.';

create or replace function public.kos_joining_packet_fill(p_text text, p_first_name text)
returns text
language sql
immutable
set search_path = public
as $$
  select replace(
    replace(
      replace(
        public.kos_email_plain(coalesce(p_text, '')),
        '{{first_name}}',
        public.kos_email_plain(coalesce(nullif(btrim(p_first_name), ''), 'friend'))
      ),
      E'\r\n',
      '<br>'
    ),
    E'\n',
    '<br>'
  );
$$;

revoke all on function public.kos_joining_packet_fill(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4) Letter body. Template prose, then locked blocks from flags and catalog.
-- ---------------------------------------------------------------------------
create or replace function public.kos_prospect_background_check_email_html(
  p_first_name text,
  p_application_url text,
  p_template jsonb
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $html$
declare
  v_name text := coalesce(nullif(btrim(p_first_name), ''), 'friend');
  v_app text := btrim(coalesce(p_application_url, ''));
  v_html text := '';
  v_year integer := extract(year from current_date)::integer;
  v_bg jsonb := '{}'::jsonb;
  v_defaults jsonb := public.kos_joining_packet_email_defaults();
  v_tpl jsonb := '{}'::jsonb;
  v_item jsonb;
  v_key text;
  v_label text;
  v_explainer text;
  v_button text;
  v_link text;
  v_amount numeric;
  v_money text;
  v_fallback_amount numeric;
  v_fallback_explainer text;
  v_title text;
  v_level text;
  v_greeting text;
  v_intro text;
  v_finish_heading text;
  v_finish_body text;
  v_finish_after text;
  v_fee_heading text;
  v_fee_intro text;
  v_dues_heading text;
  v_dues_intro text;
  v_closing text;
  v_signoff text;
  v_btn_style text := 'display:inline-block;background:#14532d;color:#ffffff;padding:12px 18px;border-radius:999px;text-decoration:none;font-weight:700;';
begin
  if v_app !~ '^https://www\.kreweofshamrock\.com/membership-full-application\.html\?token=[0-9a-f]{64}$' then
    v_app := '';
  end if;

  if p_template is null then
    v_tpl := public.kos_joining_packet_email_copy();
  else
    v_tpl := v_defaults || p_template;
  end if;
  v_greeting := coalesce(nullif(btrim(v_tpl->>'greeting'), ''), v_defaults->>'greeting');
  v_intro := coalesce(nullif(btrim(v_tpl->>'intro'), ''), v_defaults->>'intro');
  v_finish_heading := coalesce(nullif(btrim(v_tpl->>'finish_heading'), ''), v_defaults->>'finish_heading');
  v_finish_body := coalesce(nullif(btrim(v_tpl->>'finish_body'), ''), v_defaults->>'finish_body');
  v_finish_after := coalesce(nullif(btrim(v_tpl->>'finish_after'), ''), v_defaults->>'finish_after');
  v_fee_heading := coalesce(nullif(btrim(v_tpl->>'fee_heading'), ''), v_defaults->>'fee_heading');
  v_fee_intro := coalesce(nullif(btrim(v_tpl->>'fee_intro'), ''), v_defaults->>'fee_intro');
  v_dues_heading := coalesce(nullif(btrim(v_tpl->>'dues_heading'), ''), v_defaults->>'dues_heading');
  v_dues_intro := coalesce(nullif(btrim(v_tpl->>'dues_intro'), ''), v_defaults->>'dues_intro');
  v_closing := coalesce(nullif(btrim(v_tpl->>'closing'), ''), v_defaults->>'closing');
  v_signoff := coalesce(nullif(btrim(v_tpl->>'signoff'), ''), v_defaults->>'signoff');

  if to_regclass('public.kos_dues_catalog') is not null
     and not exists (
       select 1 from public.kos_dues_catalog
        where membership_year = v_year and active
     ) then
    select max(membership_year) into v_year
      from public.kos_dues_catalog
     where active;
  end if;

  if to_regclass('public.kos_runtime_flags') is not null then
    select coalesce(value, '{}'::jsonb) into v_bg
      from public.kos_runtime_flags
     where key = 'background_check_payments';
    v_bg := coalesce(v_bg, '{}'::jsonb);
  end if;

  v_html :=
    '<p>' || public.kos_joining_packet_fill(v_greeting, v_name) || '</p>'
    || '<p>' || public.kos_joining_packet_fill(v_intro, v_name) || '</p>'
    || '<h2 style="font-size:18px;margin:22px 0 8px;color:#14532d;">'
    || public.kos_joining_packet_fill(v_finish_heading, v_name) || '</h2>'
    || '<p>' || public.kos_joining_packet_fill(v_finish_body, v_name) || '</p>';

  if v_app <> '' then
    v_html := v_html
      || '<p style="margin:8px 0 18px;"><a href="' || v_app || '" style="' || v_btn_style || '">Finish your application</a></p>';
  else
    v_html := v_html
      || '<p>Your private link isn''t in this note. Please ask the Membership Chair to send it again, and we''ll get you sorted.</p>';
  end if;

  v_html := v_html
    || '<p>' || public.kos_joining_packet_fill(v_finish_after, v_name) || '</p>'
    || '<h2 style="font-size:18px;margin:22px 0 8px;color:#14532d;">'
    || public.kos_joining_packet_fill(v_fee_heading, v_name) || '</h2>'
    || '<p>' || public.kos_joining_packet_fill(v_fee_intro, v_name) || '</p>';

  for v_key, v_label, v_fallback_amount, v_fallback_explainer, v_button in
    select item_key, item_label, item_amount, item_explainer, item_button
      from (values
        ('individual'::text, 'Individual'::text, 50::numeric, 'Just you on the application.'::text, 'Pay the individual fee'::text),
        ('couple'::text, 'Couple'::text, 75::numeric, 'The two of you, applying together.'::text, 'Pay the couple fee'::text)
      ) as fee(item_key, item_label, item_amount, item_explainer, item_button)
  loop
    v_item := coalesce(v_bg -> v_key, '{}'::jsonb);
    if nullif(btrim(v_item->>'label'), '') is not null then
      v_label := btrim(v_item->>'label');
    end if;
    if nullif(btrim(v_item->>'explainer'), '') is not null then
      v_explainer := btrim(v_item->>'explainer');
    else
      v_explainer := v_fallback_explainer;
    end if;
    if coalesce(v_item->>'amount', '') ~ '^[0-9]+(\.[0-9]+)?$' then
      v_amount := (v_item->>'amount')::numeric;
    else
      v_amount := v_fallback_amount;
    end if;
    v_link := nullif(btrim(v_item->>'url'), '');
    v_money := case
      when v_amount = trunc(v_amount) then '$' || trim(to_char(v_amount, 'FM999990'))
      else '$' || trim(to_char(v_amount, 'FM999990.00'))
    end;
    v_html := v_html
      || '<h3 style="margin:16px 0 6px;font-size:17px;color:#14532d;">'
      || public.kos_email_plain(v_label) || ', ' || v_money || '</h3>'
      || '<p style="margin:0 0 8px;">' || public.kos_email_plain(v_explainer) || '</p>';
    if v_link is not null then
      v_html := v_html
        || '<p style="margin:8px 0 18px;"><a href="' || public.kos_html_text(v_link)
        || '" style="' || v_btn_style || '">' || public.kos_email_plain(v_button) || '</a></p>';
    else
      v_html := v_html
        || '<p style="margin:0 0 18px;">We don''t have that pay link ready yet. Please write to treasurer@kreweofshamrock.com before you pay, and please don''t send card numbers by email.</p>';
    end if;
  end loop;

  v_html := v_html
    || '<h2 style="font-size:18px;margin:22px 0 8px;color:#14532d;">'
    || public.kos_joining_packet_fill(v_dues_heading, v_name) || '</h2>'
    || '<p>' || public.kos_joining_packet_fill(v_dues_intro, v_name) || '</p>';

  for v_level, v_title, v_button, v_fallback_amount, v_fallback_explainer in
    select item_level, item_title, item_button, item_amount, item_explainer
      from (values
        ('full'::text, 'Full Krewe Membership'::text, 'Pay Full Krewe dues'::text, 375::numeric,
          'You''re a voting member, and you march in all the parades. You also share the 12/12 volunteer commitment: 12 hours in the Krewe year (June through May), or $12 for each hour you don''t work.'::text),
        ('associate'::text, 'Associate'::text, 'Pay Associate dues'::text, 450::numeric,
          'This is for one year. You can join two parades of your choice. There''s no vote, and you don''t take on the 12/12 volunteer commitment.'::text),
        ('auxiliary'::text, 'Auxiliary'::text, 'Pay Auxiliary dues'::text, 200::numeric,
          'This is a non-voting membership for one major parade. The fee already includes the background check and the membership portion.'::text),
        ('loa'::text, 'Leave of Absence (LOA)'::text, 'Pay leave of absence dues'::text, 100::numeric,
          'This is our social membership for a year when you''d like to step back and still stay connected. That''s leave of absence.'::text)
      ) as levels(item_level, item_title, item_button, item_amount, item_explainer)
  loop
    v_amount := v_fallback_amount;
    v_explainer := v_fallback_explainer;
    v_link := null;
    if to_regclass('public.kos_dues_catalog') is not null and v_year is not null then
      select c.amount,
             coalesce(nullif(btrim(c.explainer), ''), v_fallback_explainer),
             nullif(btrim(c.zeffy_url), '')
        into v_amount, v_explainer, v_link
        from public.kos_dues_catalog c
       where c.membership_year = v_year
         and c.level = v_level
         and c.active
       limit 1;
      if not found then
        v_amount := v_fallback_amount;
        v_explainer := v_fallback_explainer;
        v_link := null;
      end if;
    end if;
    v_money := case
      when v_amount = trunc(v_amount) then '$' || trim(to_char(v_amount, 'FM999990'))
      else '$' || trim(to_char(v_amount, 'FM999990.00'))
    end;
    v_html := v_html
      || '<h3 style="margin:16px 0 6px;font-size:17px;color:#14532d;">'
      || public.kos_email_plain(v_title) || ', ' || v_money || '</h3>'
      || '<p style="margin:0 0 8px;">' || public.kos_email_plain(v_explainer) || '</p>';
    if v_link is not null then
      v_html := v_html
        || '<p style="margin:8px 0 18px;"><a href="' || public.kos_html_text(v_link)
        || '" style="' || v_btn_style || '">' || public.kos_email_plain(v_button) || '</a></p>';
    else
      v_html := v_html
        || '<p style="margin:0 0 18px;">We don''t have that pay link ready yet. Please write to treasurer@kreweofshamrock.com before you pay, and please don''t send card numbers by email.</p>';
    end if;
  end loop;

  v_html := v_html
    || '<p>' || public.kos_joining_packet_fill(v_closing, v_name) || '</p>'
    || '<p>' || public.kos_joining_packet_fill(v_signoff, v_name) || '</p>';

  return v_html;
end;
$html$;

revoke all on function public.kos_prospect_background_check_email_html(text, text, jsonb) from public, anon, authenticated;

comment on function public.kos_prospect_background_check_email_html(text, text, jsonb) is
  'Internal. Joining packet body. Paragraphs come from the draft template. The finish link, background check pay buttons, and dues notes and pay buttons are filled from the token, runtime flags, and kos_dues_catalog.';

create or replace function public.kos_prospect_background_check_email_html(
  p_first_name text,
  p_application_url text
)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select public.kos_prospect_background_check_email_html(p_first_name, p_application_url, null::jsonb);
$$;

revoke all on function public.kos_prospect_background_check_email_html(text, text) from public, anon, authenticated;

comment on function public.kos_prospect_background_check_email_html(text, text) is
  'Internal. Joining packet body for Send joining packet. Reads the saved draft. Not a client API.';

-- ---------------------------------------------------------------------------
-- 5) Reviewers read, preview, and save the draft. Preview does not send mail.
-- ---------------------------------------------------------------------------
create or replace function public.get_joining_packet_email_template()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $get$
declare
  v_updated timestamptz;
begin
  if auth.uid() is null or not public.can_review_applications() then
    return jsonb_build_object('ok', false, 'message', 'You do not have access to membership applications.');
  end if;
  select updated_at into v_updated
    from public.kos_joining_packet_template
   where id = 'draft';
  return jsonb_build_object(
    'ok', true,
    'template', public.kos_joining_packet_email_copy(),
    'updated_at', v_updated
  );
end;
$get$;

revoke all on function public.get_joining_packet_email_template() from public, anon;
grant execute on function public.get_joining_packet_email_template() to authenticated;

comment on function public.get_joining_packet_email_template() is
  'Reviewers only. Current joining packet subject and paragraphs. Does not return payment web addresses.';

create or replace function public.preview_joining_packet_email(p_template jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $preview$
declare
  v_check jsonb;
  v_clean jsonb;
  v_url text := 'https://www.kreweofshamrock.com/membership-full-application.html?token=' || repeat('a', 64);
  v_html text;
begin
  if auth.uid() is null or not public.can_review_applications() then
    return jsonb_build_object('ok', false, 'message', 'You do not have access to membership applications.');
  end if;
  v_check := public.kos_joining_packet_template_check(p_template);
  if coalesce(v_check->>'ok', '') <> 'true' then
    return v_check;
  end if;
  v_clean := v_check->'template';
  v_html := public.kos_prospect_background_check_email_html('Nia', v_url, v_clean);
  return jsonb_build_object(
    'ok', true,
    'sample_name', 'Nia',
    'subject', v_clean->>'subject',
    'html', v_html
  );
end;
$preview$;

revoke all on function public.preview_joining_packet_email(jsonb) from public, anon;
grant execute on function public.preview_joining_packet_email(jsonb) to authenticated;

comment on function public.preview_joining_packet_email(jsonb) is
  'Reviewers only. Preview the joining packet for the sample name Nia and a placeholder token. Does not send email.';

create or replace function public.save_joining_packet_email_template(p_template jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $save$
declare
  v_check jsonb;
  v_clean jsonb;
begin
  if auth.uid() is null or not public.can_review_applications() then
    return jsonb_build_object('ok', false, 'message', 'You do not have access to membership applications.');
  end if;
  v_check := public.kos_joining_packet_template_check(p_template);
  if coalesce(v_check->>'ok', '') <> 'true' then
    return v_check;
  end if;
  v_clean := v_check->'template';
  insert into public.kos_joining_packet_template (
    id, subject, greeting, intro, finish_heading, finish_body, finish_after,
    fee_heading, fee_intro, dues_heading, dues_intro, closing, signoff,
    updated_at, updated_by
  ) values (
    'draft',
    v_clean->>'subject',
    v_clean->>'greeting',
    v_clean->>'intro',
    v_clean->>'finish_heading',
    v_clean->>'finish_body',
    v_clean->>'finish_after',
    v_clean->>'fee_heading',
    v_clean->>'fee_intro',
    v_clean->>'dues_heading',
    v_clean->>'dues_intro',
    v_clean->>'closing',
    v_clean->>'signoff',
    now(),
    auth.uid()
  )
  on conflict (id) do update
    set subject = excluded.subject,
        greeting = excluded.greeting,
        intro = excluded.intro,
        finish_heading = excluded.finish_heading,
        finish_body = excluded.finish_body,
        finish_after = excluded.finish_after,
        fee_heading = excluded.fee_heading,
        fee_intro = excluded.fee_intro,
        dues_heading = excluded.dues_heading,
        dues_intro = excluded.dues_intro,
        closing = excluded.closing,
        signoff = excluded.signoff,
        updated_at = now(),
        updated_by = auth.uid();
  return jsonb_build_object(
    'ok', true,
    'template', v_clean,
    'message', 'Draft template saved. Send joining packet uses this letter. The finish link, the background check pay buttons, and the dues notes and pay buttons stay filled in automatically.'
  );
end;
$save$;

revoke all on function public.save_joining_packet_email_template(jsonb) from public, anon;
grant execute on function public.save_joining_packet_email_template(jsonb) to authenticated;

comment on function public.save_joining_packet_email_template(jsonb) is
  'Reviewers only. Save the joining packet draft. Does not send email. Rejects payment web addresses in the free text.';

-- ---------------------------------------------------------------------------
-- 6) Send joining packet uses the saved subject and the template body.
-- ---------------------------------------------------------------------------
create or replace function public.send_membership_full_application(
  p_member_id uuid,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $send$
declare
  rec public.members%rowtype;
  v_actor record;
  v_note text := nullif(left(btrim(public.kos_redact_id_text(coalesce(p_note, ''))), 1000), '');
  v_token text;
  v_hash text;
  v_link_id uuid;
  v_url text;
  v_html text;
  v_mail uuid;
  v_name text;
  v_pause text;
  v_subject text := 'We''re glad you''re joining the Krewe';
begin
  if auth.uid() is null or not public.can_review_applications() then
    return jsonb_build_object('ok', false, 'message', 'You do not have access to membership applications.');
  end if;
  if to_regprocedure('public.kos_membership_prospect_emails_enabled()') is not null
     and not public.kos_membership_prospect_emails_enabled() then
    v_pause := 'Prospect email is paused while this pipeline is in development. No full-application link was sent.';
    if to_regprocedure('public.kos_membership_prospect_emails_pause_message()') is not null then
      v_pause := v_pause || ' ' || public.kos_membership_prospect_emails_pause_message();
    end if;
    return jsonb_build_object(
      'ok', false,
      'emailed', false,
      'emails_paused', true,
      'message', v_pause
    );
  end if;
  if p_member_id is null then
    return jsonb_build_object('ok', false, 'message', 'Missing application.');
  end if;

  select * into rec
  from public.members
  where id = p_member_id
  for update;

  if not found or rec.merged_into is not null then
    return jsonb_build_object('ok', false, 'message', 'That application was not found.');
  end if;
  if rec.membership_status not in (
    'pending-new', 'background-check', 'dues-pending', 'pending-renewal', 'prospect'
  ) then
    return jsonb_build_object('ok', false, 'message', 'That application is no longer waiting for review.');
  end if;
  if rec.email is null or position('@' in rec.email) = 0 then
    return jsonb_build_object('ok', false, 'message', 'That application has no email address to send the link to.');
  end if;

  select * into v_actor from public._officer_actor();

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_hash := public.kos_application_token_hash(v_token);
  insert into public.membership_application_links (member_id, token_hash, expires_at, created_by)
  values (rec.id, v_hash, now() + interval '21 days', auth.uid())
  returning id into v_link_id;

  v_url := 'https://www.kreweofshamrock.com/membership-full-application.html?token=' || v_token;
  v_name := btrim(coalesce(rec.first_name, '') || ' ' || coalesce(rec.last_name, ''));
  v_html := public.kos_prospect_background_check_email_html(
    coalesce(nullif(btrim(rec.first_name), ''), 'friend'),
    v_url
  );
  v_subject := coalesce(nullif(btrim(public.kos_joining_packet_email_subject()), ''), v_subject);

  v_mail := public.enqueue_email(
    rec.email,
    nullif(v_name, ''),
    v_subject,
    v_html,
    'membership_full_application',
    rec.id
  );

  if v_mail is null then
    delete from public.membership_application_links where id = v_link_id;
    return jsonb_build_object(
      'ok', false,
      'message', 'Could not email the full application link. Nothing was sent.'
    );
  end if;

  update public.membership_application_links
     set expires_at = now()
   where member_id = rec.id
     and id <> v_link_id
     and used_at is null
     and expires_at > now();

  insert into public.membership_application_actions (
    member_id, action, note, from_status, to_status,
    actor_uid, actor_email, actor_name
  ) values (
    rec.id, 'full_application_sent', v_note, rec.membership_status, rec.membership_status,
    v_actor.uid, v_actor.email, v_actor.display_name
  );

  return jsonb_build_object(
    'ok', true,
    'emailed', true,
    'message', 'Full application sent. We emailed them a secure link to finish the full application, the background check payment, and each membership level with a short note and a pay link. The email does not include a Social Security number or a driver''s license number.'
  );
end;
$send$;

revoke all on function public.send_membership_full_application(uuid, text) from public, anon;
grant execute on function public.send_membership_full_application(uuid, text) to authenticated;
