-- Committee members report (Officer Desk > Reports).
-- Reads committee data that already exists on member profiles:
--   * members.interests (comma list imported from Wild Apricot, e.g. "Charities, Float")
--   * members.committee_interests (new My Krewe picker)
--   * member_roles (role = 'committee') as committee members
--   * members.officer_title "Chair of ..." for chairs
-- Old labels are mapped onto the Hub committee names and deduped.
-- NOT APPLIED. Apply only after Melissa approves.

create or replace function public.kos_normalize_committee(p text)
returns text language sql immutable set search_path = public as $$
  select case
    when p is null or btrim(p) = '' then null
    when p ~* 'by-?laws|rules' then 'Bylaws and Rules'
    when p ~* 'charit|fundrais' then 'Charity/Fundraising'
    when p ~* 'social|party' then 'Social'
    when p ~* 'merch' then 'Merchandise'
    when p ~* 'membership' then 'Membership'
    when p ~* 'float' then 'Float'
    when p ~* 'parade' then 'Parade'
    when p ~* 'financ|treasur' then 'Finance'
    when p ~* 'communicat' then 'Communication'
    when p ~* 'technolog|webmaster' then 'Technology'
    when p ~* 'security' then 'Security'
    else initcap(btrim(p))
  end;
$$;

create or replace function public.officer_committee_members_report()
returns table (committee text, report_role text, member_id uuid, first_name text, last_name text,
               email text, phone text, membership_status text, officer_title text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_krewe_officer() or public.is_committee_chair()) then
    raise exception 'Only officers and committee chairs can open the committee report.';
  end if;
  return query
  with live as (
    select m.* from public.members m
     where m.merged_into is null and coalesce(m.member_role,'') <> 'prospect'
       and m.membership_status in ('active','pending')
  ),
  picks0 as (
    select l.id, public.kos_normalize_committee(x) c
      from live l, unnest(coalesce(l.committee_interests, '{}'::text[])) x
    union
    select l.id, public.kos_normalize_committee(x) c
      from live l, regexp_split_to_table(coalesce(l.interests,''), '\s*[,;]\s*') x
  ),
  chairs as (
    -- Chair = officer_title says "Chair of X" / "X Chair". member_roles committee rows
    -- (which grant desk access) count as committee members, not chairs.
    -- officer_title can hold several titles split by a middle dot, e.g.
    -- 'Board Member · Committee Chair of Charity · Committee Chair of Social'.
    select l.id, public.kos_normalize_committee(regexp_replace(t, '(committee\s+)?(co-?)?chair(\s+of)?', '', 'gi')) c
      from live l, regexp_split_to_table(coalesce(l.officer_title,''), '\s*[·|;]\s*') t
     where t ~* 'chair'
  ),
  picks as (
    select * from picks0
    union
    select p.member_id, public.kos_normalize_committee(r.committee)
      from public.member_roles r join public.profiles p on p.id = r.user_id
     where r.role = 'committee' and coalesce(r.committee,'') <> ''
  ),
  rows as (
    select c, 'Chair'::text rr, id from chairs where c is not null
    union
    select c, 'Member', id from picks
     where c is not null and not exists (select 1 from chairs h where h.id = picks.id and h.c = picks.c)
    union
    select 'No committee picked', 'Member', l.id from live l
     where not exists (select 1 from picks p where p.id = l.id and p.c is not null)
  )
  select r.c, r.rr, l.id, l.first_name, l.last_name, l.email, l.phone, l.membership_status, l.officer_title
    from rows r join live l on l.id = r.id
   order by r.c, (r.rr = 'Member'), l.last_name, l.first_name;
end $$;
revoke all on function public.officer_committee_members_report() from public, anon;
grant execute on function public.officer_committee_members_report() to authenticated;
