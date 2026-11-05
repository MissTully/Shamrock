-- Krewe of Shamrock: committee interests on member profiles, an Officer Desk
-- member directory for chairs, and finance access limited to the Secretary,
-- Treasurer, President, Membership chair, and the Technology chair / webmaster.
-- Nov 2026 board meeting requests 2 and 3. Apply only after Melissa approves.

begin;

-- 1) The nine permanent committees from the bylaws (section 6), plus Technology
--    because the Krewe has a Chair of Technology.
create or replace function public.kos_committee_list()
returns text[] language sql immutable as $$
  select array['Membership','Bylaws and Rules','Float','Parade','Social',
               'Charity/Fundraising','Merchandise','Finance','Communication','Technology']::text[];
$$;
grant execute on function public.kos_committee_list() to anon, authenticated;

alter table public.members add column if not exists committee_interests text[] not null default '{}';
alter table public.members drop constraint if exists members_committee_interests_check;
alter table public.members add constraint members_committee_interests_check
  check (committee_interests <@ public.kos_committee_list());

-- 2) Members read and save their own committee interests.
create or replace function public.get_my_committee_interests()
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce((select committee_interests from public.members where id = public.kos_current_member_id()), '{}'::text[]);
$$;

create or replace function public.set_my_committee_interests(p_committees text[])
returns text[] language plpgsql security definer set search_path = public as $$
declare v_id uuid := public.kos_current_member_id(); v text[];
begin
  if v_id is null then raise exception 'Sign in to save committee interests.'; end if;
  select coalesce(array_agg(distinct c order by c), '{}') into v
    from unnest(coalesce(p_committees, '{}')) c
   where c = any(public.kos_committee_list());
  update public.members set committee_interests = v, updated_at = now() where id = v_id;
  return v;
end $$;
revoke all on function public.get_my_committee_interests() from public, anon;
revoke all on function public.set_my_committee_interests(text[]) from public, anon;
grant execute on function public.get_my_committee_interests() to authenticated;
grant execute on function public.set_my_committee_interests(text[]) to authenticated;

-- 3) Who counts as a committee chair (any committee row, including Merchandise).
create or replace function public.is_committee_chair()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.member_roles r
                  where r.user_id = auth.uid() and r.role = 'committee' and coalesce(r.committee,'') <> '')
      or exists (select 1 from public.members m join public.profiles p on p.member_id = m.id
                  where p.id = auth.uid() and m.membership_status = 'active' and m.merged_into is null
                    and coalesce(m.officer_title,'') ~* '(chair)');
$$;
revoke all on function public.is_committee_chair() from public, anon;
grant execute on function public.is_committee_chair() to authenticated;

-- 4) Officer Desk member directory: contact info plus committee interests.
--    Officers, board, and every committee chair can read it. No money columns.
create or replace function public.officer_member_directory(p_committee text default null, p_q text default null)
returns table (member_id uuid, first_name text, last_name text, email text, phone text,
               membership_status text, officer_title text, committee_interests text[])
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_krewe_officer() or public.is_committee_chair()) then
    raise exception 'Only officers and committee chairs can open member contacts.';
  end if;
  return query
    select m.id, m.first_name, m.last_name, m.email, m.phone, m.membership_status, m.officer_title, m.committee_interests
      from public.members m
     where m.merged_into is null
       and coalesce(m.member_role,'') <> 'prospect'
       and m.membership_status in ('active','pending')
       and (p_committee is null or p_committee = '' or p_committee = any(m.committee_interests))
       and (p_q is null or p_q = '' or (coalesce(m.first_name,'')||' '||coalesce(m.last_name,'')||' '||coalesce(m.email,'')) ilike '%'||p_q||'%')
     order by m.last_name, m.first_name;
end $$;
revoke all on function public.officer_member_directory(text, text) from public, anon;
grant execute on function public.officer_member_directory(text, text) to authenticated;

-- 5) Finance stays with Secretary, Treasurer, President (not Vice President),
--    the Technology chair / webmaster, and the Membership chair (Lisa needs dues
--    status to move applicants along). Other board members and chairs no longer
--    see Dues & Payments. (Was: any board member.)
create or replace function public.can_view_payments()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.member_roles r
     where r.user_id = auth.uid()
       and (r.role in ('treasurer','secretary')
            or (r.role = 'committee' and coalesce(r.committee,'') ~* '^(technology|finance|membership)$'))
  ) or exists (
    select 1 from public.profiles p join public.members m on m.id = p.member_id
     where p.id = auth.uid() and m.membership_status = 'active' and m.merged_into is null
       and (coalesce(m.officer_title,'') ~* '(treasurer|secretary|webmaster|chair of technology)'
            or (coalesce(m.officer_title,'') ~* 'president' and coalesce(m.officer_title,'') !~* 'vice president'))
  );
$$;

-- Melissa (webmaster) keeps finance access through the Technology committee row.
insert into public.member_roles (user_id, role, committee)
values ('6d91109f-629b-4c93-944f-242e69740bbe', 'committee', 'Technology')
on conflict (user_id, role) do nothing;

commit;

-- Legacy prefill: the old Wild Apricot form had a "Committee Interests" field,
-- but that column was not part of the data imported into Supabase, so there is
-- nothing to prefill yet. Export it from Wild Apricot (Contacts > Export with
-- the Committee Interests field) and we can load it with a follow-up script.
