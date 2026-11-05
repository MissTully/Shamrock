-- NOT APPLIED. Review, then run in the Supabase SQL editor on oazwkwflgbthojvnclfc.
-- Krewe of Shamrock: Krewe Chat v1 for the Member Hub.
-- Safe to re-run.
--
-- Depends on: members, profiles, is_krewe_officer(), kos_current_member_id().
--
-- What this adds:
--   * chat_channels (seeded: General, Parade day)
--   * chat_messages: text, optional single photo, reply-to, officer pin
--   * chat_reactions: small fixed emoji set, one of each per member per message
--   * No moderation tools (no reports, hide, or mute), by request.
--   * chat_reads: per member last read time, for the bell unread count
--   * Private storage bucket chat-photos (signed-in active members only)
--   * Realtime on messages and reactions (RLS still applies)
-- Never public: anon gets nothing. Only signed-in ACTIVE members read or write.

-- ---------------------------------------------------------------------------
-- A. Helpers
-- ---------------------------------------------------------------------------
create or replace function public.kos_chat_is_member()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1
    from public.profiles p
    join public.members m on m.id = p.member_id
    where p.id = auth.uid()
      and coalesce(m.membership_status, '') = 'active'
      and coalesce(m.member_role, 'member') <> 'prospect'
  );
$$;

-- ---------------------------------------------------------------------------
-- B. Tables
-- ---------------------------------------------------------------------------
create table if not exists public.chat_channels (
  id text primary key,
  name text not null,
  description text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

insert into public.chat_channels (id, name, description, sort_order) values
  ('general', 'General', 'Krewe talk, questions, and good craic', 10),
  ('parade-day', 'Parade day', 'Lineup, meet spots, and day-of updates', 20)
on conflict (id) do nothing;

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  channel_id text not null references public.chat_channels(id) on delete cascade,
  member_id uuid not null default public.kos_current_member_id()
    references public.members(id) on delete cascade,
  body text not null default '',
  photo_path text,
  reply_to uuid references public.chat_messages(id) on delete set null,
  pinned_at timestamptz,
  pinned_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint chat_messages_body_len check (char_length(body) <= 2000),
  constraint chat_messages_has_content check (char_length(trim(body)) > 0 or photo_path is not null)
);
create index if not exists chat_messages_channel_created on public.chat_messages (channel_id, created_at desc);
create index if not exists chat_messages_pinned on public.chat_messages (channel_id) where pinned_at is not null;

create table if not exists public.chat_reactions (
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  member_id uuid not null default public.kos_current_member_id()
    references public.members(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, member_id, emoji),
  constraint chat_reactions_emoji_set check (emoji in ('☘️','❤️','😂','👍','🎉','🍀'))
);

create table if not exists public.chat_reads (
  member_id uuid not null references public.members(id) on delete cascade,
  channel_id text not null references public.chat_channels(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (member_id, channel_id)
);

-- ---------------------------------------------------------------------------
-- C. Row Level Security
-- ---------------------------------------------------------------------------
alter table public.chat_channels enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_reactions enable row level security;
alter table public.chat_reads enable row level security;

revoke all on public.chat_channels, public.chat_messages, public.chat_reactions,
  public.chat_reads from anon;
grant select on public.chat_channels to authenticated;
grant select, insert, delete on public.chat_messages to authenticated;
grant select, insert, delete on public.chat_reactions to authenticated;
grant select, insert, update on public.chat_reads to authenticated;

drop policy if exists chat_channels_read on public.chat_channels;
create policy chat_channels_read on public.chat_channels for select to authenticated
  using (public.kos_chat_is_member());

drop policy if exists chat_messages_read on public.chat_messages;
create policy chat_messages_read on public.chat_messages for select to authenticated
  using (public.kos_chat_is_member());

drop policy if exists chat_messages_insert on public.chat_messages;
create policy chat_messages_insert on public.chat_messages for insert to authenticated
  with check (
    public.kos_chat_is_member()
    and member_id = public.kos_current_member_id()
    and pinned_at is null and pinned_by is null
    and (photo_path is null or photo_path like auth.uid()::text || '/%')
  );

-- No direct UPDATE grant: pins go through the officer RPC below.
-- Authors delete their own messages only.
drop policy if exists chat_messages_delete on public.chat_messages;
create policy chat_messages_delete on public.chat_messages for delete to authenticated
  using (public.kos_chat_is_member() and member_id = public.kos_current_member_id());

drop policy if exists chat_reactions_read on public.chat_reactions;
create policy chat_reactions_read on public.chat_reactions for select to authenticated
  using (public.kos_chat_is_member());
drop policy if exists chat_reactions_insert on public.chat_reactions;
create policy chat_reactions_insert on public.chat_reactions for insert to authenticated
  with check (public.kos_chat_is_member() and member_id = public.kos_current_member_id());
drop policy if exists chat_reactions_delete on public.chat_reactions;
create policy chat_reactions_delete on public.chat_reactions for delete to authenticated
  using (member_id = public.kos_current_member_id());

drop policy if exists chat_reads_own on public.chat_reads;
create policy chat_reads_own on public.chat_reads for all to authenticated
  using (member_id = public.kos_current_member_id())
  with check (member_id = public.kos_current_member_id() and public.kos_chat_is_member());

-- ---------------------------------------------------------------------------
-- D. Officer pin RPC (is_krewe_officer() gate)
-- ---------------------------------------------------------------------------
create or replace function public.chat_set_pinned(p_message uuid, p_pinned boolean)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.is_krewe_officer() then raise exception 'Officers only'; end if;
  update public.chat_messages
     set pinned_at = case when p_pinned then now() end,
         pinned_by = case when p_pinned then public.kos_current_member_id() end
   where id = p_message;
end $$;

-- Bell: unread messages across channels, not counting your own.
create or replace function public.chat_unread_count()
returns integer language sql stable security definer set search_path to 'public' as $$
  select case when not public.kos_chat_is_member() then 0 else (
    select count(*)::int
    from public.chat_messages m
    left join public.chat_reads rd
      on rd.channel_id = m.channel_id and rd.member_id = public.kos_current_member_id()
    where m.member_id <> public.kos_current_member_id()
      and m.created_at > coalesce(rd.last_read_at, now() - interval '14 days')
  ) end;
$$;

create or replace function public.chat_mark_read(p_channel text)
returns void language sql security definer set search_path to 'public' as $$
  insert into public.chat_reads (member_id, channel_id, last_read_at)
  select public.kos_current_member_id(), p_channel, now()
  where public.kos_chat_is_member()
  on conflict (member_id, channel_id) do update set last_read_at = now();
$$;

revoke execute on function public.kos_chat_is_member(),
  public.chat_set_pinned(uuid, boolean), public.chat_unread_count(), public.chat_mark_read(text)
  from public, anon;
grant execute on function public.kos_chat_is_member(),
  public.chat_set_pinned(uuid, boolean), public.chat_unread_count(), public.chat_mark_read(text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- E. Private photo bucket. Paths: <auth uid>/<uuid>.<ext>. 5 MB, images only.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-photos', 'chat-photos', false, 5242880,
        array['image/jpeg','image/png','image/webp','image/gif','image/heic'])
on conflict (id) do update set public = false,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists chat_photos_read on storage.objects;
create policy chat_photos_read on storage.objects for select to authenticated
  using (bucket_id = 'chat-photos' and public.kos_chat_is_member());
drop policy if exists chat_photos_insert on storage.objects;
create policy chat_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'chat-photos' and public.kos_chat_is_member()
    and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists chat_photos_delete on storage.objects;
create policy chat_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'chat-photos' and (
    (storage.foldername(name))[1] = auth.uid()::text));

-- ---------------------------------------------------------------------------
-- F. Realtime (postgres_changes honors RLS above)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_messages') then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_reactions') then
    alter publication supabase_realtime add table public.chat_reactions;
  end if;
end $$;
alter table public.chat_reactions replica identity full;
