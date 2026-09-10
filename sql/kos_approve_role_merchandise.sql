
create or replace function public.approve_role_request(p_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  v_user      uuid;
  v_roles     text[];
  v_committee text;
  v_member    uuid;
begin
  if not public.is_krewe_officer() then raise exception 'Officers only'; end if;
  update public.role_requests
     set status = 'approved', decided_by = auth.uid(), decided_at = now()
   where id = p_id and status = 'pending'
   returning user_id, requested_roles, answers->>'committee'
        into v_user, v_roles, v_committee;
  if v_user is null then raise exception 'Request not found or already decided'; end if;

  insert into public.member_roles (user_id, role, committee, granted_by)
  select v_user, r, case when r = 'committee' then v_committee end, auth.uid()
  from unnest(v_roles) as r
  on conflict (user_id, role) do update
    set committee = coalesce(excluded.committee, public.member_roles.committee),
        granted_by = excluded.granted_by,
        granted_at = now();

  -- Merchandise committee → Shop Studio title on roster (does not grant full board officer)
  if coalesce(v_committee,'') ~* '(merchandise|merch|shop|store)' then
    select member_id into v_member from public.profiles where id = v_user;
    if v_member is not null then
      update public.members
         set officer_title = coalesce(nullif(trim(officer_title), ''), 'Merchandise Chair'),
             updated_at = now()
       where id = v_member
         and (officer_title is null or trim(officer_title) = '' or officer_title ~* '(merchandise|merch|shop|store)');
    end if;
  end if;
end $$;
