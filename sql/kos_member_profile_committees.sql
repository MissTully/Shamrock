-- My Krewe: show each member's committees on other members' profile popups.
-- Adds committee_interests to v_member_profiles (same columns and filters as live, plus
-- committee_interests at the end). The Hub falls back to old-site interests when it is empty.
-- NOT APPLIED. Apply only after Melissa approves.
create or replace view public.v_member_profiles as
 select id as member_id, first_name, last_name, member_role, membership_status, officer_title,
        bio, hometown, parade_since, interests, hobbies, favorite_memory, fun_fact, photo_url, join_date,
        case when birthday is not null then to_char(birthday::timestamptz, 'FMMonth FMDD') else null end as birthday_md,
        case when anniversary is not null then to_char(anniversary::timestamptz, 'FMMonth FMDD') else null end as anniversary_md,
        phone,
        coalesce(committee_interests, '{}'::text[]) as committee_interests
   from public.members m
  where coalesce(membership_status, 'active') = 'active'
    and coalesce(profile_visible, true) = true
    and coalesce(member_role, 'member') <> 'prospect'
    and merged_into is null;
alter view public.v_member_profiles set (security_invoker = true);
