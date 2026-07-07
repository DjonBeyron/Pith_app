-- ─────────────────────────────────────────────
--  PITH APP — Supabase schema
--  Run this once in: Supabase → SQL Editor → New query
-- ─────────────────────────────────────────────

-- ── Admin check helper (Этап 0 безопасности) ──
-- Возвращает true, если текущий залогиненный пользователь — админ.
-- SECURITY DEFINER: читает user_profiles в обход RLS (не создаёт рекурсию политик).
-- Используется всеми политиками записи ниже — писать в контент могут только админы.
-- plpgsql выбран специально: тело функции связывается с таблицей user_profiles лениво,
-- в момент вызова, поэтому функцию можно создать даже до создания таблицы (ниже в файле).
create or replace function public.is_admin()
returns boolean
language plpgsql
security definer
stable
as $$
declare
  admin boolean;
begin
  select up.is_admin into admin
  from public.user_profiles up
  where up.id = auth.uid();
  return coalesce(admin, false);
end;
$$;

-- ── Curricula (modules) ───────────────────────
-- Stores module metadata + ordered lesson_ids array.
-- lesson content lives in the `lessons` table separately.
create table if not exists public.curricula (
  id          text primary key,
  title       text not null default '',
  lesson_ids  jsonb not null default '[]',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- RLS immediately after table creation (before any trigger that references other objects)
alter table public.curricula enable row level security;

-- Читать модули может кто угодно (это контент). Писать — только админ.
drop policy if exists "curricula_write_anon_temp" on public.curricula;
drop policy if exists "curricula_select_all"      on public.curricula;
drop policy if exists "curricula_write_admin"      on public.curricula;

create policy "curricula_select_all"
  on public.curricula for select using (true);

create policy "curricula_write_admin"
  on public.curricula for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

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

-- Читать список файлов может кто угодно (тот же принцип, что и у уроков ниже).
drop policy if exists "files_write_anon_temp" on public.files;
drop policy if exists "files_select_all"      on public.files;
drop policy if exists "files_write_admin"      on public.files;

create policy "files_select_all"
  on public.files for select
  using (true);

-- Писать (загружать/удалять записи о файлах) может только админ.
create policy "files_write_admin"
  on public.files for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

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

-- Curricula trigger (after set_updated_at function is defined).
-- Политики curricula определены выше, рядом с созданием таблицы.
drop trigger if exists curricula_updated_at on public.curricula;
create trigger curricula_updated_at
  before update on public.curricula
  for each row execute function public.set_updated_at();

-- ── RLS — Lessons ─────────────────────────────
alter table public.lessons enable row level security;

-- Читать уроки может кто угодно — опубликованные уроки это публичный контент.
drop policy if exists "lessons_write_anon_temp" on public.lessons;
drop policy if exists "lessons_select_all"      on public.lessons;
drop policy if exists "lessons_write_admin"      on public.lessons;

create policy "lessons_select_all"
  on public.lessons for select
  using (true);

-- Создавать/менять/удалять уроки может только админ.
create policy "lessons_write_admin"
  on public.lessons for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

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

-- Читать избранные цвета можно всем, менять — только админ (это часть редактора).
drop policy if exists "hcp_all"          on public.highlight_color_presets;
drop policy if exists "hcp_select_all"   on public.highlight_color_presets;
drop policy if exists "hcp_write_admin"  on public.highlight_color_presets;

create policy "hcp_select_all"
  on public.highlight_color_presets for select
  using (true);

create policy "hcp_write_admin"
  on public.highlight_color_presets for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

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

-- ── XP system (ver 2.0) ──────────────────────────────────────────
alter table public.user_profiles add column if not exists xp integer not null default 0;

-- Один урок можно засчитать пользователю только один раз (защита от повторного XP).
create unique index if not exists lesson_results_user_lesson_uniq
  on public.lesson_results (user_id, lesson_id);

-- ── Complete lesson RPC (Этап 1 безопасности) ────────────────────
-- Единственный способ начислить XP. Клиент передаёт только id урока — сумму награды
-- сервер берёт из СВОЕЙ копии урока (lessons.script->>'lessonXp'), клиент её подделать
-- не может. Начисление ровно один раз на пользователя+урок (повтор → 0).
-- Возвращает фактически начисленный XP (0 при повторе или если не залогинен).
create or replace function public.complete_lesson(p_lesson_id text)
returns integer language plpgsql security definer as $$
declare
  v_uid    uuid := auth.uid();
  v_reward integer;
begin
  if v_uid is null then
    return 0;
  end if;

  -- Атомарно фиксируем прохождение. Если строка уже была — это повтор, XP не даём.
  insert into public.lesson_results (user_id, lesson_id)
  values (v_uid, p_lesson_id)
  on conflict (user_id, lesson_id) do nothing;

  if not found then
    return 0;
  end if;

  -- Награда из серверной копии урока.
  select coalesce((script->>'lessonXp')::int, 0)
  into v_reward
  from public.lessons
  where id = p_lesson_id;

  v_reward := coalesce(v_reward, 0);

  if v_reward > 0 then
    update public.user_profiles
    set xp = xp + v_reward
    where id = v_uid;
  end if;

  return v_reward;
end;
$$;

-- Старый небезопасный RPC удалён: принимал произвольную сумму от клиента (накрутка XP).
drop function if exists public.add_xp(integer);

-- ── Анализ знаний (SKILL_ANALYSIS.md) ─────────────────────────────
-- Лог событий ответов пользователя за прохождения урока: jsonb-массив
-- [{ lessonId, type, attempt, timeMs, option, sessionId, sourceLessonId, at }].
-- Пишется клиентом в конце урока (только своя строка — RLS results_own),
-- читается для расчёта приоритетов уроков.
alter table public.lesson_results add column if not exists answers jsonb;

-- ── Сброс прохождения (тест-кнопки админа) ────────────────────────
-- xp_awarded: за этот урок сейчас начислен XP. Сброс снимает флаг и отнимает
-- XP; повторное прохождение снова ставит флаг и начисляет. Строка при сбросе
-- НЕ удаляется — лог анализа (answers) переживает сброс урока.
alter table public.lesson_results add column if not exists xp_awarded boolean not null default true;

-- complete_lesson v2: начисляет XP, если урок не пройден ИЛИ прохождение
-- было сброшено (xp_awarded=false). Остальная логика прежняя: сумму берёт
-- сервер из своей копии урока, клиент подделать не может.
create or replace function public.complete_lesson(p_lesson_id text)
returns integer language plpgsql security definer as $$
declare
  v_uid    uuid := auth.uid();
  v_reward integer;
begin
  if v_uid is null then
    return 0;
  end if;

  insert into public.lesson_results (user_id, lesson_id, xp_awarded)
  values (v_uid, p_lesson_id, true)
  on conflict (user_id, lesson_id) do update
    set xp_awarded = true, completed_at = now()
    where lesson_results.xp_awarded = false;

  -- Ни вставки, ни обновления — урок уже засчитан, повтор без XP.
  if not found then
    return 0;
  end if;

  select coalesce((script->>'lessonXp')::int, 0)
  into v_reward
  from public.lessons
  where id = p_lesson_id;

  v_reward := coalesce(v_reward, 0);

  if v_reward > 0 then
    update public.user_profiles
    set xp = xp + v_reward
    where id = v_uid;
  end if;

  return v_reward;
end;
$$;

-- ── Новый интерфейс: видео-лента (2026-07-06) ─────────────────────
-- Серверный этап миграции на новый UI (PROJECT.md → «Стратегия миграции»).

-- 1. ДЫРА БЕЗОПАСНОСТИ: политика profiles_own разрешала UPDATE своей строки —
-- залогиненный пользователь мог прямым запросом выставить себе xp, energy и
-- has_subscription. Оставляем только чтение своей строки; ВСЕ изменения
-- игровых полей — исключительно через SECURITY DEFINER RPC (complete_lesson,
-- spend_energy, reset_lesson_progress). Клиент приложения и так только читал.
drop policy if exists "profiles_own"        on public.user_profiles;
drop policy if exists "profiles_select_own" on public.user_profiles;
create policy "profiles_select_own"
  on public.user_profiles for select
  using (auth.uid() = id);

-- 2. Видео фразы у модуля (лента): ссылка на ролик в R2 + постер-кадр
-- для мгновенного показа при скролле. Заполняются из админки (этап позже).
alter table public.curricula add column if not exists video_url  text;
alter table public.curricula add column if not exists poster_url text;

-- 3. Лайки модулей: свою строку пишем/удаляем, читать можно всем — из этой
-- таблицы лента считает счётчики лайков.
create table if not exists public.module_likes (
  user_id    uuid not null references auth.users on delete cascade,
  module_id  text not null references public.curricula on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, module_id)
);

alter table public.module_likes enable row level security;

drop policy if exists "module_likes_select_all" on public.module_likes;
drop policy if exists "module_likes_write_own"  on public.module_likes;

create policy "module_likes_select_all"
  on public.module_likes for select using (true);

create policy "module_likes_write_own"
  on public.module_likes for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 4. Закладки модулей: приватные — и читать, и писать только свои.
create table if not exists public.module_bookmarks (
  user_id    uuid not null references auth.users on delete cascade,
  module_id  text not null references public.curricula on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, module_id)
);

alter table public.module_bookmarks enable row level security;

drop policy if exists "module_bookmarks_own" on public.module_bookmarks;

create policy "module_bookmarks_own"
  on public.module_bookmarks for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 5. Прогресс модулей («Мои уроки»): факт «пользователь начал модуль».
-- Пишется при первом запуске урока модуля. Только свои строки.
create table if not exists public.user_module_progress (
  user_id    uuid not null references auth.users on delete cascade,
  module_id  text not null references public.curricula on delete cascade,
  started_at timestamptz not null default now(),
  primary key (user_id, module_id)
);

alter table public.user_module_progress enable row level security;

drop policy if exists "user_module_progress_own" on public.user_module_progress;

create policy "user_module_progress_own"
  on public.user_module_progress for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── Публикация модулей (2026-07-06) ──────────────────────────────
-- Лента показывает только опубликованные модули; новые создаются черновиками.
alter table public.curricula add column if not exists published boolean not null default false;
-- Разово: всё, что создано до этой миграции, считаем опубликованным
update public.curricula set published = true where created_at < '2026-07-07';

-- ── Кадр мини-постера (2026-07-07) ────────────────────────────────
-- Позиционирование постера в списке «Моих уроков»: { x, y, scale }
-- (x/y — проценты сдвига, scale — зум). Настраивается админом в панели 🎬.
alter table public.curricula add column if not exists poster_crop jsonb;

-- ── Энергия v2 (2026-07-06): бонус 10, потолок 5, капельное восстановление ──
-- Правила (PROJECT.md → «Энергия и монетизация»): лента/Старт/Финал/пересдачи
-- бесплатны; -1 энергия только за старт НОВОГО обычного урока; +1 каждые
-- 4 часа до потолка 5; подписка и админ — безлимит.

-- Точность капли: колонка времени становится timestamptz (была date)
alter table public.user_profiles
  alter column energy_updated_at type timestamptz
  using energy_updated_at::timestamptz;
alter table public.user_profiles alter column energy_updated_at set default now();

-- Бонус новичку: 10 энергии при регистрации (default подхватит handle_new_user)
alter table public.user_profiles alter column energy set default 10;

-- Ленивое капельное восстановление: +1 за каждые полные 4 часа, потолок 5.
create or replace function public.apply_energy_regen(p_uid uuid)
returns void language plpgsql security definer as $$
declare
  prof  public.user_profiles;
  ticks int;
begin
  select * into prof from public.user_profiles where id = p_uid for update;
  if not found then return; end if;
  if prof.energy >= 5 then
    -- Полный бак: часы капли стоят «на нуле», отсчёт начнётся с первой траты
    update public.user_profiles set energy_updated_at = now() where id = p_uid;
    return;
  end if;
  ticks := floor(extract(epoch from (now() - prof.energy_updated_at)) / 14400);
  if ticks <= 0 then return; end if;
  update public.user_profiles
  set energy = least(5, prof.energy + ticks),
      energy_updated_at = case
        when prof.energy + ticks >= 5 then now()
        else prof.energy_updated_at + (ticks * interval '4 hours')
      end
  where id = p_uid;
end;
$$;

-- Сессии уроков: связка «энергия → XP». Пишет только сервер (security
-- definer), клиенту доступно лишь чтение своих строк.
create table if not exists public.lesson_sessions (
  user_id    uuid not null references auth.users on delete cascade,
  lesson_id  text not null references public.lessons on delete cascade,
  started_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

alter table public.lesson_sessions enable row level security;

drop policy if exists "lesson_sessions_select_own" on public.lesson_sessions;
create policy "lesson_sessions_select_own"
  on public.lesson_sessions for select using (auth.uid() = user_id);

-- Старт урока. Возвращает jsonb: { ok, energy?, reason?, next_at? }.
-- Бесплатно: гость, подписка, админ, пересдача засчитанного урока,
-- Старт/Финал модуля (первый/последний id в curricula.lesson_ids —
-- проверяется НА СЕРВЕРЕ, клиент подделать не может).
create or replace function public.start_lesson(p_lesson_id text)
returns jsonb language plpgsql security definer as $$
declare
  v_uid  uuid := auth.uid();
  prof   public.user_profiles;
  v_free boolean;
begin
  if v_uid is null then
    return jsonb_build_object('ok', true, 'guest', true);
  end if;

  perform public.apply_energy_regen(v_uid);
  select * into prof from public.user_profiles where id = v_uid for update;

  -- Сессия — в любом случае: по ней complete_lesson начислит XP
  insert into public.lesson_sessions (user_id, lesson_id)
  values (v_uid, p_lesson_id)
  on conflict (user_id, lesson_id) do update set started_at = now();

  if prof.has_subscription or prof.is_admin then
    return jsonb_build_object('ok', true, 'energy', prof.energy);
  end if;

  -- Пересдача засчитанного урока — бесплатно
  select exists(
    select 1 from public.lesson_results
    where user_id = v_uid and lesson_id = p_lesson_id and xp_awarded
  ) into v_free;
  if not v_free then
    -- Старт (диагностика) и Финал (экзамен) — бесплатно
    select exists(
      select 1 from public.curricula c
      where c.lesson_ids->>0 = p_lesson_id
         or c.lesson_ids->>(jsonb_array_length(c.lesson_ids) - 1) = p_lesson_id
    ) into v_free;
  end if;
  if v_free then
    return jsonb_build_object('ok', true, 'energy', prof.energy);
  end if;

  if prof.energy <= 0 then
    delete from public.lesson_sessions
    where user_id = v_uid and lesson_id = p_lesson_id;
    return jsonb_build_object(
      'ok', false, 'reason', 'no_energy',
      'next_at', prof.energy_updated_at + interval '4 hours');
  end if;

  update public.user_profiles
  set energy = prof.energy - 1,
      energy_updated_at = case when prof.energy >= 5 then now() else energy_updated_at end
  where id = v_uid;

  return jsonb_build_object('ok', true, 'energy', prof.energy - 1);
end;
$$;

-- complete_lesson v3: XP начисляется только если урок был начат через
-- start_lesson (есть сессия) — иначе XP можно было фармить, не тратя энергию.
create or replace function public.complete_lesson(p_lesson_id text)
returns integer language plpgsql security definer as $$
declare
  v_uid    uuid := auth.uid();
  v_reward integer;
begin
  if v_uid is null then
    return 0;
  end if;

  if not exists(
    select 1 from public.lesson_sessions
    where user_id = v_uid and lesson_id = p_lesson_id
  ) then
    return 0;
  end if;
  delete from public.lesson_sessions
  where user_id = v_uid and lesson_id = p_lesson_id;

  insert into public.lesson_results (user_id, lesson_id, xp_awarded)
  values (v_uid, p_lesson_id, true)
  on conflict (user_id, lesson_id) do update
    set xp_awarded = true, completed_at = now()
    where lesson_results.xp_awarded = false;

  if not found then
    return 0;
  end if;

  select coalesce((script->>'lessonXp')::int, 0)
  into v_reward
  from public.lessons
  where id = p_lesson_id;

  v_reward := coalesce(v_reward, 0);

  if v_reward > 0 then
    update public.user_profiles
    set xp = xp + v_reward
    where id = v_uid;
  end if;

  return v_reward;
end;
$$;

-- Сброс СВОЕГО прохождения уроков (тест-кнопки): снимает xp_awarded и отнимает
-- ранее начисленный XP (не ниже нуля). p_clear_answers=true дополнительно
-- стирает лог анализа этих уроков. Возвращает снятую сумму XP.
create or replace function public.reset_lesson_progress(p_lesson_ids text[], p_clear_answers boolean default false)
returns integer language plpgsql security definer as $$
declare
  v_uid    uuid := auth.uid();
  v_refund integer := 0;
begin
  if v_uid is null then
    return 0;
  end if;

  select coalesce(sum(coalesce((l.script->>'lessonXp')::int, 0)), 0)
  into v_refund
  from public.lesson_results r
  join public.lessons l on l.id = r.lesson_id
  where r.user_id = v_uid and r.lesson_id = any(p_lesson_ids) and r.xp_awarded;

  update public.lesson_results
  set xp_awarded = false,
      answers = case when p_clear_answers then null else answers end
  where user_id = v_uid and lesson_id = any(p_lesson_ids);

  if v_refund > 0 then
    update public.user_profiles
    set xp = greatest(0, xp - v_refund)
    where id = v_uid;
  end if;

  return v_refund;
end;
$$;
