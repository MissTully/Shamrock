-- Email members: "By committee" audience.
-- Recipients = active members whose committee_interests contain any selected committee,
-- plus (optional, default on) the chairs of those committees, deduped by member.
-- The Hub resolves the member ids here, then sends with the existing
-- officer_send_member_email(..., p_audience => 'selected', p_member_ids => ids), so the send
-- path, template, opt-out handling, and auth check stay exactly as they are today.
-- Auth: same check as officer_email_audience_counts (public.is_krewe_officer()).
-- NOT APPLIED. Apply only after Melissa approves.

create or replace function public.kos_committee_chair_rows()
returns table (member_id uuid, committee text)
language sql stable security definer set search_path = public as $$
  select m.id, public.kos_normalize_committee(regexp_replace(t, '(committee\s+)?(co-?)?chair(\s+of)?', '', 'gi'))
    from public.members m, regexp_split_to_table(coalesce(m.officer_title,''), '\s*[·|;]\s*') t
   where m.merged_into is null and m.membership_status = 'active' and t ~* 'chair';
$$;
revoke all on function public.kos_committee_chair_rows() from public, anon, authenticated;

create or replace function public.officer_committee_recipients(p_committees text[], p_include_chairs boolean default true)
returns table (member_id uuid, first_name text, last_name text, email text, via text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_krewe_officer() then
    raise exception 'Officers only.';
  end if;
  return query
  with pick as (
    select distinct c from unnest(coalesce(p_committees, '{}'::text[])) c
     where c = any(public.kos_committee_list())
  ),
  hits as (
    select m.id, 'member'::text via from public.members m
     where m.merged_into is null and m.membership_status = 'active'
       and m.committee_interests && (select coalesce(array_agg(c), '{}') from pick)
    union
    select h.member_id, 'chair' from public.kos_committee_chair_rows() h
     where coalesce(p_include_chairs, true) and h.committee in (select c from pick)
  )
  select m.id, m.first_name, m.last_name, lower(m.email), min(h.via)
    from hits h join public.members m on m.id = h.id
   where m.email is not null and position('@' in m.email) > 0
   group by m.id, m.first_name, m.last_name, m.email
   order by m.last_name, m.first_name;
end $$;
revoke all on function public.officer_committee_recipients(text[], boolean) from public, anon;
grant execute on function public.officer_committee_recipients(text[], boolean) to authenticated;

-- Per-committee counts for the chips (members with an email, chairs counted when include_chairs).
create or replace function public.officer_committee_audience_counts(p_include_chairs boolean default true)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_krewe_officer() then
    return jsonb_build_object('ok', false, 'message', 'Officers only.');
  end if;
  return jsonb_build_object('ok', true, 'committees', coalesce((
    select jsonb_object_agg(c, n) from (
      select c, (select count(*) from public.officer_committee_recipients(array[c], p_include_chairs))::int n
        from unnest(public.kos_committee_list()) c
    ) x), '{}'::jsonb));
end $$;
revoke all on function public.officer_committee_audience_counts(boolean) from public, anon;
grant execute on function public.officer_committee_audience_counts(boolean) to authenticated;
