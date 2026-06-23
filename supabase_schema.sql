-- ─────────────────────────────────────────────
--  PITH APP — Supabase schema
--  Run this once in: Supabase → SQL Editor → New query
-- ─────────────────────────────────────────────

-- ── Files (ver 2.0 admin panel) ───────────────
-- Generic registry of files uploaded to R2 — independent of lessons.
-- A row only exists here once a file is actually on the server (post-sync).
create table if not exists public.files (
  id           uuid primary key default gen_random_uuid(),
  file_name    text not null,
  size_bytes   bigint not null,
  content_type text not null default 'application/octet-stream',
  r2_url       text not null,
  uploaded_at  timestamptz not null default now()
);

alter table public.files enable row level security;

-- Anyone (including anon) can read the file list — same posture as lessons below.
create policy "files_select_all"
  on public.files for select
  using (true);

-- No auth yet: anon can also write. Replace with admin-only once auth is added.
create policy "files_write_anon_temp"
  on public.files for all
  using (true)
  with check (true);

-- ── Lessons ──────────────────────────────────
-- id is a text string (e.g. "lesson-1") to match the existing app format.
-- blocks stores the full block array as JSON.
create table if not exists public.lessons (
  id         text primary key,
  title      text not null default '',
  published  boolean not null default false,
  blocks     jsonb not null default '[]',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Auto-bump updated_at on every update
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists lessons_updated_at on public.lessons;
create trigger lessons_updated_at
  before update on public.lessons
  for each row execute function public.set_updated_at();

-- ── RLS — Lessons ─────────────────────────────
alter table public.lessons enable row level security;

-- Anyone (including anon) can read lessons.
-- This is intentional: published lessons are public content.
create policy "lessons_select_all"
  on public.lessons for select
  using (true);

-- For now (no auth yet): anon can also write.
-- This policy will be replaced with admin-only once auth is added.
create policy "lessons_write_anon_temp"
  on public.lessons for all
  using (true)
  with check (true);

-- ── User profiles ─────────────────────────────
-- Created automatically on sign-up via trigger.
-- Not needed until auth is implemented — included here for completeness.
create table if not exists public.user_profiles (
  id                    uuid primary key references auth.users on delete cascade,
  energy                int not null default 3,
  energy_updated_at     date not null default current_date,
  has_subscription      boolean not null default false,
  subscription_expires  timestamptz,
  is_admin              boolean not null default false,
  created_at            timestamptz not null default now()
);

alter table public.user_profiles enable row level security;

create policy "profiles_own"
  on public.user_profiles for all
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Auto-create profile when a user signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.user_profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Spend energy RPC ──────────────────────────
-- Called client-side: supabase.rpc('spend_energy')
-- Returns true if energy was spent, false if depleted.
create or replace function public.spend_energy()
returns boolean language plpgsql security definer as $$
declare
  prof public.user_profiles;
begin
  select * into prof
  from public.user_profiles
  where id = auth.uid()
  for update;

  if not found then return false; end if;

  -- Reset energy once per day
  if prof.energy_updated_at < current_date then
    update public.user_profiles
    set energy = 3, energy_updated_at = current_date
    where id = auth.uid();
    prof.energy := 3;
  end if;

  if prof.has_subscription then return true; end if;
  if prof.energy <= 0 then return false; end if;

  update public.user_profiles
  set energy = energy - 1
  where id = auth.uid();

  return true;
end;
$$;

-- ── Lesson script column (ver 2.0 canvas editor) ──
-- Stores the node-graph JSON for the new lesson editor.
-- Run this ALTER if the lessons table already exists from the old app.
alter table public.lessons add column if not exists script jsonb not null default '{"nodes":[]}';

-- ── Highlight color presets (global, singleton row) ──────────────
-- Stores the user's favorite highlight colors, shared across all lessons.
-- Single row with id='global', colors is a JSON array of hex strings.
create table if not exists public.highlight_color_presets (
  id     text primary key,
  colors jsonb not null default '[]'
);

alter table public.highlight_color_presets enable row level security;

create policy "hcp_all"
  on public.highlight_color_presets for all
  using (true)
  with check (true);

-- ── Lesson results ────────────────────────────
create table if not exists public.lesson_results (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users on delete cascade not null,
  lesson_id       text references public.lessons on delete cascade not null,
  errors          int not null default 0,
  elapsed_seconds int not null default 0,
  completed_at    timestamptz not null default now()
);

alter table public.lesson_results enable row level security;

create policy "results_own"
  on public.lesson_results for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
