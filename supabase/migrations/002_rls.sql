-- DeepSeek Harness Web AI — row level security and storage buckets
-- The server talks to Supabase with the service role key (bypasses RLS);
-- policies below protect the anon key used by the browser.

-- ---------------------------------------------------------------------------
-- tables
-- ---------------------------------------------------------------------------
alter table public.projects enable row level security;
alter table public.sessions enable row level security;
alter table public.messages  enable row level security;
alter table public.files     enable row level security;

drop policy if exists "projects_owner" on public.projects;
create policy "projects_owner" on public.projects
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "sessions_owner" on public.sessions;
create policy "sessions_owner" on public.sessions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "messages_owner" on public.messages;
create policy "messages_owner" on public.messages
  for all to authenticated
  using (
    exists (
      select 1 from public.sessions s
      where s.id = messages.session_id and s.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.sessions s
      where s.id = messages.session_id and s.user_id = (select auth.uid())
    )
  );

drop policy if exists "files_owner" on public.files;
create policy "files_owner" on public.files
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- storage buckets: projects workspace, build artifacts, harness chat state
-- Object path convention: <user_id>/...
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values
  ('projects', 'projects', false, 52428800),
  ('artifacts', 'artifacts', false, 52428800),
  ('harness-state', 'harness-state', false, 26214400)
on conflict (id) do nothing;

drop policy if exists "storage_owner" on storage.objects;
create policy "storage_owner" on storage.objects
  for all to authenticated
  using (
    bucket_id in ('projects', 'artifacts', 'harness-state')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id in ('projects', 'artifacts', 'harness-state')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
