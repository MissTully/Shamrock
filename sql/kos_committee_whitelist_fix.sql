-- Fix: Committee members report showed hobbies (Travel, Music, Movies, "family and the future")
-- as committees. Root cause: kos_normalize_committee() ended with `else initcap(btrim(p))`, so any
-- token from the old-site free-text members.interests field became its own committee.
--
-- Fix: whitelist. Only names in public.kos_committee_list() (the My Krewe picker list) are returned.
-- Known old-site synonyms are mapped; everything else returns null and is dropped from the report.
-- The raw members.interests text is NOT changed, so hobbies still show as "Interests" on profiles.
--
-- Security: a real old-site (Wild Apricot) checkbox, picked by 13 members. It is the Sargent at Arms
-- security team in the bylaws, not one of the Hub committees, so it is dropped by default.
-- To keep it as a committee instead, add 'Security' to kos_committee_list() and to KOS_COMMITTEES
-- in assets/members-desk.js (and the members_committee_interests_check constraint).
--
-- NOT APPLIED. Apply only after Melissa approves.

create or replace function public.kos_normalize_committee(p text)
returns text language sql immutable set search_path = public as $$
  select c from (
    select case
      when p is null or btrim(p) = '' then null
      when p ~* 'by-?laws|rules' then 'Bylaws and Rules'
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
