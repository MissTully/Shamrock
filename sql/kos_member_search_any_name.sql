-- NOT APPLIED. Do not run this on the live database until the owner reviews it.
-- Project: oazwkwflgbthojvnclfc
-- Safe to re-run. Replaces public.search_member_access(text) only.
--
-- Member roles and access, name search.
-- The previous function returned at most 25 non-merged, non-prospect members
-- in last-name order, and it applied that cap before a typed name could
-- match. The Officer Desk then filtered only that page, so a member who
-- sorts later (Anna Peterson is past that page) never appeared, including
-- when the officer typed her first name, last name, or full name.
--
-- A blank query still returns the same short preview: non-prospect members
-- in the usual statuses, 25 rows, last name then first name.
-- A typed query searches every non-merged member, any role or status.
-- Match is case-insensitive and partial, on first name, last name, or the
-- full name in either order ("Anna Peterson" and "Peterson Anna").
-- Commas count as spaces. Email and officer title still match as a
-- whole phrase, and those values are not added to any public page.

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

revoke all on function public.search_member_access(text) from public, anon;
grant execute on function public.search_member_access(text) to authenticated;
