-- NOT APPLIED. Review, then run in the Supabase SQL editor on oazwkwflgbthojvnclfc.
-- A member can join or leave a committee as a member, but cannot make themselves
-- a chair or change their officer title.
--
-- Committee picks already save through public.set_my_committee_interests(text[]),
-- which writes only committee_interests on the signed-in member's row and keeps
-- values on the official list from public.kos_committee_list().
-- This file only tightens the members_update_self RLS policy so a direct update
-- of the member's own row cannot change officer_title (or member_role or
-- membership_status, which the policy already protected).
-- Officer title changes still go through members_officer_update when
-- is_krewe_officer() is true.
-- Safe to re-run.

drop policy if exists members_update_self on public.members;

create policy members_update_self
  on public.members
  for update
  to authenticated
  using (id = public.kos_current_member_id())
  with check (
    id = public.kos_current_member_id()
    and member_role is not distinct from (
      select m.member_role from public.members m where m.id = public.kos_current_member_id()
    )
    and membership_status is not distinct from (
      select m.membership_status from public.members m where m.id = public.kos_current_member_id()
    )
    and officer_title is not distinct from (
      select m.officer_title from public.members m where m.id = public.kos_current_member_id()
    )
  );

comment on policy members_update_self on public.members is
  'A member may update their own profile row, but not member_role, membership_status, or officer_title.';
