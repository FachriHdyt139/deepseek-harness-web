-- DeepSeek Harness Web AI — initial schema
-- Run this in the Supabase SQL editor (or with the supabase CLI).

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------
create table if not exists public.projects (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 80),
  description   text not null default '',
  repository_url text,
  storage_path  text not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists projects_user_id_idx on public.projects (user_id, updated_at desc);

-- ---------------------------------------------------------------------------
-- sessions
-- ---------------------------------------------------------------------------
create table if not exists public.sessions (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  title      text not null default 'Session',
  status     text not null default 'active' check (status in ('starting', 'active', 'stopped', 'error')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sessions_project_id_idx on public.sessions (project_id, updated_at desc);
create index if not exists sessions_user_id_idx on public.sessions (user_id, updated_at desc);

-- ---------------------------------------------------------------------------
-- messages (chat history metadata; full thread state also lives in Storage)
-- ---------------------------------------------------------------------------
create table if not exists public.messages (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  role       text not null check (role in ('user', 'assistant', 'system', 'tool')),
  content    text not null default '',
  metadata   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists messages_session_id_idx on public.messages (session_id, created_at);

-- ---------------------------------------------------------------------------
-- files (index of the project workspace mirrored in Supabase Storage)
-- ---------------------------------------------------------------------------
create table if not exists public.files (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  path         text not null,
  storage_path text not null,
  size         bigint not null default 0,
  hash         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (project_id, path)
);

create index if not exists files_project_id_idx on public.files (project_id, path);
create index if not exists files_user_id_idx on public.files (user_id);
