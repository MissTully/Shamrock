-- All Krewe Messages (Officer desk broadcast).
-- Applied to the Krewe of Shamrock / Tribe Test workflow as migration kos_all_krewe_messages.
-- Safe to run more than once.
--
-- Officers compose a message in Member Hub → Officer desk → All Krewe Messages.
-- Each send is queued through the existing outbound_emails / Resend pipeline via
-- queue_broadcast(subject, html, 'active'), and a row is saved in all_krewe_messages.

-- 1) History table --------------------------------------------------------------
create table if not exists public.all_krewe_messages (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  body_html text not null,
  sent_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  recipient_count integer,
  segment text not null default 'active'
);

alter table public.all_krewe_messages
  add column if not exists subject text,
  add column if not exists body_html text,
  add column if not exists sent_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists recipient_count integer,
  add column if not exists segment text not null default 'active';

do $$ begin
  alter table public.all_krewe_messages drop constraint if exists all_krewe_messages_segment_check;
  alter table public.all_krewe_messages
    add constraint all_krewe_messages_segment_check
    check (segment in ('active', 'officers', 'all'));
exception when others then null; end $$;

create index if not exists all_krewe_messages_created_at_idx
  on public.all_krewe_messages (created_at desc);

alter table public.all_krewe_messages enable row level security;

drop policy if exists "Officers can read all krewe messages" on public.all_krewe_messages;
create policy "Officers can read all krewe messages"
  on public.all_krewe_messages for select to authenticated
  using (public.is_krewe_officer());

drop policy if exists "Officers can insert all krewe messages" on public.all_krewe_messages;
create policy "Officers can insert all krewe messages"
  on public.all_krewe_messages for insert to authenticated
  with check (public.is_krewe_officer());

-- No update/delete policies: history is append-only from the client.

-- 2) Segment views (always-current mailing lists) ------------------------------
-- Prefer existing definitions if already present; recreate to match the guide.
create or replace view public.v_active_member_emails as
  select m.id as member_id, m.first_name, m.last_name, lower(m.email) as email
  from public.members m
  where m.membership_status = 'active'
    and m.email is not null
    and position('@' in m.email) > 0;

create or replace view public.v_officer_emails as
  select m.id as member_id, m.first_name, m.last_name, lower(m.email) as email
  from public.members m
  where m.membership_status = 'active'
    and m.member_role in ('officer', 'captain', 'board')
    and m.email is not null
    and position('@' in m.email) > 0;

create or replace view public.v_lapsed_member_emails as
  select m.id as member_id, m.first_name, m.last_name, lower(m.email) as email
  from public.members m
  where m.membership_status = 'lapsed'
    and m.email is not null
    and position('@' in m.email) > 0;

-- 3) queue_broadcast — shared outbound pipeline entry (officers only) ----------
-- Matches EMAIL_AND_PHASE4_GUIDE.md: segments 'active' | 'officers' | 'all'.
-- Returns how many recipients were queued into outbound_emails.
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
  v_body text := nullif(btrim(p_body_html), '');
  v_count integer := 0;
  r record;
begin
  if not public.is_krewe_officer() then
    raise exception 'Officers only';
  end if;
  if v_subject is null then
    raise exception 'Subject is required';
  end if;
  if v_body is null then
    raise exception 'Message body is required';
  end if;
  if v_segment not in ('active', 'officers', 'all') then
    raise exception 'Segment must be active, officers, or all';
  end if;

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
    -- 'all' = active + lapsed (still current/recent membership contact list)
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

-- 4) Officer RPCs used by the Officer desk UI ---------------------------------
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

  -- Current membership = active segment (default for All Krewe Messages).
  v_count := public.queue_broadcast(v_subject, v_body, v_segment);

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

create or replace function public.list_all_krewe_messages(p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 200));
begin
  if not public.is_krewe_officer() then
    return jsonb_build_object('ok', false, 'message', 'Officers only.', 'messages', '[]'::jsonb);
  end if;
  return jsonb_build_object(
    'ok', true,
    'messages', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc)
      from (
        select id, subject, body_html, sent_by, created_at, recipient_count, segment
        from public.all_krewe_messages
        order by created_at desc
        limit v_limit
      ) x
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.list_all_krewe_messages(integer) from public;
revoke all on function public.list_all_krewe_messages(integer) from anon;
grant execute on function public.list_all_krewe_messages(integer) to authenticated;
