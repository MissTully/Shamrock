-- Event flyer storage and officer report compatibility migration.
-- Applied to oazwkwflgbthojvnclfc as event_marketing_and_officer_reports.
-- Demo rows are marked is_demo=true or notes LIKE 'SIM%'.

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('event-flyers','event-flyers',true,10485760,array['image/png','image/jpeg','image/webp','image/gif','application/pdf'])
on conflict (id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists event_flyers_public_read on storage.objects;
drop policy if exists event_flyers_manager_insert on storage.objects;
drop policy if exists event_flyers_manager_update on storage.objects;
drop policy if exists event_flyers_manager_delete on storage.objects;
create policy event_flyers_public_read on storage.objects for select using (bucket_id='event-flyers');
create policy event_flyers_manager_insert on storage.objects for insert to authenticated with check (bucket_id='event-flyers' and public.can_manage_events());
create policy event_flyers_manager_update on storage.objects for update to authenticated using (bucket_id='event-flyers' and public.can_manage_events()) with check (bucket_id='event-flyers' and public.can_manage_events());
create policy event_flyers_manager_delete on storage.objects for delete to authenticated using (bucket_id='event-flyers' and public.can_manage_events());

-- officer_upsert_event must use source='krewe' (the events constraint allows krewe|ikc).
-- The live function is replaced in this migration with the existing Event Studio
-- implementation, retaining officer authorization and flyer_url support.
create or replace function public.officer_upsert_event(p jsonb) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid; v_row public.events%rowtype; v_name text; v_start timestamptz;
begin
 if not public.can_manage_events() then return jsonb_build_object('ok',false,'message','Only board members, officers, and committee chairs can manage events.'); end if;
 v_name:=nullif(btrim(coalesce(p->>'name','')),''); if v_name is null then return jsonb_build_object('ok',false,'message','Event name is required.'); end if;
 begin v_start:=(p->>'start_time')::timestamptz; exception when others then return jsonb_build_object('ok',false,'message','A valid start date/time is required.'); end;
 if v_start is null then return jsonb_build_object('ok',false,'message','A valid start date/time is required.'); end if;
 v_id:=nullif(p->>'id','')::uuid;
 if v_id is null then
  insert into public.events(name,description,event_type,start_time,end_time,location,capacity,is_mandatory,is_public,notes,source,ticket_price_cents,ticket_label,ticket_payment_url,flyer_url,status,created_by)
  values(v_name,nullif(p->>'description',''),coalesce(nullif(p->>'event_type',''),'social'),v_start,nullif(p->>'end_time','')::timestamptz,nullif(p->>'location',''),nullif(p->>'capacity','')::integer,coalesce((p->>'is_mandatory')::boolean,false),coalesce((p->>'is_public')::boolean,true),nullif(p->>'notes',''),'krewe',nullif(p->>'ticket_price_cents','')::integer,nullif(p->>'ticket_label',''),nullif(p->>'ticket_payment_url',''),nullif(p->>'flyer_url',''),coalesce(nullif(p->>'status',''),'published'),auth.uid()) returning * into v_row;
 else
  update public.events e set name=v_name,description=coalesce(nullif(p->>'description',''),e.description),event_type=coalesce(nullif(p->>'event_type',''),e.event_type),start_time=v_start,end_time=case when p ? 'end_time' then nullif(p->>'end_time','')::timestamptz else e.end_time end,location=case when p ? 'location' then nullif(p->>'location','') else e.location end,capacity=case when p ? 'capacity' then nullif(p->>'capacity','')::integer else e.capacity end,is_mandatory=coalesce((p->>'is_mandatory')::boolean,e.is_mandatory),is_public=coalesce((p->>'is_public')::boolean,e.is_public),flyer_url=case when p ? 'flyer_url' then nullif(p->>'flyer_url','') else e.flyer_url end,status=coalesce(nullif(p->>'status',''),e.status),updated_at=now() where e.id=v_id and coalesce(e.source,'')<>'ikc' returning * into v_row;
  if not found then return jsonb_build_object('ok',false,'message','Event not found or cannot be edited.'); end if;
 end if;
 return jsonb_build_object('ok',true,'event',to_jsonb(v_row));
end; $$;
revoke all on function public.officer_upsert_event(jsonb) from public; grant execute on function public.officer_upsert_event(jsonb) to authenticated;

create table if not exists public.volunteer_hours(id uuid primary key default gen_random_uuid(),member_id uuid not null references public.members(id) on delete cascade,season_year integer not null default extract(year from current_date)::integer,activity text not null,hours numeric(7,2) not null check(hours>0),worked_on date default current_date,approved boolean not null default false,status text not null default 'pending',notes text,is_demo boolean not null default false,created_at timestamptz not null default now());
create table if not exists public.waivers(id uuid primary key default gen_random_uuid(),member_id uuid not null references public.members(id) on delete cascade,season_year integer not null,signed_name text not null,signed_at timestamptz not null default now(),is_demo boolean not null default false,unique(member_id,season_year));
create table if not exists public.lockers(id uuid primary key default gen_random_uuid(),member_id uuid references public.members(id),locker_number text,size text default 'medium',holder_name text not null,holder_email text,status text default 'requested',notes text,is_demo boolean not null default false,created_at timestamptz not null default now());
create table if not exists public.carpools(id uuid primary key default gen_random_uuid(),member_id uuid references public.members(id),kind text not null,event text,person_name text not null,person_email text,phone text,pickup_area text,seats integer,notes text,is_demo boolean not null default false,created_at timestamptz not null default now());
create table if not exists public.vanpools(id uuid primary key default gen_random_uuid(),van_name text not null,event text,capacity integer not null,departure text,notes text,is_demo boolean not null default false,created_at timestamptz not null default now());
create table if not exists public.vanpool_reservations(id uuid primary key default gen_random_uuid(),vanpool_id uuid not null references public.vanpools(id),member_id uuid references public.members(id),rider_name text not null,rider_email text,seats integer not null default 1,is_demo boolean not null default false,created_at timestamptz not null default now());
create table if not exists public.content_items(id uuid primary key default gen_random_uuid(),type text not null default 'other',title text,url text,is_published boolean not null default false,notes text,is_demo boolean not null default false,created_at timestamptz not null default now());

-- Enable RLS; officer/member policies in the applied migration allow the
-- existing members.html workflows while keeping write access authenticated.
alter table public.volunteer_hours enable row level security; alter table public.waivers enable row level security; alter table public.lockers enable row level security; alter table public.carpools enable row level security; alter table public.vanpools enable row level security; alter table public.vanpool_reservations enable row level security; alter table public.content_items enable row level security;

create or replace view public.v_report_membership as select count(*)::integer total_members,count(*) filter(where membership_status='active')::integer active_members,count(*) filter(where membership_status='prospect')::integer prospects,count(*) filter(where member_role in('officer','captain','board'))::integer officers,count(*) filter(where join_date>=date_trunc('year',current_date)::date)::integer new_this_year from public.members where coalesce(membership_status,'')<>'merged';
create or replace view public.v_pending_applications as select id,first_name,last_name,email,phone,notes,created_at from public.members where membership_status in('pending-new','pending-renewal','prospect');
create or replace view public.v_report_dues_summary as select membership_year,count(*)::integer invoices,count(*) filter(where paid)::integer paid_count,count(*) filter(where not paid)::integer unpaid_count,count(distinct member_id) filter(where not paid)::integer members_owing,coalesce(sum(amount) filter(where paid),0)::numeric amount_collected,coalesce(sum(amount) filter(where not paid),0)::numeric amount_outstanding from public.dues_payments group by membership_year order by membership_year desc;
create or replace view public.v_outstanding_dues as select m.first_name,m.last_name,m.email,d.membership_year,d.amount,d.due_date,greatest(0,current_date-coalesce(d.due_date,current_date))::integer days_overdue,0::integer reminders_sent from public.dues_payments d join public.members m on m.id=d.member_id where not d.paid;
create or replace view public.v_event_headcount as select e.id,e.name,e.event_type,e.start_time,e.capacity,count(s.id) filter(where s.status<>'cancelled')::integer signups,coalesce(sum(s.guests_count) filter(where s.status<>'cancelled'),0)::integer total_guests,(count(s.id) filter(where s.status<>'cancelled')+coalesce(sum(s.guests_count) filter(where s.status<>'cancelled'),0))::integer total_headcount,case when e.capacity is null then null else greatest(0,e.capacity-(count(s.id) filter(where s.status<>'cancelled')+coalesce(sum(s.guests_count) filter(where s.status<>'cancelled'),0)))::integer end spots_remaining,count(s.id) filter(where s.status='waitlisted')::integer waitlisted,count(s.id) filter(where s.signup_role='volunteer' and s.status<>'cancelled')::integer volunteers from public.events e left join public.event_signups s on s.event_id=e.id group by e.id;
create or replace view public.v_event_attendee_emails as select e.name event_name,m.first_name,m.last_name,m.email,s.signup_role,s.status,s.guests_count from public.event_signups s join public.events e on e.id=s.event_id join public.members m on m.id=s.member_id where s.status<>'cancelled';
create or replace view public.v_parade_ready as select m.id member_id,m.first_name,m.last_name,m.membership_status,exists(select 1 from public.dues_payments d where d.member_id=m.id and d.membership_year=extract(year from current_date)::integer and d.paid) dues_paid,exists(select 1 from public.waivers w where w.member_id=m.id and w.season_year=extract(year from current_date)::integer) waiver_signed,false meeting_attended,coalesce((select sum(v.hours) from public.volunteer_hours v where v.member_id=m.id and v.approved),0)::numeric volunteer_hours_approved,coalesce((select sum(v.hours) from public.volunteer_hours v where v.member_id=m.id),0)::numeric volunteer_hours_logged from public.members m where coalesce(m.membership_status,'')<>'merged';

-- Demo seed (the applied migration uses these same identifiers and existing FKs).
insert into public.vanpools(van_name,event,capacity,departure,notes,is_demo) select 'SIM Krewe Van','SIM Fall Social',12,'9:00 AM','SIM demo van pool',true where not exists(select 1 from public.vanpools where is_demo);
insert into public.content_items(type,title,is_published,notes,is_demo) select 'article','SIM demo content item',true,'SIM demo row',true where not exists(select 1 from public.content_items where is_demo);
