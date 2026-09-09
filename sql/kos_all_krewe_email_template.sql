-- Branded All-Krewe email wrapper (Shamrock colors + crest).
-- Delta migration: apply after kos_all_krewe_messages.sql.
-- Safe to run more than once (create or replace).
--
-- wrap_all_krewe_email_html builds email-client-safe HTML (tables + inline CSS).
-- queue_broadcast wraps once before enqueue_email so every broadcast looks branded.
-- send_all_krewe_message still stores the officer-composed (unwrapped) body in
-- all_krewe_messages for history, and passes that same body to queue_broadcast.

-- 1) Brand wrapper -------------------------------------------------------------
create or replace function public.wrap_all_krewe_email_html(
  p_subject text,
  p_body_html text
)
returns text
language plpgsql
immutable
as $$
declare
  v_subject text := coalesce(p_subject, '');
  v_body text := coalesce(p_body_html, '');
  v_subj_esc text;
  v_logo text := 'https://www.kreweofshamrock.com/assets/img/emblem-shamrock.png';
  v_site text := 'https://www.kreweofshamrock.com/';
begin
  -- Already fully wrapped (marker comment or known class) — do not double-wrap.
  if position('<!-- kos-all-krewe-email -->' in v_body) > 0
     or v_body ~* 'class=["''][^"'']*kos-akm-wrap' then
    return v_body;
  end if;

  v_subj_esc := replace(replace(replace(replace(replace(v_subject,
    '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&#39;');

  return
    '<!-- kos-all-krewe-email -->' ||
    '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">' ||
    '<meta name="viewport" content="width=device-width,initial-scale=1">' ||
    '<title>' || v_subj_esc || '</title></head>' ||
    '<body style="margin:0;padding:0;background-color:#f6efdd;">' ||
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" ' ||
    'class="kos-akm-wrap" style="width:100%;background-color:#f6efdd;margin:0;padding:0;">' ||
    '<tr><td align="center" style="padding:24px 12px;">' ||

    -- Outer card
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" ' ||
    'style="width:600px;max-width:100%;background-color:#fbf7ec;border-radius:12px;' ||
    'overflow:hidden;border:1px solid #ecd07e;">' ||

    -- Header bar (deep green + gold bottom border)
    '<tr><td style="background-color:#0c3b21;background:linear-gradient(180deg,#14532d,#0c3b21);' ||
    'border-bottom:3px solid #d4af37;padding:18px 22px;">' ||
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">' ||
    '<tr>' ||
    '<td width="56" valign="middle" style="width:56px;padding-right:14px;">' ||
    '<img src="' || v_logo || '" width="48" height="48" alt="Krewe of Shamrock" ' ||
    'style="display:block;width:48px;height:48px;border:0;border-radius:50%;" />' ||
    '</td>' ||
    '<td valign="middle" style="font-family:Georgia,''Times New Roman'',serif;color:#ffffff;">' ||
    '<div style="font-size:20px;font-weight:700;letter-spacing:0.4px;line-height:1.2;">' ||
    'Krewe of Shamrock</div>' ||
    '<div style="font-size:12px;color:#ecd07e;margin-top:4px;letter-spacing:0.3px;">' ||
    'Since 1999</div>' ||
    '</td>' ||
    '</tr></table>' ||
    '</td></tr>' ||

    -- Gold accent line
    '<tr><td style="height:4px;line-height:4px;font-size:0;background-color:#d4af37;' ||
    'background:linear-gradient(90deg,#a9801c,#d4af37,#ecd07e,#d4af37,#a9801c);">&nbsp;</td></tr>' ||

    -- Content card
    '<tr><td style="background-color:#ffffff;padding:28px 26px 24px;' ||
    'font-family:Georgia,''Times New Roman'',serif;color:#23291f;font-size:16px;line-height:1.65;">' ||
    '<h1 style="margin:0 0 16px;font-family:Georgia,''Times New Roman'',serif;' ||
    'font-size:22px;line-height:1.25;color:#14532d;font-weight:700;">' ||
    v_subj_esc || '</h1>' ||
    '<div style="color:#23291f;">' || v_body || '</div>' ||
    '</td></tr>' ||

    -- Footer
    '<tr><td style="background-color:#e9f3ea;padding:16px 22px;border-top:1px solid #ecd07e;' ||
    'font-family:Georgia,''Times New Roman'',serif;font-size:12px;line-height:1.5;color:#5f6b5a;' ||
    'text-align:center;">' ||
    '<div style="margin:0 0 8px;font-weight:700;color:#14532d;">Krewe of Shamrock · Office</div>' ||
    '<div style="line-height:1.7;">' ||
    '<a href="mailto:patrick@kreweofshamrock.com" style="color:#1b6b39;text-decoration:none;">patrick@kreweofshamrock.com</a><br>' ||
    '<a href="mailto:secretary@kreweofshamrock.com" style="color:#1b6b39;text-decoration:none;">secretary@kreweofshamrock.com</a><br>' ||
    '<a href="mailto:treasurer@kreweofshamrock.com" style="color:#1b6b39;text-decoration:none;">treasurer@kreweofshamrock.com</a><br>' ||
    '<a href="mailto:digital@kreweofshamrock.com" style="color:#1b6b39;text-decoration:none;">digital@kreweofshamrock.com</a>' ||
    '</div>' ||
    '<div style="margin-top:10px;">' ||
    '<a href="' || v_site || '" style="color:#1b6b39;text-decoration:underline;">' ||
    'www.kreweofshamrock.com</a></div>' ||
    '</td></tr>' ||

    '</table>' ||
    '</td></tr></table>' ||
    '</body></html>';
end;
$$;

revoke all on function public.wrap_all_krewe_email_html(text, text) from public;
revoke all on function public.wrap_all_krewe_email_html(text, text) from anon;
grant execute on function public.wrap_all_krewe_email_html(text, text) to authenticated;

-- 2) queue_broadcast — wrap once before enqueue --------------------------------
create or replace function public.queue_broadcast(
  p_subject text,
  p_body_html text,
  p_segment text default 'active'
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_segment text := lower(coalesce(nullif(btrim(p_segment), ''), 'active'));
  v_subject text := nullif(btrim(p_subject), '');
  v_body_in text := nullif(btrim(p_body_html), '');
  v_body text;
  v_count integer := 0;
  r record;
begin
  if not public.is_krewe_officer() then
    raise exception 'Officers only';
  end if;
  if v_subject is null then
    raise exception 'Subject is required';
  end if;
  if v_body_in is null then
    raise exception 'Message body is required';
  end if;
  if v_segment not in ('active', 'officers', 'all') then
    raise exception 'Segment must be active, officers, or all';
  end if;

  -- Brand every broadcast with the Shamrock email frame (idempotent if already wrapped).
  v_body := public.wrap_all_krewe_email_html(v_subject, v_body_in);

  if v_segment = 'active' then
    for r in
      select member_id, first_name, last_name, email from public.v_active_member_emails
    loop
      perform public.enqueue_email(
        r.email,
        nullif(btrim(coalesce(r.first_name, '') || ' ' || coalesce(r.last_name, '')), ''),
        v_subject,
        v_body,
        'broadcast',
        r.member_id
      );
      v_count := v_count + 1;
    end loop;
  elsif v_segment = 'officers' then
    for r in
      select member_id, first_name, last_name, email from public.v_officer_emails
    loop
      perform public.enqueue_email(
        r.email,
        nullif(btrim(coalesce(r.first_name, '') || ' ' || coalesce(r.last_name, '')), ''),
        v_subject,
        v_body,
        'broadcast',
        r.member_id
      );
      v_count := v_count + 1;
    end loop;
  else
    for r in
      select member_id, first_name, last_name, email from public.v_active_member_emails
      union
      select member_id, first_name, last_name, email from public.v_lapsed_member_emails
    loop
      perform public.enqueue_email(
        r.email,
        nullif(btrim(coalesce(r.first_name, '') || ' ' || coalesce(r.last_name, '')), ''),
        v_subject,
        v_body,
        'broadcast',
        r.member_id
      );
      v_count := v_count + 1;
    end loop;
  end if;

  return v_count;
end;
$$;

revoke all on function public.queue_broadcast(text, text, text) from public;
revoke all on function public.queue_broadcast(text, text, text) from anon;
grant execute on function public.queue_broadcast(text, text, text) to authenticated;

-- 3) send_all_krewe_message — history keeps officer body; queue wraps ----------
create or replace function public.send_all_krewe_message(
  p_subject text,
  p_body_html text,
  p_segment text default 'active'
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_segment text := lower(coalesce(nullif(btrim(p_segment), ''), 'active'));
  v_subject text := nullif(btrim(p_subject), '');
  v_body text := nullif(btrim(p_body_html), '');
  v_count integer;
  v_id uuid;
begin
  if not public.is_krewe_officer() then
    return jsonb_build_object('ok', false, 'message', 'Officers only.');
  end if;
  if v_subject is null then
    return jsonb_build_object('ok', false, 'message', 'Subject is required.');
  end if;
  if v_body is null then
    return jsonb_build_object('ok', false, 'message', 'Message body is required.');
  end if;
  if v_segment not in ('active', 'officers', 'all') then
    return jsonb_build_object('ok', false, 'message', 'Invalid segment.');
  end if;

  -- Pass officer-composed HTML; queue_broadcast applies the branded wrapper once.
  v_count := public.queue_broadcast(v_subject, v_body, v_segment);

  -- Persist the unwrapped officer body for readable history in the Officer desk.
  insert into public.all_krewe_messages (subject, body_html, sent_by, recipient_count, segment)
  values (v_subject, v_body, auth.uid(), v_count, v_segment)
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'id', v_id,
    'recipient_count', v_count,
    'segment', v_segment,
    'message', 'Queued for ' || v_count || ' recipient(s).'
  );
end;
$$;

revoke all on function public.send_all_krewe_message(text, text, text) from public;
revoke all on function public.send_all_krewe_message(text, text, text) from anon;
grant execute on function public.send_all_krewe_message(text, text, text) to authenticated;
