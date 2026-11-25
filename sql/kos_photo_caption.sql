-- Optional public caption for member gallery photos.
-- NOT APPLIED. Paste this file into the Supabase SQL editor for project
-- oazwkwflgbthojvnclfc (Krewe of Shamrock) and run it. Safe to re-run.
-- The title-to-caption copy runs only when caption is a new column.
-- A later run does not put a review title back under a photo whose
-- caption was cleared on purpose.
--
-- Checked 2026-11-21: public.content_items has no caption column.
-- Columns present: id, type, title, url, is_published, notes, is_demo,
-- created_at, submitted_by, approval_status, approved_at, approved_by,
-- approved_by_name, denial_note.
--
-- Public read is broken for visitors today. content_public_read calls
-- is_krewe_officer(), and anon no longer has EXECUTE on that function
-- (permission denied, SQLSTATE 42501). The gallery then shows
-- "Could not load member photos right now." Officers still read every row
-- through content_officer_write, which is FOR ALL and limited to
-- authenticated, so this public policy does not need the officer check.
-- anon and authenticated already have table-level SELECT, so the new
-- caption column is included. Members still cannot update a row themselves.
-- The caption is written by submit_krewe_photo and, if an officer changes
-- it, by approve_content_item (both security definer).

drop policy if exists content_public_read on public.content_items;
create policy content_public_read on public.content_items
  for select to public
  using (
    is_published = true
    and (
      type not in ('photo', 'video')
      or coalesce(approval_status, 'approved') = 'approved'
    )
  );

-- Copy titles into caption only on the run that adds the column.
-- After that, a blank caption means the member or an officer chose no
-- public line. Re-running this file must leave those blanks alone.
-- The old Hub field was labeled "Photo Title / Caption", so the first
-- copy keeps that line under photos that were already published.
do $caption_col$
declare
  v_had_caption boolean;
begin
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'content_items'
      and column_name = 'caption'
  ) into v_had_caption;

  alter table public.content_items
    add column if not exists caption text;

  if not v_had_caption then
    update public.content_items
       set caption = left(nullif(btrim(title), ''), 240)
     where type = 'photo'
       and caption is null
       and nullif(btrim(coalesce(title, '')), '') is not null;
  end if;
end
$caption_col$;

comment on column public.content_items.caption is
  'Optional public line under a member photo. Blank means the gallery shows the photo with no caption. Max 240 characters.';

alter table public.content_items
  drop constraint if exists content_items_caption_len;

alter table public.content_items
  add constraint content_items_caption_len
  check (caption is null or char_length(caption) <= 240);

-- Submit: keep title required. Caption is optional.
drop function if exists public.submit_krewe_photo(text, text, text);
drop function if exists public.submit_krewe_photo(text, text, text, text);

create function public.submit_krewe_photo(
  p_title text,
  p_url text,
  p_notes text default null::text,
  p_caption text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_new_id uuid;
  v_caption text := nullif(btrim(coalesce(p_caption, '')), '');
begin
  if v_uid is null then
    raise exception 'Sign in required to submit a photo';
  end if;
  if p_title is null or length(trim(p_title)) = 0 then
    raise exception 'Photo title is required';
  end if;
  if p_url is null or length(trim(p_url)) = 0 then
    raise exception 'Photo URL is required';
  end if;
  if not public.has_media_consent() then
    raise exception 'Media consent required before submitting photos';
  end if;
  if v_caption is not null and char_length(v_caption) > 240 then
    raise exception 'Caption must be 240 characters or fewer';
  end if;

  insert into public.content_items (
    type, title, url, notes, caption, is_published, is_demo,
    submitted_by, approval_status
  ) values (
    'photo', trim(p_title), trim(p_url), nullif(trim(coalesce(p_notes, '')), ''),
    v_caption, false, false, v_uid, 'pending'
  )
  returning id into v_new_id;

  insert into public.content_approval_log (content_id, action, officer_id, officer_email, officer_name, note)
  values (v_new_id, 'submit', v_uid, null, public._submitter_label(v_uid), 'Member photo submission');

  return jsonb_build_object('id', v_new_id, 'status', 'pending');
end;
$$;

revoke all on function public.submit_krewe_photo(text, text, text, text) from public;
revoke all on function public.submit_krewe_photo(text, text, text, text) from anon;
grant execute on function public.submit_krewe_photo(text, text, text, text) to authenticated;

-- Officer queue includes the caption so it can be reviewed before approval.
create or replace function public.list_pending_media_approvals()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not public.is_krewe_officer() then return null; end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id,
      'type', c.type,
      'title', c.title,
      'url', c.url,
      'notes', c.notes,
      'caption', c.caption,
      'created_at', c.created_at,
      'submitted_by', c.submitted_by,
      'submitter_name', public._submitter_label(c.submitted_by)
    ) order by c.created_at)
    from public.content_items c
    where c.type in ('photo', 'video')
      and c.approval_status = 'pending'
  ), '[]'::jsonb);
end;
$$;

-- p_caption null (argument omitted) leaves the stored caption as submitted.
-- p_caption '' clears it. A non-blank value replaces it. Videos ignore it.
drop function if exists public.approve_content_item(uuid, text);
drop function if exists public.approve_content_item(uuid, text, text);

create function public.approve_content_item(
  p_id uuid,
  p_note text default null::text,
  p_caption text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_row public.content_items%rowtype;
  v_actor record;
  v_rot jsonb := '{}'::jsonb;
  v_set_caption boolean := p_caption is not null;
  v_caption text := nullif(btrim(coalesce(p_caption, '')), '');
begin
  if not public.is_krewe_officer() then
    return jsonb_build_object('ok', false, 'message', 'Officers only');
  end if;
  if v_set_caption and v_caption is not null and char_length(v_caption) > 240 then
    return jsonb_build_object('ok', false, 'message', 'Caption must be 240 characters or fewer');
  end if;

  select * into v_row from public.content_items
   where id = p_id and type in ('photo', 'video') and approval_status = 'pending'
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'Item not found or already decided');
  end if;

  select * into v_actor from public._officer_actor();

  update public.content_items
     set is_published = true,
         approval_status = 'approved',
         approved_at = now(),
         approved_by = v_actor.uid,
         approved_by_name = v_actor.display_name,
         denial_note = null,
         caption = case
           when v_set_caption and v_row.type = 'photo' then v_caption
           else caption
         end
   where id = p_id;

  insert into public.content_approval_log (content_id, action, officer_id, officer_email, officer_name, note)
  values (p_id, 'approve', v_actor.uid, v_actor.email, v_actor.display_name, nullif(trim(coalesce(p_note, '')), ''));

  if v_row.type = 'video' then
    v_rot := public._rotate_published_videos(p_id);
  end if;

  return jsonb_build_object('ok', true, 'id', p_id, 'type', v_row.type, 'rotation', v_rot);
end;
$$;

revoke all on function public.approve_content_item(uuid, text, text) from public;
revoke all on function public.approve_content_item(uuid, text, text) from anon;
grant execute on function public.approve_content_item(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
