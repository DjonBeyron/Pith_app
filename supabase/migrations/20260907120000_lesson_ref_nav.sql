-- Нода-ссылка на урок/модуль + универсальная система «Продолжить урок»
-- (см. PROJECT.md/план). Три независимые таблицы:
--   lesson_progress   — чекпойнт «докуда дошёл» (для попапа «Продолжить»)
--   lesson_bookmarks  — закладки на ОТДЕЛЬНЫЕ уроки (module_bookmarks — на
--                        модули целиком, это другая сущность)
--   lesson_nav_stack  — стек паузы/возврата при переходе по ссылке на другой
--                        урок/модуль; одна строка на пользователя, stack —
--                        массив id уроков (top = последний поставленный на паузу)

create table if not exists public.lesson_progress (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  lesson_id  text        not null references public.lessons(id) on delete cascade,
  node_id    text        not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

alter table public.lesson_progress enable row level security;

drop policy if exists lesson_progress_own on public.lesson_progress;
create policy lesson_progress_own
  on public.lesson_progress
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


create table if not exists public.lesson_bookmarks (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  lesson_id  text        not null references public.lessons(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

alter table public.lesson_bookmarks enable row level security;

drop policy if exists lesson_bookmarks_own on public.lesson_bookmarks;
create policy lesson_bookmarks_own
  on public.lesson_bookmarks
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


create table if not exists public.lesson_nav_stack (
  user_id    uuid        primary key references auth.users(id) on delete cascade,
  stack      jsonb       not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.lesson_nav_stack enable row level security;

drop policy if exists lesson_nav_stack_own on public.lesson_nav_stack;
create policy lesson_nav_stack_own
  on public.lesson_nav_stack
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
