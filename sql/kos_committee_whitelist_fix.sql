-- Fix: Committee members report showed hobbies (Travel, Music, Movies, "family and the future")
-- as committees. Root cause: kos_normalize_committee() ended with `else initcap(btrim(p))`, so any
-- token from the old-site free-text members.interests field became its own committee.
--
-- Fix: whitelist. Only names in public.kos_committee_list() (the My Krewe picker list) are returned.
-- Known old-site synonyms are mapped; everything else returns null and is dropped from the report.
-- The raw members.interests text is NOT changed or deleted. Non-committee tokens (Movies, Music, Travel,
-- Security, ...) show as a separate "Interests" list on My Krewe and member popups (members-desk.js).
--
-- Security: a real old-site (Wild Apricot) checkbox, picked by 13 members. Melissa: Security is a
-- subcommittee of the Parade committee, so it becomes the official entry 'Parade: Security'
-- (listed right under Parade in the picker and the report). It no longer shows under Interests.
--
-- NOT APPLIED. Apply only after Melissa approves.

-- 1) Official list: add the Parade: Security subcommittee right after Parade.
create or replace function public.kos_committee_list()
returns text[] language sql immutable as $$
  select array['Membership','Bylaws and Rules','Float','Parade','Parade: Security','Social',
               'Charity/Fundraising','Merchandise','Finance','Communication','Technology']::text[];
$$;
grant execute on function public.kos_committee_list() to anon, authenticated;

-- 2) Re-check the committee_interests validation rule against the new list.
alter table public.members drop constraint if exists members_committee_interests_check;
alter table public.members add constraint members_committee_interests_check
  check (committee_interests <@ public.kos_committee_list());

-- 3) Whitelisted normalizer.
create or replace function public.kos_normalize_committee(p text)
returns text language sql immutable set search_path = public as $$
  select c from (
    select case
      when p is null or btrim(p) = '' then null
      when p ~* 'by-?laws|rules' then 'Bylaws and Rules'
      when p ~* 'security' then 'Parade: Security'
      when p ~* 'charit|fundrais' then 'Charity/Fundraising'
      when p ~* '^\s*social|party planning' then 'Social'
      when p ~* 'merch' then 'Merchandise'
      when p ~* '^\s*membership' then 'Membership'
      when p ~* '^\s*float' then 'Float'
      when p ~* '^\s*parade' then 'Parade'
      when p ~* 'financ|treasur' then 'Finance'
      when p ~* 'communicat' then 'Communication'
      when p ~* 'technolog|webmaster' then 'Technology'
      else null
    end as c
  ) x
  where c = any(public.kos_committee_list());
$$;
