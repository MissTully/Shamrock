-- Event flyer uploads: public "event-flyers" storage bucket for Event Studio.
-- Anyone can read a flyer (they are public marketing material); only members
-- who pass can_manage_events() (see sql/kos_event_studio.sql) may write.
-- Safe to run more than once.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'event-flyers', 'event-flyers', true,
  10485760, -- 10 MB, matches the Event Studio client-side check
  array['application/pdf','image/jpeg','image/png','image/webp']
)
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Event flyers are publicly readable" on storage.objects;
create policy "Event flyers are publicly readable"
  on storage.objects for select
  using (bucket_id = 'event-flyers');

drop policy if exists "Event managers upload flyers" on storage.objects;
create policy "Event managers upload flyers"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'event-flyers' and public.can_manage_events());

drop policy if exists "Event managers update flyers" on storage.objects;
create policy "Event managers update flyers"
  on storage.objects for update to authenticated
  using (bucket_id = 'event-flyers' and public.can_manage_events())
  with check (bucket_id = 'event-flyers' and public.can_manage_events());

drop policy if exists "Event managers delete flyers" on storage.objects;
create policy "Event managers delete flyers"
  on storage.objects for delete to authenticated
  using (bucket_id = 'event-flyers' and public.can_manage_events());
