-- NOT APPLIED. Do not run this on the live database until the owner reviews it.
-- Project: oazwkwflgbthojvnclfc
-- Safe to re-run after that review.
--
-- Member roles and access, phase 1.
-- Officers change an official title and extra Officer Desk tools in one
-- save. The database decides access with has_tool(tool_key). A tool is on
-- when the member's title bundle includes it, an extra grant is active and
-- unexpired, or the member is a site admin.
--
-- Existing gate functions stay in place and gain an OR has_tool(...) check,
-- so people who can open a tool today still can. Grants are enforced in
-- those gates and in the officer RPCs this file patches. It does not rewrite
-- every table policy that calls is_krewe_officer() by itself.
--
-- Permission checklist (also covered by tests/roles-access-rules.test.mjs
-- and tests/sql/roles-access-harness.sql):
--   * Nobody can grant a tool to themselves or edit their own title.
--   * The Membership Chair can assign or remove committee chair titles only.
--   * President and site admins (Melissa and Doug) can change any title.
--   * An extra grant ends on the next June 30 (America/New_York) unless edited.
--   * A past end date does not allow the tool.
--   * A lapsed member's unexpired grant is paused, and it resumes when they
--     are active or pending-renewal again.
--   * The officer who made a change can undo it for 7 days. President and
--     site admins can always undo.
--   * Handover moves one title. Extra grants stay with the outgoing member
--     and are listed on the confirmation.
--   * Tools that came only from a removed title drop unless they are saved
--     as extra grants.
--   * If the grantor leaves office, the grant stays and is marked for review.

-- ---------------------------------------------------------------------------
-- 1) Catalogs, grants, audit, hub notices
-- ---------------------------------------------------------------------------

create table if not exists public.officer_tools (
  tool_key text primary key,
  label text not null,
  description text not null default '',
  section text not null,
  sort_order integer not null,
  report_group text,
  sensitive boolean not null default false
);

create table if not exists public.officer_titles (
  title_key text primary key,
  label text not null,
  kind text not null check (kind in ('officer', 'board', 'chair', 'co_chair')),
  committee text,
  sort_order integer not null,
  aliases text[] not null default '{}'
);

create table if not exists public.officer_title_tools (
  title_key text not null references public.officer_titles(title_key) on delete cascade,
  tool_key text not null references public.officer_tools(tool_key) on delete cascade,
  primary key (title_key, tool_key)
);

create table if not exists public.member_tool_grants (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  tool_key text not null references public.officer_tools(tool_key),
  granted_by uuid references public.members(id),
  note text,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references public.members(id),
  needs_review boolean not null default false,
  review_marked_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists member_tool_grants_open_idx
  on public.member_tool_grants (member_id, tool_key)
  where revoked_at is null;

create index if not exists member_tool_grants_member_idx
  on public.member_tool_grants (member_id, created_at desc);

create index if not exists member_tool_grants_grantor_idx
  on public.member_tool_grants (granted_by)
  where revoked_at is null;

create table if not exists public.member_access_audit (
  id uuid primary key default gen_random_uuid(),
  actor_member_id uuid,
  target_member_ids uuid[] not null default '{}',
  action text not null check (action in (
    'set_access', 'grant', 'revoke', 'handover', 'undo', 'chair_approve', 'chair_decline'
  )),
  summary text not null,
  before_state jsonb not null default '{}'::jsonb,
  after_state jsonb not null default '{}'::jsonb,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  undone_at timestamptz,
  undone_by uuid,
  undo_of uuid references public.member_access_audit(id)
);

create index if not exists member_access_audit_created_idx
  on public.member_access_audit (created_at desc);

create table if not exists public.hub_notices (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists hub_notices_member_idx
  on public.hub_notices (member_id, created_at desc);

comment on table public.member_tool_grants is
  'Extra Officer Desk tools. starts_at is when the grant begins. ends_at defaults to the next June 30, America/New_York.';

comment on column public.member_tool_grants.needs_review is
  'True when the person who granted the tool has left office. The grant still works.';

-- ---------------------------------------------------------------------------
-- 2) Seed the catalogs. Official titles only.
-- ---------------------------------------------------------------------------

insert into public.officer_tools (tool_key, label, description, section, sort_order, report_group, sensitive)
values
  ('applications', 'Membership Applications', 'Guide prospects from interest to active member.', 'Membership', 10, null, true),
  ('member_contacts', 'Member contacts', 'Contact info and committee interests.', 'Membership', 20, null, false),
  ('roles_access', 'Member roles and access', 'Set titles and Officer Desk tools.', 'Membership', 30, null, false),
  ('volunteer_inquiries', 'Volunteer inquiries', 'People who asked to help.', 'Charity', 40, null, false),
  ('approvals', 'Approvals', 'Volunteer hours, roles, clover claims, media, and record merges.', 'Approvals', 50, null, false),
  ('event_studio', 'Event Studio', 'Add or edit events, RSVP QR, and door check-in.', 'Events', 60, null, false),
  ('parade_guests', 'Parade guests', 'Guest march list per parade.', 'Events', 70, null, false),
  ('event_outreach', 'Event outreach', 'Website RSVPs, unmatched buyers, and legacy emails.', 'Events', 80, null, false),
  ('qr_studio', 'QR Code Studio', 'Meeting check-in and link QR codes.', 'Events', 90, null, false),
  ('doc_studio', 'Document Studio', 'Upload, publish, and hide library documents.', 'Documents', 100, null, false),
  ('shop_studio', 'Shop Studio', 'Products, pay links, and the shop QR.', 'Shop', 110, null, false),
  ('lockers', 'Locker rentals', 'Reservation list, inventory, and assigning a number.', 'Gear', 120, null, false),
  ('payments', 'Dues and Payments', 'Season dues, waivers, exports, and the payments ledger.', 'Money', 130, null, true),
  ('send_invoices', 'Send invoices', 'Level-based dues invoices and pay links.', 'Email and invoices', 140, null, true),
  ('dues_waivers', 'Dues waivers', 'Request, approve, or apply dues waivers.', 'Email and invoices', 150, null, true),
  ('email_members', 'Email members', 'Choose an audience and send.', 'Email and invoices', 160, null, false),
  ('all_krewe', 'All Krewe Messages', 'Email the full membership.', 'Email and invoices', 170, null, false),
  ('reports', 'Reports', 'Opens every report group this member already uses.', 'Reports', 180, null, false),
  ('reports.events', 'Event reports', 'Events and attendance.', 'Reports', 190, 'events', false),
  ('reports.merch', 'Merchandise reports', 'Shop and merchandise numbers.', 'Reports', 200, 'merch', false),
  ('reports.parades', 'Parade reports', 'Parade readiness.', 'Reports', 210, 'parades', false),
  ('reports.members', 'Member reports', 'Membership and roster reports.', 'Reports', 220, 'members', false),
  ('reports.finance', 'Finance reports', 'Dues and finance. Defaults to Treasurer, President, Finance chair, and site admins.', 'Reports', 230, 'finance', true)
on conflict (tool_key) do update set
  label = excluded.label,
  description = excluded.description,
  section = excluded.section,
  sort_order = excluded.sort_order,
  report_group = excluded.report_group,
  sensitive = excluded.sensitive;

insert into public.officer_titles (title_key, label, kind, committee, sort_order, aliases)
values
  ('president', 'President', 'officer', null, 10, '{}'),
  ('vice_president', 'Vice President', 'officer', null, 20, array['VP']),
  ('secretary', 'Secretary', 'officer', null, 30, '{}'),
  ('treasurer', 'Treasurer', 'officer', null, 40, '{}'),
  ('board_member', 'Board Member', 'board', null, 50, array['Board']),
  ('chair_membership', 'Committee Chair of Membership', 'chair', 'Membership', 60,
    array['Chair of Membership', 'Membership Chair', 'Membership Committee Chair']),
  ('chair_bylaws', 'Committee Chair of Bylaws and Rules', 'chair', 'Bylaws and Rules', 70,
    array['Committee Chair of Bylaws', 'Chair of Bylaws', 'Bylaws Chair', 'Chair of Bylaws and Rules']),
  ('chair_float', 'Committee Chair of Float', 'chair', 'Float', 80,
    array['Chair of Float', 'Float Chair']),
  ('chair_parade', 'Committee Chair of Parade', 'chair', 'Parade', 90,
    array['Chair of Parade', 'Parade Chair']),
  ('chair_social', 'Committee Chair of Social', 'chair', 'Social', 100,
    array['Chair of Social', 'Social Chair']),
  ('chair_charity', 'Committee Chair of Charity/Fundraising', 'chair', 'Charity/Fundraising', 110,
    array['Committee Chair of Charity', 'Chair of Charity', 'Charity Chair', 'Committee Chair of Charity/Fundraising']),
  ('chair_merchandise', 'Committee Chair of Merchandise', 'chair', 'Merchandise', 120,
    array['Chair of Merchandise', 'Merchandise Chair']),
  ('cochair_merchandise', 'Co-Chair of Merchandise', 'co_chair', 'Merchandise', 130,
    array['Co Chair of Merchandise', 'Merchandise Co-Chair', 'Merchandise Co Chair']),
  ('chair_finance', 'Committee Chair of Finance', 'chair', 'Finance', 140,
    array['Chair of Finance', 'Finance Chair']),
  ('chair_communication', 'Committee Chair of Communication', 'chair', 'Communication', 150,
    array['Chair of Communication', 'Communication Chair']),
  ('chair_technology', 'Chair of Technology', 'chair', 'Technology', 160,
    array['Committee Chair of Technology', 'Technology Chair', 'Chair of Technology'])
on conflict (title_key) do update set
  label = excluded.label,
  kind = excluded.kind,
  committee = excluded.committee,
  sort_order = excluded.sort_order,
  aliases = excluded.aliases;

-- Title bundles match the tools each title can open today, plus the new
-- report-group keys. The parent "reports" key keeps the full Reports tile
-- for officers who already have it. reports.finance is also on President,
-- Treasurer, and Finance chair. Merchandise chairs get reports.merch only.
insert into public.officer_title_tools (title_key, tool_key)
select t.title_key, x.tool_key
from public.officer_titles t
join lateral (
  select unnest(
    case t.title_key
      when 'president' then array[
        'member_contacts','volunteer_inquiries','approvals','lockers','event_studio','parade_guests','event_outreach',
        'shop_studio','qr_studio','doc_studio','reports','reports.events','reports.parades','reports.members','reports.finance',
        'all_krewe','email_members','roles_access','applications','payments','send_invoices','dues_waivers']
      when 'vice_president' then array[
        'member_contacts','volunteer_inquiries','approvals','lockers','event_studio','parade_guests','event_outreach',
        'shop_studio','qr_studio','doc_studio','reports','reports.events','reports.parades','reports.members',
        'all_krewe','email_members','roles_access']
      when 'secretary' then array[
        'member_contacts','volunteer_inquiries','approvals','lockers','event_studio','parade_guests','event_outreach',
        'shop_studio','qr_studio','doc_studio','reports','reports.events','reports.parades','reports.members',
        'all_krewe','email_members','roles_access','applications','payments','send_invoices','dues_waivers']
      when 'treasurer' then array[
        'member_contacts','volunteer_inquiries','approvals','lockers','event_studio','parade_guests','event_outreach',
        'shop_studio','qr_studio','doc_studio','reports','reports.events','reports.parades','reports.members','reports.finance',
        'all_krewe','email_members','roles_access','payments','send_invoices','dues_waivers']
      when 'board_member' then array[
        'member_contacts','volunteer_inquiries','approvals','lockers','event_studio','parade_guests','event_outreach',
        'shop_studio','qr_studio','doc_studio','reports','reports.events','reports.parades','reports.members',
        'all_krewe','email_members','roles_access']
      when 'chair_membership' then array[
        'member_contacts','volunteer_inquiries','approvals','lockers','event_studio','parade_guests','event_outreach',
        'shop_studio','qr_studio','doc_studio','reports','reports.events','reports.parades','reports.members',
        'all_krewe','email_members','roles_access','applications','payments','send_invoices','dues_waivers']
      when 'chair_finance' then array[
        'member_contacts','volunteer_inquiries','approvals','lockers','event_studio','parade_guests','event_outreach',
        'shop_studio','qr_studio','doc_studio','reports','reports.events','reports.parades','reports.members','reports.finance',
        'all_krewe','email_members','roles_access','payments','send_invoices','dues_waivers']
      when 'chair_technology' then array[
        'member_contacts','volunteer_inquiries','approvals','lockers','event_studio','parade_guests','event_outreach',
        'shop_studio','qr_studio','doc_studio','reports','reports.events','reports.parades','reports.members',
        'all_krewe','email_members','roles_access','applications','payments','send_invoices','dues_waivers']
      when 'chair_merchandise' then array['member_contacts','shop_studio','reports.merch','roles_access']
      when 'cochair_merchandise' then array['member_contacts','shop_studio','reports.merch','roles_access']
      else array[
        'member_contacts','volunteer_inquiries','approvals','lockers','event_studio','parade_guests','event_outreach',
        'shop_studio','qr_studio','doc_studio','reports','reports.events','reports.parades','reports.members',
        'all_krewe','email_members','roles_access']
    end
  ) as tool_key
) x on true
on conflict (title_key, tool_key) do nothing;

-- ---------------------------------------------------------------------------
-- 3) Helpers
-- ---------------------------------------------------------------------------

create or replace function public.kos_next_grant_end(p_on timestamptz default now())
returns timestamptz
language sql
stable
set search_path to 'public'
as $$
  with ny as (
    select (coalesce(p_on, now()) at time zone 'America/New_York')::date as d
  )
  select (
    make_date(
      case
        when extract(month from d)::int > 6 then extract(year from d)::int + 1
        when extract(month from d)::int = 6 and extract(day from d)::int >= 30
          then extract(year from d)::int + 1
        else extract(year from d)::int
      end,
      6,
      30
    ) + time '23:59:59'
  ) at time zone 'America/New_York'
  from ny;
$$;

create or replace function public.kos_end_of_ny_day(p_day date)
returns timestamptz
language sql
immutable
set search_path to 'public'
as $$
  select (p_day + time '23:59:59') at time zone 'America/New_York';
$$;

create or replace function public.kos_title_keys_in(p_title text)
returns text[]
language sql
stable
set search_path to 'public'
as $$
  select coalesce(array_agg(t.title_key order by t.sort_order), '{}'::text[])
  from public.officer_titles t
  where exists (
    select 1
    from unnest(regexp_split_to_array(coalesce(p_title, ''), '\s*[·|,;]\s*')) as seg(part)
    where btrim(seg.part) <> ''
      and (
        lower(btrim(seg.part)) = lower(t.label)
        or lower(btrim(seg.part)) = any (select lower(a) from unnest(t.aliases) as a)
      )
  );
$$;

create or replace function public.kos_legacy_title_bits(p_title text)
returns text[]
language sql
stable
set search_path to 'public'
as $$
  select coalesce(array_agg(btrim(seg.part) order by seg.ord), '{}'::text[])
  from unnest(regexp_split_to_array(coalesce(p_title, ''), '\s*[·|,;]\s*')) with ordinality as seg(part, ord)
  where btrim(seg.part) <> ''
    and not exists (
      select 1
      from public.officer_titles t
      where lower(btrim(seg.part)) = lower(t.label)
         or lower(btrim(seg.part)) = any (select lower(a) from unnest(t.aliases) as a)
    );
$$;

create or replace function public.kos_title_text(p_keys text[], p_legacy text[] default '{}')
returns text
language sql
stable
set search_path to 'public'
as $$
  select nullif(array_to_string(array(
    select label from (
      select t.label, t.sort_order as ord, 0 as src
      from public.officer_titles t
      where t.title_key = any (coalesce(p_keys, '{}'))
      union all
      select btrim(x), 1000 + n.ord, 1
      from unnest(coalesce(p_legacy, '{}')) with ordinality as n(x, ord)
      where btrim(x) <> ''
    ) bits
    order by src, ord
  ), ' · '), '');
$$;

create or replace function public.kos_tools_for_title_keys(p_keys text[])
returns text[]
language sql
stable
set search_path to 'public'
as $$
  select coalesce(array_agg(distinct tt.tool_key order by tt.tool_key), '{}'::text[])
  from public.officer_title_tools tt
  where tt.title_key = any (coalesce(p_keys, '{}'));
$$;

create or replace function public.kos_member_is_active_status(p_status text)
returns boolean
language sql
immutable
as $$
  select coalesce(p_status, 'active') in ('active', 'pending-renewal');
$$;

-- Site admins are the webmasters Melissa and Doug, matched the same way as
-- the older chair desk: known emails, or a webmaster title.
create or replace function public.kos_is_site_admin()
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_email text;
  v_title text;
begin
  select lower(coalesce(m.email, '')), coalesce(m.officer_title, '')
    into v_email, v_title
  from public.members m
  where m.id = public.kos_current_member_id();
  if coalesce(v_email, '') = '' then
    begin
      v_email := lower(coalesce(auth.jwt() ->> 'email', ''));
    exception when undefined_function then
      v_email := '';
    end;
  end if;
  if v_email in (
    'melissajotully@gmail.com',
    'melissa@encountive.com',
    'dougtully@protonmail.com',
    'doug@encountive.com',
    'doug@theonefor.ai'
  ) then
    return true;
  end if;
  return coalesce(v_title, '') ~* 'webmaster';
end;
$$;

create or replace function public.kos_row_holds_office(p_title text, p_role text, p_email text)
returns boolean
language sql
stable
set search_path to 'public'
as $$
  select
    lower(coalesce(p_email, '')) in (
      'melissajotully@gmail.com',
      'melissa@encountive.com',
      'dougtully@protonmail.com',
      'doug@encountive.com',
      'doug@theonefor.ai'
    )
    or coalesce(p_title, '') ~* 'webmaster'
    or coalesce(array_length(public.kos_title_keys_in(p_title), 1), 0) > 0
    or coalesce(p_role, '') in ('officer', 'board', 'captain');
$$;

create or replace function public.kos_member_active_grants(p_member uuid)
returns setof public.member_tool_grants
language sql
stable
security definer
set search_path to 'public'
as $$
  select g.*
  from public.member_tool_grants g
  where g.member_id = p_member
    and g.revoked_at is null
    and g.starts_at <= now()
    and (g.ends_at is null or g.ends_at > now());
$$;

create or replace function public.has_tool(p_tool text)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_member uuid;
  v_status text;
  v_title text;
  v_keys text[];
begin
  if auth.uid() is null or nullif(btrim(coalesce(p_tool, '')), '') is null then
    return false;
  end if;
  if not exists (select 1 from public.officer_tools t where t.tool_key = p_tool) then
    return false;
  end if;
  -- Site admins keep every tool so they can repair a roster row.
  if public.kos_is_site_admin() then
    return true;
  end if;
  v_member := public.kos_current_member_id();
  if v_member is null then
    return false;
  end if;
  select m.membership_status, m.officer_title
    into v_status, v_title
  from public.members m
  where m.id = v_member
    and m.merged_into is null;
  if not found or not public.kos_member_is_active_status(v_status) then
    return false;
  end if;
  v_keys := public.kos_title_keys_in(v_title);
  if p_tool = any (public.kos_tools_for_title_keys(v_keys)) then
    return true;
  end if;
  -- The parent Reports tool covers each report group.
  if p_tool like 'reports.%' and 'reports' = any (public.kos_tools_for_title_keys(v_keys)) then
    return true;
  end if;
  return exists (
    select 1
    from public.kos_member_active_grants(v_member) g
    where g.tool_key = p_tool
       or (p_tool like 'reports.%' and g.tool_key = 'reports')
  );
end;
$$;

comment on function public.has_tool(text) is
  'True from the member title bundle, an active unexpired grant, or site admin. Lapsed and inactive members do not get title tools or grants until they are active again.';

create or replace function public.kos_can_change_any_title()
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_title text;
  v_seg text;
begin
  if public.kos_is_site_admin() then
    return true;
  end if;
  select coalesce(m.officer_title, '') into v_title
  from public.members m
  where m.id = public.kos_current_member_id();
  if not found then
    return false;
  end if;
  foreach v_seg in array regexp_split_to_array(coalesce(v_title, ''), '\s*[·|,;]\s*') loop
    if lower(btrim(v_seg)) = 'president' then
      return true;
    end if;
  end loop;
  return 'president' = any (public.kos_title_keys_in(v_title));
end;
$$;

create or replace function public.kos_can_change_chair_titles()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.kos_can_change_any_title()
      or 'chair_membership' = any (public.kos_title_keys_in((
           select m.officer_title from public.members m where m.id = public.kos_current_member_id()
         )));
$$;

create or replace function public.kos_actor_is_officer_board_or_chair()
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_title text;
  v_role text;
  v_email text;
begin
  if public.kos_is_site_admin() then
    return true;
  end if;
  select m.officer_title, m.member_role, m.email
    into v_title, v_role, v_email
  from public.members m
  where m.id = public.kos_current_member_id();
  if public.kos_row_holds_office(v_title, v_role, v_email) then
    return true;
  end if;
  return exists (
    select 1
    from public.member_roles r
    where r.user_id = auth.uid()
      and r.role in ('board', 'officer', 'captain', 'treasurer', 'secretary', 'committee')
  );
end;
$$;

-- Tools the actor holds by title or role, not by an extra grant.
create or replace function public.kos_actor_grantable_tools()
returns text[]
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_tools text[] := '{}';
  v_title text;
  v_role text;
begin
  if public.kos_is_site_admin() then
    select coalesce(array_agg(tool_key order by sort_order), '{}') into v_tools from public.officer_tools;
    return v_tools;
  end if;
  if not public.kos_actor_is_officer_board_or_chair() then
    return '{}';
  end if;
  select m.officer_title into v_title
  from public.members m
  where m.id = public.kos_current_member_id();
  v_tools := public.kos_tools_for_title_keys(public.kos_title_keys_in(v_title));
  -- Role rows cover a title that has not been written on the roster yet.
  select m.member_role into v_role from public.members m where m.id = public.kos_current_member_id();
  if v_role = 'officer' then
    v_tools := v_tools || public.kos_tools_for_title_keys(array['vice_president']);
  elsif v_role = 'board' then
    v_tools := v_tools || public.kos_tools_for_title_keys(array['board_member']);
  end if;
  if exists (select 1 from public.member_roles r where r.user_id = auth.uid() and r.role = 'treasurer') then
    v_tools := v_tools || public.kos_tools_for_title_keys(array['treasurer']);
  end if;
  if exists (select 1 from public.member_roles r where r.user_id = auth.uid() and r.role = 'secretary') then
    v_tools := v_tools || public.kos_tools_for_title_keys(array['secretary']);
  end if;
  if exists (select 1 from public.member_roles r where r.user_id = auth.uid() and r.role = 'board') then
    v_tools := v_tools || public.kos_tools_for_title_keys(array['board_member']);
  end if;
  if exists (
    select 1 from public.member_roles r
    where r.user_id = auth.uid() and r.role = 'committee'
      and coalesce(r.committee, '') ~* 'merchandise|merch'
  ) then
    v_tools := v_tools || public.kos_tools_for_title_keys(array['cochair_merchandise']);
  end if;
  select coalesce(array_agg(distinct x order by x), '{}')
    into v_tools
  from unnest(coalesce(v_tools, '{}')) as x
  where x is not null and x <> '';
  return v_tools;
end;
$$;

create or replace function public.kos_actor_can_grant(p_tool text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.kos_is_site_admin()
      or p_tool = any (public.kos_actor_grantable_tools())
      or (
        p_tool like 'reports.%'
        and 'reports' = any (public.kos_actor_grantable_tools())
      );
$$;

create or replace function public.kos_role_for_titles(p_keys text[], p_current text)
returns text
language plpgsql
stable
set search_path to 'public'
as $$
declare
  v_kind text;
  v_key text;
  v_has_elected boolean := false;
  v_has_board boolean := false;
  v_has_merch boolean := false;
  v_has_other boolean := false;
begin
  if coalesce(array_length(p_keys, 1), 0) is null then
    if coalesce(p_current, '') in ('officer', 'board') then
      return 'member';
    end if;
    return coalesce(nullif(p_current, ''), 'member');
  end if;
  foreach v_key in array p_keys loop
    select kind into v_kind from public.officer_titles where title_key = v_key;
    if v_key in ('president', 'vice_president', 'secretary', 'treasurer') then
      v_has_elected := true;
    elsif v_kind = 'board' then
      v_has_board := true;
    elsif v_key in ('chair_merchandise', 'cochair_merchandise') then
      v_has_merch := true;
    elsif v_kind in ('chair', 'co_chair') then
      v_has_other := true;
    end if;
  end loop;
  if v_has_elected then
    return 'officer';
  end if;
  if v_has_board then
    return 'board';
  end if;
  if v_has_other then
    return case when p_current = 'board' then 'board' else 'officer' end;
  end if;
  if v_has_merch then
    return 'member';
  end if;
  return coalesce(nullif(p_current, ''), 'member');
end;
$$;

create or replace function public.kos_access_snapshot(p_member uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_row public.members%rowtype;
  v_grants jsonb;
begin
  select * into v_row from public.members where id = p_member;
  if not found then
    return '{}'::jsonb;
  end if;
  select coalesce(jsonb_agg(to_jsonb(g) order by g.tool_key), '[]'::jsonb)
    into v_grants
  from public.member_tool_grants g
  where g.member_id = p_member;
  return jsonb_build_object(
    'id', v_row.id,
    'officer_title', v_row.officer_title,
    'member_role', v_row.member_role,
    'membership_status', v_row.membership_status,
    'grants', v_grants
  );
end;
$$;

create or replace function public.kos_access_notice(p_member uuid, p_title text, p_body text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if p_member is null or coalesce(btrim(p_body), '') = '' then
    return;
  end if;
  insert into public.hub_notices (member_id, kind, title, body)
  values (p_member, 'access', left(coalesce(nullif(btrim(p_title), ''), 'Officer Desk update'), 140), left(p_body, 2000));
end;
$$;

create or replace function public.kos_access_write_audit(
  p_action text,
  p_summary text,
  p_targets uuid[],
  p_before jsonb,
  p_after jsonb,
  p_detail jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_id uuid;
begin
  insert into public.member_access_audit (
    actor_member_id, target_member_ids, action, summary, before_state, after_state, detail
  ) values (
    public.kos_current_member_id(),
    coalesce(p_targets, '{}'),
    p_action,
    left(coalesce(p_summary, p_action), 500),
    coalesce(p_before, '{}'::jsonb),
    coalesce(p_after, '{}'::jsonb),
    coalesce(p_detail, '{}'::jsonb)
  )
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.kos_mark_grantor_reviews(p_member uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_title text;
  v_role text;
  v_email text;
begin
  select officer_title, member_role, email into v_title, v_role, v_email
  from public.members where id = p_member;
  if public.kos_row_holds_office(v_title, v_role, v_email) then
    return;
  end if;
  update public.member_tool_grants
     set needs_review = true,
         review_marked_at = now()
   where granted_by = p_member
     and revoked_at is null
     and needs_review = false;
end;
$$;

create or replace function public.kos_sync_member_access_role(p_member uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if to_regprocedure('public.kos_sync_roster_role_grants(uuid)') is not null then
    perform public.kos_sync_roster_role_grants(p_member);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4) Read APIs
-- ---------------------------------------------------------------------------

create or replace function public.my_officer_tools()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_tools jsonb;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'message', 'Sign in to see your Officer Desk.');
  end if;
  select coalesce(jsonb_agg(t.tool_key order by t.sort_order), '[]'::jsonb)
    into v_tools
  from public.officer_tools t
  where public.has_tool(t.tool_key);
  return jsonb_build_object(
    'ok', true,
    'member_id', public.kos_current_member_id(),
    'tools', v_tools,
    'can_open_roles', public.has_tool('roles_access'),
    'can_change_any_title', public.kos_can_change_any_title(),
    'can_change_chair_titles', public.kos_can_change_chair_titles(),
    'is_admin', public.kos_is_site_admin(),
    'grantable', to_jsonb(public.kos_actor_grantable_tools())
  );
end;
$$;

create or replace function public.kos_can_open_roles()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.has_tool('roles_access')
      or public.kos_is_site_admin()
      or public.kos_actor_is_officer_board_or_chair();
$$;

create or replace function public.search_member_access(p_q text default '')
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_q text := lower(btrim(coalesce(p_q, '')));
  v_pat text;
begin
  -- Same body as sql/kos_member_search_any_name.sql. A blank query is still
  -- the first 25 non-prospect members. A typed query searches every
  -- non-merged member by first name, last name, or either full-name order.
  v_q := btrim(regexp_replace(regexp_replace(v_q, '[,]+', ' ', 'g'), '\s+', ' ', 'g'));
  if not public.kos_can_open_roles() then
    raise exception 'You cannot open Member roles and access.';
  end if;
  v_pat := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', m.id,
      'first_name', m.first_name,
      'last_name', m.last_name,
      'email', m.email,
      'officer_title', m.officer_title,
      'membership_status', m.membership_status,
      'committees', to_jsonb(coalesce(m.committee_interests, '{}'))
    ) order by m.last_name, m.first_name)
    from (
      select *
      from public.members m
      where m.merged_into is null
        and (
          (
            v_q = ''
            and coalesce(m.member_role, '') <> 'prospect'
            and coalesce(m.membership_status, 'active') in ('active', 'pending-renewal', 'lapsed', 'inactive', 'pending-new')
          )
          or (
            v_q <> ''
            and (
              lower(coalesce(m.first_name, '')) like v_pat escape '\'
              or lower(coalesce(m.last_name, '')) like v_pat escape '\'
              or lower(btrim(coalesce(m.first_name, '') || ' ' || coalesce(m.last_name, ''))) like v_pat escape '\'
              or lower(btrim(coalesce(m.last_name, '') || ' ' || coalesce(m.first_name, ''))) like v_pat escape '\'
              or lower(coalesce(m.email, '')) like v_pat escape '\'
              or lower(coalesce(m.officer_title, '')) like v_pat escape '\'
              or (
                position(' ' in v_q) > 0
                and coalesce((
                  select bool_and(
                    lower(coalesce(m.first_name, '')) like
                      ('%' || replace(replace(replace(tok, '\', '\\'), '%', '\%'), '_', '\_') || '%') escape '\'
                    or lower(coalesce(m.last_name, '')) like
                      ('%' || replace(replace(replace(tok, '\', '\\'), '%', '\%'), '_', '\_') || '%') escape '\'
                  )
                  from regexp_split_to_table(v_q, '\s+') as tok
                  where tok <> ''
                ), false)
              )
            )
          )
        )
      order by m.last_name, m.first_name
      limit case when v_q = '' then 25 else null end
    ) m
  ), '[]'::jsonb);
end;
$$;

create or replace function public.get_member_access(p_member_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_row public.members%rowtype;
  v_actor uuid := public.kos_current_member_id();
  v_keys text[];
  v_tools jsonb;
begin
  if not public.kos_can_open_roles() then
    raise exception 'You cannot open Member roles and access.';
  end if;
  select * into v_row from public.members where id = p_member_id and merged_into is null;
  if not found then
    raise exception 'Member not found.';
  end if;
  v_keys := public.kos_title_keys_in(v_row.officer_title);
  select coalesce(jsonb_agg(jsonb_build_object(
    'key', t.tool_key,
    'label', t.label,
    'section', t.section,
    'sensitive', t.sensitive,
    'from_title', t.tool_key = any (public.kos_tools_for_title_keys(v_keys))
      or (t.tool_key like 'reports.%' and 'reports' = any (public.kos_tools_for_title_keys(v_keys))),
    'grant', (
      select jsonb_build_object(
        'id', g.id,
        'ends_at', g.ends_at,
        'starts_at', g.starts_at,
        'needs_review', g.needs_review,
        'note', g.note,
        'paused', not public.kos_member_is_active_status(v_row.membership_status),
        'expired', g.ends_at is not null and g.ends_at <= now()
      )
      from public.member_tool_grants g
      where g.member_id = v_row.id
        and g.tool_key = t.tool_key
        and g.revoked_at is null
      order by g.created_at desc
      limit 1
    )
  ) order by t.sort_order), '[]'::jsonb)
    into v_tools
  from public.officer_tools t;
  return jsonb_build_object(
    'ok', true,
    'member', jsonb_build_object(
      'id', v_row.id,
      'first_name', v_row.first_name,
      'last_name', v_row.last_name,
      'email', v_row.email,
      'officer_title', v_row.officer_title,
      'membership_status', v_row.membership_status,
      'committees', to_jsonb(coalesce(v_row.committee_interests, '{}')),
      'title_keys', to_jsonb(v_keys),
      'legacy_bits', to_jsonb(public.kos_legacy_title_bits(v_row.officer_title))
    ),
    'tools', v_tools,
    'viewer', jsonb_build_object(
      'member_id', v_actor,
      'is_self', v_actor = v_row.id,
      'is_admin', public.kos_is_site_admin(),
      'can_change_any_title', public.kos_can_change_any_title(),
      'can_change_chair_titles', public.kos_can_change_chair_titles(),
      'grantable', to_jsonb(public.kos_actor_grantable_tools())
    ),
    'titles', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'key', tt.title_key,
        'label', tt.label,
        'kind', tt.kind,
        'committee', tt.committee
      ) order by tt.sort_order), '[]'::jsonb)
      from public.officer_titles tt
    )
  );
end;
$$;

create or replace function public.list_my_hub_notices()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', n.id,
    'title', n.title,
    'body', n.body,
    'kind', n.kind,
    'created_at', n.created_at,
    'read_at', n.read_at
  ) order by n.created_at desc), '[]'::jsonb)
  from (
    select *
    from public.hub_notices
    where member_id = public.kos_current_member_id()
    order by created_at desc
    limit 20
  ) n;
$$;

create or replace function public.mark_hub_notice_read(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update public.hub_notices
     set read_at = coalesce(read_at, now())
   where id = p_id
     and member_id = public.kos_current_member_id();
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5) Writes
-- ---------------------------------------------------------------------------

create or replace function public.kos_access_apply_titles(
  p_member uuid,
  p_keys text[],
  p_drop_legacy boolean
) returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_row public.members%rowtype;
  v_legacy text[];
  v_title text;
  v_role text;
  v_committee text;
begin
  select * into v_row from public.members where id = p_member for update;
  if not found then
    raise exception 'Member not found.';
  end if;
  if p_drop_legacy then
    v_legacy := '{}';
  else
    v_legacy := public.kos_legacy_title_bits(v_row.officer_title);
  end if;
  v_title := public.kos_title_text(p_keys, v_legacy);
  v_role := public.kos_role_for_titles(p_keys, v_row.member_role);
  update public.members
     set officer_title = v_title,
         member_role = v_role,
         updated_at = now()
   where id = p_member;
  -- Keep a chair on the committee interest list when that column exists.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'members' and column_name = 'committee_interests'
  ) then
    for v_committee in
      select t.committee
      from public.officer_titles t
      where t.title_key = any (coalesce(p_keys, '{}'))
        and t.committee is not null
    loop
      begin
        update public.members
           set committee_interests = case
             when v_committee = any (coalesce(committee_interests, '{}')) then committee_interests
             else coalesce(committee_interests, '{}') || v_committee
           end
         where id = p_member
           and (to_regprocedure('public.kos_committee_list()') is null
                or v_committee = any (public.kos_committee_list()));
      exception when others then
        null;
      end;
    end loop;
  end if;
  perform public.kos_sync_member_access_role(p_member);
  perform public.kos_mark_grantor_reviews(p_member);
  return v_title;
end;
$$;

create or replace function public.kos_access_apply_grants(
  p_member uuid,
  p_extra jsonb,
  p_note text,
  p_only_tools text[] default null
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_item jsonb;
  v_key text;
  v_end timestamptz;
  v_day date;
  v_wanted text[] := '{}';
  v_existing record;
begin
  if p_extra is not null and jsonb_typeof(p_extra) = 'array' then
    for v_item in select value from jsonb_array_elements(p_extra) loop
      v_key := nullif(btrim(coalesce(v_item->>'tool_key', '')), '');
      if v_key is null then
        continue;
      end if;
      if not exists (select 1 from public.officer_tools where tool_key = v_key) then
        raise exception 'Unknown tool.';
      end if;
      if not public.kos_actor_can_grant(v_key) then
        raise exception 'You can only give a tool you hold by your own title or role.';
      end if;
      if nullif(v_item->>'ends_on', '') is not null then
        v_day := (v_item->>'ends_on')::date;
        v_end := public.kos_end_of_ny_day(v_day);
      elsif nullif(v_item->>'ends_at', '') is not null then
        v_end := (v_item->>'ends_at')::timestamptz;
      else
        v_end := public.kos_next_grant_end(now());
      end if;
      if v_end <= now() then
        raise exception 'Pick an end date that is still ahead.';
      end if;
      v_wanted := v_wanted || v_key;
      select * into v_existing
      from public.member_tool_grants
      where member_id = p_member and tool_key = v_key and revoked_at is null
      limit 1;
      if found then
        update public.member_tool_grants
           set ends_at = v_end,
               note = coalesce(nullif(btrim(coalesce(v_item->>'note', p_note, '')), ''), note)
         where id = v_existing.id;
      else
        insert into public.member_tool_grants (member_id, tool_key, granted_by, note, starts_at, ends_at)
        values (
          p_member,
          v_key,
          public.kos_current_member_id(),
          nullif(btrim(coalesce(v_item->>'note', p_note, '')), ''),
          now(),
          v_end
        );
      end if;
    end loop;
  end if;

  -- Revoke open grants the actor is allowed to change and did not ask to keep.
  for v_existing in
    select * from public.member_tool_grants
    where member_id = p_member and revoked_at is null
  loop
    if v_existing.tool_key = any (v_wanted) then
      continue;
    end if;
    if p_only_tools is not null and not (v_existing.tool_key = any (p_only_tools)) then
      continue;
    end if;
    if not public.kos_actor_can_grant(v_existing.tool_key) and not public.kos_can_change_any_title() then
      continue;
    end if;
    update public.member_tool_grants
       set revoked_at = now(),
           revoked_by = public.kos_current_member_id()
     where id = v_existing.id;
  end loop;
end;
$$;

create or replace function public.set_member_access(
  p_member_id uuid,
  p_title_keys text[],
  p_extra_tools jsonb default '[]'::jsonb,
  p_note text default null,
  p_drop_legacy boolean default false
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_actor uuid := public.kos_current_member_id();
  v_before jsonb;
  v_after jsonb;
  v_keys text[] := '{}';
  v_key text;
  v_current text[];
  v_union text[] := '{}';
  v_kind text;
  v_changed boolean := false;
  v_title text;
  v_summary text;
begin
  if v_actor is null then
    raise exception 'Sign in to change roles.';
  end if;
  if p_member_id is null then
    raise exception 'Pick a member.';
  end if;
  if p_member_id = v_actor then
    raise exception 'You cannot change your own title or tools.';
  end if;
  if not public.kos_can_open_roles() then
    raise exception 'You cannot open Member roles and access.';
  end if;

  select coalesce(array_agg(distinct k), '{}')
    into v_keys
  from unnest(coalesce(p_title_keys, '{}')) as k
  where exists (select 1 from public.officer_titles t where t.title_key = k);

  v_before := public.kos_access_snapshot(p_member_id);
  if nullif(v_before->>'id', '') is null then
    raise exception 'Member not found.';
  end if;
  v_current := public.kos_title_keys_in(v_before->>'officer_title');

  select coalesce(array_agg(distinct x), '{}'::text[])
    into v_union
  from (
    select unnest(coalesce(v_keys, '{}'::text[])) as x
    union
    select unnest(coalesce(v_current, '{}'::text[]))
  ) d
  where d.x is not null and d.x <> '';

  foreach v_key in array v_union loop
    if (v_key = any (v_keys)) = (v_key = any (v_current)) then
      continue;
    end if;
    v_changed := true;
    select kind into v_kind from public.officer_titles where title_key = v_key;
    if v_kind in ('chair', 'co_chair') then
      if not public.kos_can_change_chair_titles() then
        raise exception 'You can assign or remove committee chair titles only.';
      end if;
    else
      if not public.kos_can_change_any_title() then
        raise exception 'You can assign or remove committee chair titles only.';
      end if;
    end if;
  end loop;

  if v_changed or p_drop_legacy then
    v_title := public.kos_access_apply_titles(p_member_id, v_keys, p_drop_legacy);
  else
    v_title := v_before->>'officer_title';
  end if;

  perform public.kos_access_apply_grants(p_member_id, coalesce(p_extra_tools, '[]'::jsonb), p_note, null);

  -- A tool that now comes from a title does not also need an extra grant.
  update public.member_tool_grants g
     set revoked_at = now(),
         revoked_by = v_actor
   where g.member_id = p_member_id
     and g.revoked_at is null
     and (
       g.tool_key = any (public.kos_tools_for_title_keys(v_keys))
       or (g.tool_key like 'reports.%' and 'reports' = any (public.kos_tools_for_title_keys(v_keys)))
     );

  v_after := public.kos_access_snapshot(p_member_id);
  v_summary := 'Updated access for ' || coalesce(v_title, 'a member with no title') || '.';
  perform public.kos_access_write_audit(
    'set_access', v_summary, array[p_member_id], v_before, v_after,
    jsonb_build_object('note', p_note)
  );
  perform public.kos_access_notice(
    p_member_id,
    'Your Officer Desk access changed',
    'An officer updated your title or tools. Open the Officer Desk to see what you can use. This notice is only in the Hub.'
  );
  return jsonb_build_object('ok', true, 'summary', v_summary, 'officer_title', v_title);
end;
$$;

create or replace function public.grant_member_tool(
  p_member_id uuid,
  p_tool_key text,
  p_ends_on date default null,
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_extra jsonb;
begin
  if public.kos_current_member_id() = p_member_id then
    raise exception 'You cannot change your own title or tools.';
  end if;
  if not public.kos_actor_can_grant(p_tool_key) then
    raise exception 'You can only give a tool you hold by your own title or role.';
  end if;
  v_extra := jsonb_build_array(jsonb_build_object(
    'tool_key', p_tool_key,
    'ends_on', coalesce(p_ends_on, (public.kos_next_grant_end(now()) at time zone 'America/New_York')::date),
    'note', p_note
  ));
  -- Keep current titles and add this one grant. Other grants stay because
  -- we pass only this tool in p_only via a direct insert path below.
  if p_member_id is null then
    raise exception 'Pick a member.';
  end if;
  perform public.kos_access_apply_grants(p_member_id, v_extra, p_note, array[p_tool_key]);
  perform public.kos_access_write_audit(
    'grant',
    'Granted ' || p_tool_key || '.',
    array[p_member_id],
    '{}'::jsonb,
    public.kos_access_snapshot(p_member_id),
    jsonb_build_object('tool_key', p_tool_key, 'note', p_note)
  );
  perform public.kos_access_notice(
    p_member_id,
    'A tool was added to your Officer Desk',
    'You have ' || coalesce((select label from public.officer_tools where tool_key = p_tool_key), p_tool_key)
      || ' until ' || to_char(coalesce(p_ends_on, (public.kos_next_grant_end(now()) at time zone 'America/New_York')::date), 'FMMonth FMDD, YYYY') || '.'
  );
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.revoke_member_tool(
  p_member_id uuid,
  p_tool_key text,
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if public.kos_current_member_id() is null then
    raise exception 'Sign in to change roles.';
  end if;
  if public.kos_current_member_id() = p_member_id then
    raise exception 'You cannot change your own title or tools.';
  end if;
  if not public.kos_actor_can_grant(p_tool_key) and not public.kos_can_change_any_title() then
    raise exception 'You can only give a tool you hold by your own title or role.';
  end if;
  update public.member_tool_grants
     set revoked_at = now(),
         revoked_by = public.kos_current_member_id(),
         note = coalesce(nullif(btrim(coalesce(p_note, '')), ''), note)
   where member_id = p_member_id
     and tool_key = p_tool_key
     and revoked_at is null;
  perform public.kos_access_write_audit(
    'revoke',
    'Revoked ' || p_tool_key || '.',
    array[p_member_id],
    '{}'::jsonb,
    public.kos_access_snapshot(p_member_id),
    jsonb_build_object('tool_key', p_tool_key, 'note', p_note)
  );
  perform public.kos_access_notice(
    p_member_id,
    'A tool was removed from your Officer Desk',
    coalesce((select label from public.officer_tools where tool_key = p_tool_key), p_tool_key) || ' is no longer an extra grant.'
  );
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.handover_member_title(
  p_from uuid,
  p_to uuid,
  p_title_key text,
  p_keep_tools text[] default '{}',
  p_note text default null,
  p_keep_ends_on date default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_actor uuid := public.kos_current_member_id();
  v_kind text;
  v_from_before jsonb;
  v_to_before jsonb;
  v_from_keys text[];
  v_to_keys text[];
  v_from_title text;
  v_stays jsonb;
  v_keep text;
  v_end date;
  v_label text;
begin
  if v_actor is null then
    raise exception 'Sign in to change roles.';
  end if;
  if p_from is null or p_to is null or nullif(btrim(coalesce(p_title_key, '')), '') is null then
    raise exception 'Pick the outgoing member, the incoming member, and the title.';
  end if;
  if p_from = p_to then
    raise exception 'Pick two different members.';
  end if;
  if v_actor = p_from or v_actor = p_to then
    raise exception 'You cannot change your own title or tools.';
  end if;
  select kind, label into v_kind, v_label from public.officer_titles where title_key = p_title_key;
  if v_kind is null then
    raise exception 'That is not an official title.';
  end if;
  if v_kind in ('chair', 'co_chair') then
    if not public.kos_can_change_chair_titles() then
      raise exception 'You can assign or remove committee chair titles only.';
    end if;
  elsif not public.kos_can_change_any_title() then
    raise exception 'You can assign or remove committee chair titles only.';
  end if;

  v_from_before := public.kos_access_snapshot(p_from);
  v_to_before := public.kos_access_snapshot(p_to);
  v_from_keys := public.kos_title_keys_in(v_from_before->>'officer_title');
  v_to_keys := public.kos_title_keys_in(v_to_before->>'officer_title');
  if not (p_title_key = any (v_from_keys)) then
    raise exception 'That member does not hold this title.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'tool_key', g.tool_key,
    'label', t.label,
    'ends_at', g.ends_at,
    'needs_review', g.needs_review
  ) order by t.sort_order), '[]'::jsonb)
    into v_stays
  from public.member_tool_grants g
  join public.officer_tools t on t.tool_key = g.tool_key
  where g.member_id = p_from
    and g.revoked_at is null;

  v_from_keys := array(select x from unnest(v_from_keys) x where x <> p_title_key);
  if not (p_title_key = any (v_to_keys)) then
    v_to_keys := v_to_keys || p_title_key;
  end if;
  perform public.kos_access_apply_titles(p_from, v_from_keys, false);
  v_from_title := public.kos_access_apply_titles(p_to, v_to_keys, false);

  v_end := coalesce(p_keep_ends_on, (public.kos_next_grant_end(now()) at time zone 'America/New_York')::date);
  if p_keep_tools is not null then
    foreach v_keep in array p_keep_tools loop
      if v_keep is null or v_keep = '' then
        continue;
      end if;
      if not public.kos_actor_can_grant(v_keep) and not public.kos_can_change_any_title() then
        raise exception 'You can only give a tool you hold by your own title or role.';
      end if;
      perform public.kos_access_apply_grants(
        p_from,
        jsonb_build_array(jsonb_build_object('tool_key', v_keep, 'ends_on', v_end, 'note', p_note)),
        p_note,
        array[v_keep]
      );
    end loop;
  end if;

  perform public.kos_access_write_audit(
    'handover',
    'Moved ' || v_label || ' to the incoming member. Extra grants stayed with the outgoing member.',
    array[p_from, p_to],
    jsonb_build_object('from', v_from_before, 'to', v_to_before, 'staying_grants', v_stays),
    jsonb_build_object('from', public.kos_access_snapshot(p_from), 'to', public.kos_access_snapshot(p_to)),
    jsonb_build_object('title_key', p_title_key, 'note', p_note, 'staying_grants', v_stays)
  );
  perform public.kos_access_notice(
    p_from,
    'A title moved to someone else',
    v_label || ' moved to another member. Extra grants you already had stay with you.'
  );
  perform public.kos_access_notice(
    p_to,
    'You have a new title',
    'You now hold ' || v_label || '. The tools that come with it are on your Officer Desk.'
  );
  return jsonb_build_object(
    'ok', true,
    'summary', 'Moved ' || v_label || '.',
    'staying_grants', v_stays,
    'incoming_title', v_from_title
  );
end;
$$;

create or replace function public.kos_access_restore_member(p_snap jsonb)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_id uuid;
  v_grant jsonb;
begin
  v_id := nullif(p_snap->>'id', '')::uuid;
  if v_id is null then
    return;
  end if;
  update public.members
     set officer_title = nullif(p_snap->>'officer_title', ''),
         member_role = coalesce(nullif(p_snap->>'member_role', ''), member_role),
         updated_at = now()
   where id = v_id;
  delete from public.member_tool_grants where member_id = v_id;
  if jsonb_typeof(p_snap->'grants') = 'array' then
    for v_grant in select value from jsonb_array_elements(p_snap->'grants') loop
      insert into public.member_tool_grants (
        id, member_id, tool_key, granted_by, note, starts_at, ends_at,
        revoked_at, revoked_by, needs_review, review_marked_at, created_at
      ) values (
        coalesce(nullif(v_grant->>'id', '')::uuid, gen_random_uuid()),
        v_id,
        v_grant->>'tool_key',
        nullif(v_grant->>'granted_by', '')::uuid,
        v_grant->>'note',
        coalesce((v_grant->>'starts_at')::timestamptz, now()),
        nullif(v_grant->>'ends_at', '')::timestamptz,
        nullif(v_grant->>'revoked_at', '')::timestamptz,
        nullif(v_grant->>'revoked_by', '')::uuid,
        coalesce((v_grant->>'needs_review')::boolean, false),
        nullif(v_grant->>'review_marked_at', '')::timestamptz,
        coalesce((v_grant->>'created_at')::timestamptz, now())
      );
    end loop;
  end if;
  perform public.kos_sync_member_access_role(v_id);
  perform public.kos_mark_grantor_reviews(v_id);
end;
$$;

create or replace function public.undo_member_access_change(p_audit_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_row public.member_access_audit%rowtype;
  v_actor uuid := public.kos_current_member_id();
  v_target uuid;
  v_snap jsonb;
begin
  if v_actor is null then
    raise exception 'Sign in to change roles.';
  end if;
  select * into v_row from public.member_access_audit where id = p_audit_id for update;
  if not found then
    raise exception 'That change was not found.';
  end if;
  if v_row.undone_at is not null or v_row.action = 'undo' then
    raise exception 'That change is already undone.';
  end if;
  if not (
    public.kos_can_change_any_title()
    or (v_row.actor_member_id = v_actor and v_row.created_at > now() - interval '7 days')
  ) then
    raise exception 'You can undo your own change for 7 days. The President and site admins can undo any change.';
  end if;
  if exists (
    select 1
    from public.member_access_audit newer
    where newer.id <> v_row.id
      and newer.undone_at is null
      and newer.action <> 'undo'
      and newer.created_at > v_row.created_at
      and newer.target_member_ids && v_row.target_member_ids
  ) then
    raise exception 'A later change touched this member. Undo that one first.';
  end if;

  if v_row.action = 'handover' then
    perform public.kos_access_restore_member(v_row.before_state->'from');
    perform public.kos_access_restore_member(v_row.before_state->'to');
  elsif v_row.before_state ? 'id' then
    perform public.kos_access_restore_member(v_row.before_state);
  end if;

  update public.member_access_audit
     set undone_at = now(),
         undone_by = v_actor
   where id = v_row.id;

  perform public.kos_access_write_audit(
    'undo',
    'Undid: ' || v_row.summary,
    v_row.target_member_ids,
    v_row.after_state,
    v_row.before_state,
    jsonb_build_object('undo_of', v_row.id)
  );

  foreach v_target in array v_row.target_member_ids loop
    perform public.kos_access_notice(
      v_target,
      'An access change was undone',
      'A recent title or tool change was undone. Your Officer Desk matches the earlier setup.'
    );
  end loop;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.list_member_access_changes(p_limit integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_me uuid := public.kos_current_member_id();
  v_any boolean := public.kos_can_change_any_title();
begin
  if not public.kos_can_open_roles() then
    raise exception 'You cannot open Member roles and access.';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', a.id,
      'action', a.action,
      'summary', a.summary,
      'created_at', a.created_at,
      'actor_member_id', a.actor_member_id,
      'actor_name', nullif(btrim(coalesce(m.first_name, '') || ' ' || coalesce(m.last_name, '')), ''),
      'undone', a.undone_at is not null,
      'can_undo', a.undone_at is null
        and a.action <> 'undo'
        and (
          v_any
          or (a.actor_member_id = v_me and a.created_at > now() - interval '7 days')
        )
        and not exists (
          select 1 from public.member_access_audit newer
          where newer.id <> a.id
            and newer.undone_at is null
            and newer.action <> 'undo'
            and newer.created_at > a.created_at
            and newer.target_member_ids && a.target_member_ids
        ),
      'detail', a.detail
    ) order by a.created_at desc)
    from (
      select *
      from public.member_access_audit
      order by created_at desc
      limit least(greatest(coalesce(p_limit, 30), 1), 100)
    ) a
    left join public.members m on m.id = a.actor_member_id
  ), '[]'::jsonb);
end;
$$;

create or replace function public.list_access_chair_requests()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not public.kos_can_change_chair_titles() then
    return '[]'::jsonb;
  end if;
  if to_regclass('public.committee_chair_requests') is null then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id,
      'member_id', r.member_id,
      'first_name', m.first_name,
      'last_name', m.last_name,
      'email', m.email,
      'committee', r.committee,
      'note', r.note,
      'created_at', r.created_at
    ) order by r.created_at)
    from public.committee_chair_requests r
    join public.members m on m.id = r.member_id
    where r.status = 'pending'
  ), '[]'::jsonb);
end;
$$;

create or replace function public.decide_access_chair_request(
  p_id uuid,
  p_approve boolean,
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_member uuid;
  v_committee text;
  v_title_key text;
  v_keys text[];
  v_before jsonb;
  v_label text;
begin
  if not public.kos_can_change_chair_titles() then
    raise exception 'You can assign or remove committee chair titles only.';
  end if;
  if to_regclass('public.committee_chair_requests') is null then
    raise exception 'Chair requests are not available yet.';
  end if;
  if public.kos_current_member_id() is null then
    raise exception 'Sign in to change roles.';
  end if;

  if coalesce(p_approve, false) then
    update public.committee_chair_requests
       set status = 'approved',
           decided_by = public.kos_current_member_id(),
           decided_at = now(),
           decision_note = nullif(btrim(coalesce(p_note, '')), '')
     where id = p_id and status = 'pending'
     returning member_id, committee into v_member, v_committee;
    if v_member is null then
      raise exception 'Request not found or already decided.';
    end if;
    if v_member = public.kos_current_member_id() then
      raise exception 'You cannot change your own title or tools.';
    end if;
    select t.title_key, t.label into v_title_key, v_label
    from public.officer_titles t
    where t.kind = 'chair'
      and (
        lower(t.committee) = lower(btrim(v_committee))
        or lower(t.label) = lower('Committee Chair of ' || btrim(v_committee))
      )
    order by t.sort_order
    limit 1;
    if v_title_key is null then
      raise exception 'That committee does not have an official chair title.';
    end if;
    v_before := public.kos_access_snapshot(v_member);
    v_keys := public.kos_title_keys_in(v_before->>'officer_title');
    if not (v_title_key = any (v_keys)) then
      v_keys := v_keys || v_title_key;
    end if;
    perform public.kos_access_apply_titles(v_member, v_keys, false);
    perform public.kos_access_write_audit(
      'chair_approve',
      'Approved a request to chair ' || v_committee || '.',
      array[v_member],
      v_before,
      public.kos_access_snapshot(v_member),
      jsonb_build_object('request_id', p_id, 'committee', v_committee)
    );
    perform public.kos_access_notice(
      v_member,
      'You are a committee chair',
      'Your request to chair ' || v_committee || ' was approved. The tools that come with ' || v_label || ' are on your Officer Desk.'
    );
  else
    update public.committee_chair_requests
       set status = 'declined',
           decided_by = public.kos_current_member_id(),
           decided_at = now(),
           decision_note = nullif(btrim(coalesce(p_note, '')), '')
     where id = p_id and status = 'pending'
     returning member_id, committee into v_member, v_committee;
    if v_member is null then
      raise exception 'Request not found or already decided.';
    end if;
    perform public.kos_access_write_audit(
      'chair_decline',
      'Declined a request to chair ' || v_committee || '.',
      array[v_member],
      '{}'::jsonb,
      '{}'::jsonb,
      jsonb_build_object('request_id', p_id, 'note', p_note)
    );
    perform public.kos_access_notice(
      v_member,
      'Chair request declined',
      'Your request to chair ' || v_committee || ' was declined.'
    );
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6) Lapse pauses grants. Coming back to active resumes them.
--    Leaving office marks grants that person gave, and the grants stay.
-- ---------------------------------------------------------------------------

create or replace function public.kos_access_member_status_trg()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if tg_op = 'UPDATE'
     and old.membership_status is distinct from new.membership_status
     and not public.kos_member_is_active_status(old.membership_status)
     and public.kos_member_is_active_status(new.membership_status)
     and exists (
       select 1 from public.member_tool_grants g
       where g.member_id = new.id
         and g.revoked_at is null
         and (g.ends_at is null or g.ends_at > now())
     )
  then
    perform public.kos_access_notice(
      new.id,
      'Your extra tools are available again',
      'Your membership is active again. Extra Officer Desk tools that have not reached their end date are back on.'
    );
  end if;
  if tg_op = 'UPDATE'
     and (
       old.officer_title is distinct from new.officer_title
       or old.member_role is distinct from new.member_role
     )
     and public.kos_row_holds_office(old.officer_title, old.member_role, old.email)
     and not public.kos_row_holds_office(new.officer_title, new.member_role, new.email)
  then
    update public.member_tool_grants
       set needs_review = true,
           review_marked_at = now()
     where granted_by = new.id
       and revoked_at is null
       and needs_review = false;
  end if;
  return new;
end;
$$;

drop trigger if exists kos_access_member_status_trg on public.members;
create trigger kos_access_member_status_trg
  after update of membership_status, officer_title, member_role, email
  on public.members
  for each row
  execute function public.kos_access_member_status_trg();

-- ---------------------------------------------------------------------------
-- 7) RLS. Clients read. Writes go through the functions above.
-- ---------------------------------------------------------------------------

alter table public.officer_tools enable row level security;
alter table public.officer_titles enable row level security;
alter table public.officer_title_tools enable row level security;
alter table public.member_tool_grants enable row level security;
alter table public.member_access_audit enable row level security;
alter table public.hub_notices enable row level security;

drop policy if exists officer_tools_read on public.officer_tools;
create policy officer_tools_read on public.officer_tools
  for select to authenticated
  using (true);

drop policy if exists officer_titles_read on public.officer_titles;
create policy officer_titles_read on public.officer_titles
  for select to authenticated
  using (true);

drop policy if exists officer_title_tools_read on public.officer_title_tools;
create policy officer_title_tools_read on public.officer_title_tools
  for select to authenticated
  using (true);

drop policy if exists member_tool_grants_read on public.member_tool_grants;
create policy member_tool_grants_read on public.member_tool_grants
  for select to authenticated
  using (
    member_id = public.kos_current_member_id()
    or public.kos_can_open_roles()
  );

drop policy if exists member_access_audit_read on public.member_access_audit;
create policy member_access_audit_read on public.member_access_audit
  for select to authenticated
  using (public.kos_can_open_roles());

drop policy if exists hub_notices_read_own on public.hub_notices;
create policy hub_notices_read_own on public.hub_notices
  for select to authenticated
  using (member_id = public.kos_current_member_id());

revoke all on table public.officer_tools from public, anon;
revoke all on table public.officer_titles from public, anon;
revoke all on table public.officer_title_tools from public, anon;
revoke all on table public.member_tool_grants from public, anon;
revoke all on table public.member_access_audit from public, anon;
revoke all on table public.hub_notices from public, anon;
grant select on table public.officer_tools to authenticated;
grant select on table public.officer_titles to authenticated;
grant select on table public.officer_title_tools to authenticated;
grant select on table public.member_tool_grants to authenticated;
grant select on table public.member_access_audit to authenticated;
grant select on table public.hub_notices to authenticated;

-- ---------------------------------------------------------------------------
-- 8) Fold has_tool into the gates that already protect each tool.
--    The original body is copied once to kos_legacy_* so a re-run cannot
--    wrap the wrapper.
-- ---------------------------------------------------------------------------

create or replace function public.kos_access_snapshot_fn(p_src text, p_dest text)
returns void
language plpgsql
set search_path to 'public'
as $$
declare
  v_sql text;
begin
  if to_regprocedure(p_src) is null or to_regprocedure(p_dest) is not null then
    return;
  end if;
  v_sql := pg_get_functiondef(p_src::regprocedure);
  -- Literal replace. Parentheses in the signature must not be read as a regex.
  v_sql := replace(v_sql, 'FUNCTION ' || p_src, 'FUNCTION ' || p_dest);
  if v_sql = pg_get_functiondef(p_src::regprocedure) then
    raise notice 'Member roles: could not snapshot %', p_src;
    return;
  end if;
  execute v_sql;
end;
$$;

select public.kos_access_snapshot_fn('public.can_manage_events()', 'public.kos_legacy_can_manage_events()');
select public.kos_access_snapshot_fn('public.can_manage_shop()', 'public.kos_legacy_can_manage_shop()');
select public.kos_access_snapshot_fn('public.can_view_payments()', 'public.kos_legacy_can_view_payments()');
select public.kos_access_snapshot_fn('public.can_review_applications()', 'public.kos_legacy_can_review_applications()');
select public.kos_access_snapshot_fn('public.can_review_volunteer_inquiries()', 'public.kos_legacy_can_review_volunteer_inquiries()');
select public.kos_access_snapshot_fn('public.can_view_event_outreach()', 'public.kos_legacy_can_view_event_outreach()');
select public.kos_access_snapshot_fn('public.kos_can_review_parade_guests()', 'public.kos_legacy_can_review_parade_guests()');

do $$
begin
  if to_regprocedure('public.kos_legacy_can_review_applications()') is not null then
    execute $fn$
      create or replace function public.can_review_applications()
      returns boolean language sql stable security definer set search_path to 'public' as $body$
        select public.has_tool('applications') or public.kos_legacy_can_review_applications();
      $body$;
    $fn$;
  end if;
  if to_regprocedure('public.kos_legacy_can_view_payments()') is not null then
    execute $fn$
      create or replace function public.can_view_payments()
      returns boolean language sql stable security definer set search_path to 'public' as $body$
        select public.has_tool('payments') or public.kos_legacy_can_view_payments();
      $body$;
    $fn$;
  end if;
  if to_regprocedure('public.kos_legacy_can_manage_shop()') is not null then
    execute $fn$
      create or replace function public.can_manage_shop()
      returns boolean language sql stable security definer set search_path to 'public' as $body$
        select public.has_tool('shop_studio') or public.kos_legacy_can_manage_shop();
      $body$;
    $fn$;
  end if;
  if to_regprocedure('public.kos_legacy_can_manage_events()') is not null then
    execute $fn$
      create or replace function public.can_manage_events()
      returns boolean language sql stable security definer set search_path to 'public' as $body$
        select public.has_tool('event_studio') or public.kos_legacy_can_manage_events();
      $body$;
    $fn$;
  end if;
  if to_regprocedure('public.kos_legacy_can_review_volunteer_inquiries()') is not null then
    execute $fn$
      create or replace function public.can_review_volunteer_inquiries()
      returns boolean language sql stable security definer set search_path to 'public' as $body$
        select public.has_tool('volunteer_inquiries') or public.kos_legacy_can_review_volunteer_inquiries();
      $body$;
    $fn$;
  end if;
end $$;

-- Parade guests must not open just because someone has Event Studio.
create or replace function public.kos_can_review_parade_guests()
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_legacy boolean := false;
begin
  if public.has_tool('parade_guests') then
    return true;
  end if;
  if to_regprocedure('public.kos_legacy_can_review_parade_guests()') is not null then
    execute 'select public.kos_legacy_can_review_parade_guests()' into v_legacy;
    return coalesce(v_legacy, false);
  end if;
  return public.is_krewe_officer();
end;
$$;

-- Report RPCs. The parent reports tool or the matching group, or the access
-- people already have through the old event-manager and officer checks.
create or replace function public.kos_can_run_report(p_group text)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_legacy boolean := false;
begin
  if public.has_tool('reports') then
    return true;
  end if;
  if p_group is not null and public.has_tool('reports.' || p_group) then
    return true;
  end if;
  if p_group is null and (
    public.has_tool('reports.events')
    or public.has_tool('reports.merch')
    or public.has_tool('reports.parades')
    or public.has_tool('reports.members')
    or public.has_tool('reports.finance')
  ) then
    return true;
  end if;
  if public.is_krewe_officer() then
    return true;
  end if;
  if to_regprocedure('public.kos_legacy_can_manage_events()') is not null then
    execute 'select public.kos_legacy_can_manage_events()' into v_legacy;
    return coalesce(v_legacy, false);
  end if;
  return false;
end;
$$;

create or replace function public.can_view_event_outreach()
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_legacy boolean := false;
begin
  if public.has_tool('event_outreach') then
    return true;
  end if;
  if to_regprocedure('public.can_review_applications()') is not null and public.can_review_applications() then
    return true;
  end if;
  if to_regprocedure('public.kos_legacy_can_manage_events()') is not null then
    execute 'select public.kos_legacy_can_manage_events()' into v_legacy;
    return coalesce(v_legacy, false);
  end if;
  return false;
end;
$$;

create or replace function public.kos_access_rewrite(p_name text, p_from text, p_to text)
returns void
language plpgsql
set search_path to 'public'
as $$
declare
  r record;
  v_def text;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = p_name
  loop
    v_def := pg_get_functiondef(r.sig);
    if position(p_to in v_def) > 0 then
      continue;
    end if;
    if position(p_from in v_def) = 0 then
      raise notice 'Member roles: % has no % check to extend', r.sig, p_from;
      continue;
    end if;
    execute replace(v_def, p_from, p_to);
  end loop;
end;
$$;

select public.kos_access_rewrite('officer_locker_mark_paid', 'public.is_krewe_officer()', '(public.is_krewe_officer() or public.has_tool(''lockers''))');
select public.kos_access_rewrite('officer_locker_assign', 'public.is_krewe_officer()', '(public.is_krewe_officer() or public.has_tool(''lockers''))');
select public.kos_access_rewrite('officer_locker_free', 'public.is_krewe_officer()', '(public.is_krewe_officer() or public.has_tool(''lockers''))');
select public.kos_access_rewrite('officer_locker_set_setting', 'public.is_krewe_officer()', '(public.is_krewe_officer() or public.has_tool(''lockers''))');
select public.kos_access_rewrite('officer_locker_add_existing', 'public.is_krewe_officer()', '(public.is_krewe_officer() or public.has_tool(''lockers''))');
select public.kos_access_rewrite('officer_upsert_document', 'public.is_krewe_officer()', '(public.is_krewe_officer() or public.has_tool(''doc_studio''))');
select public.kos_access_rewrite('officer_set_document_published', 'public.is_krewe_officer()', '(public.is_krewe_officer() or public.has_tool(''doc_studio''))');
select public.kos_access_rewrite('officer_delete_document', 'public.is_krewe_officer()', '(public.is_krewe_officer() or public.has_tool(''doc_studio''))');
select public.kos_access_rewrite('officer_upsert_qr_code', 'public.is_krewe_officer()', '(public.is_krewe_officer() or public.has_tool(''qr_studio''))');
select public.kos_access_rewrite('officer_set_qr_active', 'public.is_krewe_officer()', '(public.is_krewe_officer() or public.has_tool(''qr_studio''))');
select public.kos_access_rewrite('officer_delete_qr_code', 'public.is_krewe_officer()', '(public.is_krewe_officer() or public.has_tool(''qr_studio''))');
select public.kos_access_rewrite('officer_list_qr_codes', 'public.is_krewe_officer()', '(public.is_krewe_officer() or public.has_tool(''qr_studio''))');
select public.kos_access_rewrite('send_all_krewe_message', 'public.is_krewe_officer()', '(public.is_krewe_officer() or public.has_tool(''all_krewe''))');
select public.kos_access_rewrite('list_all_krewe_messages', 'public.is_krewe_officer()', '(public.is_krewe_officer() or public.has_tool(''all_krewe''))');
select public.kos_access_rewrite('queue_broadcast', 'public.is_krewe_officer()', '(public.is_krewe_officer() or public.has_tool(''all_krewe''))');
select public.kos_access_rewrite('kos_create_level_invoices', 'public.is_krewe_officer()', '(public.is_krewe_officer() or public.has_tool(''send_invoices''))');
select public.kos_access_rewrite('officer_create_and_send_invoices', 'public.is_krewe_officer()', '(public.is_krewe_officer() or public.has_tool(''send_invoices''))');
select public.kos_access_rewrite('officer_list_invoice_targets', 'public.is_krewe_officer()', '(public.is_krewe_officer() or public.has_tool(''send_invoices''))');
select public.kos_access_rewrite('kos_set_membership_level', 'public.is_krewe_officer()', '(public.is_krewe_officer() or public.has_tool(''send_invoices'') or public.has_tool(''payments''))');
select public.kos_access_rewrite('kos_request_dues_waiver', 'public.is_krewe_officer()', '(public.is_krewe_officer() or public.has_tool(''dues_waivers''))');
select public.kos_access_rewrite('kos_decide_dues_waiver', 'public.is_krewe_officer()', '(public.is_krewe_officer() or public.has_tool(''dues_waivers''))');
select public.kos_access_rewrite('kos_apply_elected_officer_exemptions', 'public.is_krewe_officer()', '(public.is_krewe_officer() or public.has_tool(''dues_waivers''))');
select public.kos_access_rewrite('officer_grant_badge', 'public.is_krewe_officer()', '(public.is_krewe_officer() or public.has_tool(''approvals''))');
select public.kos_access_rewrite('list_officer_approvals', 'public.is_krewe_officer()', '(public.is_krewe_officer() or public.has_tool(''approvals''))');
select public.kos_access_rewrite('approve_role_request', 'public.is_krewe_officer()', '(public.is_krewe_officer() or public.has_tool(''approvals''))');
select public.kos_access_rewrite('deny_role_request', 'public.is_krewe_officer()', '(public.is_krewe_officer() or public.has_tool(''approvals''))');
select public.kos_access_rewrite('list_pending_volunteer_hours', 'public.is_krewe_officer()', '(public.is_krewe_officer() or public.has_tool(''approvals''))');
select public.kos_access_rewrite('decide_volunteer_hours', 'public.is_krewe_officer()', '(public.is_krewe_officer() or public.has_tool(''approvals''))');
select public.kos_access_rewrite('officer_member_directory', 'public.is_krewe_officer()', '(public.is_krewe_officer() or public.has_tool(''member_contacts''))');
select public.kos_access_rewrite('officer_report_options', 'public.can_manage_events()', 'public.kos_can_run_report(null)');
select public.kos_access_rewrite('officer_event_report', 'public.can_manage_events()', 'public.kos_can_run_report(''events'')');
select public.kos_access_rewrite('officer_fundraising_report', 'public.can_manage_events()', 'public.kos_can_run_report(''finance'')');
select public.kos_access_rewrite('officer_set_parade_guest_settings', 'public.can_manage_events()', 'public.kos_can_review_parade_guests()');

-- ---------------------------------------------------------------------------
-- 9) Execute grants
-- ---------------------------------------------------------------------------

revoke all on function public.kos_access_snapshot_fn(text, text) from public, anon, authenticated;
revoke all on function public.kos_access_rewrite(text, text, text) from public, anon, authenticated;
revoke all on function public.kos_access_snapshot(uuid) from public, anon, authenticated;
revoke all on function public.kos_access_notice(uuid, text, text) from public, anon, authenticated;
revoke all on function public.kos_access_write_audit(text, text, uuid[], jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.kos_access_apply_titles(uuid, text[], boolean) from public, anon, authenticated;
revoke all on function public.kos_access_apply_grants(uuid, jsonb, text, text[]) from public, anon, authenticated;
revoke all on function public.kos_access_restore_member(jsonb) from public, anon, authenticated;
revoke all on function public.kos_mark_grantor_reviews(uuid) from public, anon, authenticated;
revoke all on function public.kos_sync_member_access_role(uuid) from public, anon, authenticated;
revoke all on function public.kos_member_active_grants(uuid) from public, anon, authenticated;

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'has_tool', 'my_officer_tools', 'search_member_access', 'get_member_access',
        'set_member_access', 'grant_member_tool', 'revoke_member_tool',
        'handover_member_title', 'undo_member_access_change', 'list_member_access_changes',
        'list_access_chair_requests', 'decide_access_chair_request',
        'list_my_hub_notices', 'mark_hub_notice_read',
        'kos_can_open_roles', 'kos_can_run_report', 'kos_can_review_parade_guests',
        'can_view_event_outreach', 'can_review_applications', 'can_view_payments',
        'can_manage_shop', 'can_manage_events', 'can_review_volunteer_inquiries',
        'kos_next_grant_end', 'kos_is_site_admin', 'kos_can_change_any_title',
        'kos_can_change_chair_titles'
      )
  loop
    execute format('revoke all on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end $$;
