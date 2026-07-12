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

-- ── Push-уведомления (Web Push) ─────────────────────────
-- Подписки браузеров на пуши. endpoint — секретный URL, который выдаёт
-- браузер: знание endpoint = владение подпиской, поэтому insert/update/delete
-- открыты (и гостям тоже), а SELECT клиентам не дан вовсе — читает и рассылает
-- только edge-функция push-send сервисным ключом (в обход RLS).
create table if not exists public.push_subscriptions (
  endpoint    text primary key,
  p256dh      text not null,
  auth        text not null,
  user_id     uuid references auth.users (id) on delete cascade,
  ua          text not null default '',
  created_at  timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

create policy push_subs_insert on public.push_subscriptions
  for insert to anon, authenticated with check (true);
create policy push_subs_update on public.push_subscriptions
  for update to anon, authenticated using (true) with check (true);
create policy push_subs_delete on public.push_subscriptions
  for delete to anon, authenticated using (true);

-- ── Шаблоны push-уведомлений (админка → Пуши) ─────────────
-- Готовые тексты с триггерами: manual (ручная отправка), new_module
-- (рассылается при публикации модуля), inactive_today / energy_full
-- (зарезервированы под cron-этап). Правит только админ.
create table if not exists public.push_templates (
  id           uuid primary key default gen_random_uuid(),
  name         text not null default '',
  title        text not null default '',
  body         text not null default '',
  url          text not null default '/',
  trigger_kind text not null default 'manual',
  enabled      boolean not null default true,
  created_at   timestamptz not null default now()
);

alter table public.push_templates enable row level security;

create policy push_templates_admin on public.push_templates
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ── Автоматические пуши: журнал и аудитории ─────────────
-- Журнал отправок: дедупликация + история. Без политик — пишет только
-- edge-функция push-trigger сервисным ключом.
create table if not exists public.push_trigger_log (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid,
  trigger_kind text not null,
  sent_at      timestamptz not null default now()
);
alter table public.push_trigger_log enable row level security;
create index if not exists push_trigger_log_user_kind
  on public.push_trigger_log (user_id, trigger_kind, sent_at desc);

-- Вечерняя аудитория (граница суток — Москва): streak_risk — вчера занимался,
-- сегодня нет; inactive_today — ни вчера, ни сегодня. Только юзеры с подпиской
-- на пуши, не более одного вечернего пуша в день.
create or replace function public.push_audience_evening()
returns table(uid uuid, kind text)
language sql security definer as $$
  with tz as (select (now() at time zone 'Europe/Moscow')::date as today),
  users as (
    select distinct s.user_id as uid
    from public.push_subscriptions s
    where s.user_id is not null
  ),
  done as (
    select r.user_id as uid,
           bool_or((r.completed_at at time zone 'Europe/Moscow')::date = (select today from tz)) as today_done,
           bool_or((r.completed_at at time zone 'Europe/Moscow')::date = (select today from tz) - 1) as yesterday_done
    from public.lesson_results r
    group by r.user_id
  )
  select u.uid,
         case when coalesce(d.yesterday_done, false) then 'streak_risk' else 'inactive_today' end
  from users u
  left join done d on d.uid = u.uid
  where not coalesce(d.today_done, false)
    and not exists (
      select 1 from public.push_trigger_log l
      where l.user_id = u.uid
        and l.trigger_kind in ('streak_risk', 'inactive_today')
        and (l.sent_at at time zone 'Europe/Moscow')::date = (select today from tz)
    );
$$;
revoke execute on function public.push_audience_evening() from public, anon, authenticated;

-- Энергия восстановилась: реген ленивый (1 заряд / 4 часа от energy_updated_at),
-- полный запас = energy_updated_at + (5-energy)*4ч. Один пуш на цикл траты
-- (лог свежее energy_updated_at = уже слали). Безлимитных не трогаем.
create or replace function public.push_audience_energy_full()
returns setof uuid
language sql security definer as $$
  select p.id
  from public.user_profiles p
  where exists (select 1 from public.push_subscriptions s where s.user_id = p.id)
    and coalesce(p.has_subscription, false) = false
    and p.energy < 5
    and p.energy_updated_at + (5 - p.energy) * interval '4 hours' <= now()
    and not exists (
      select 1 from public.push_trigger_log l
      where l.user_id = p.id
        and l.trigger_kind = 'energy_full'
        and l.sent_at >= p.energy_updated_at
    );
$$;
revoke execute on function public.push_audience_energy_full() from public, anon, authenticated;

-- ── Сложность фразы на слух (2026-07-09) ─────────────────────────
-- Краудсорсинговая оценка сложности модуля-фразы: 1 легко (понял с
-- первого раза) · 2 средне (переслушал/частично) · 3 сложно (открыл текст).
-- Одна строка на пользователя+модуль, голос перезаписываемый бессрочно.
create table if not exists public.module_difficulty_votes (
  user_id    uuid not null references auth.users on delete cascade,
  module_id  text not null references public.curricula on delete cascade,
  vote       smallint not null check (vote between 1 and 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, module_id)
);

alter table public.module_difficulty_votes enable row level security;

drop policy if exists mdv_select_all on public.module_difficulty_votes;
drop policy if exists mdv_write_own  on public.module_difficulty_votes;

-- Читать можно всем (для будущих агрегатов), писать — только свою строку.
create policy mdv_select_all
  on public.module_difficulty_votes for select using (true);

create policy mdv_write_own
  on public.module_difficulty_votes for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists mdv_updated_at on public.module_difficulty_votes;
create trigger mdv_updated_at
  before update on public.module_difficulty_votes
  for each row execute function public.set_updated_at();

-- Денормализованный итог на модуле: медиана голосов + их число. Лента и
-- фильтр (этап 2) читают готовые поля, не агрегируя таблицу голосов на лету.
-- Порог «мало оценок» (серая иконка до ~5 голосов) — на клиенте.
alter table public.curricula add column if not exists difficulty smallint;
alter table public.curricula add column if not exists difficulty_votes int not null default 0;

-- Пересчёт итога при каждом голосе. SECURITY DEFINER: писать в curricula
-- политика пускает только админа, а итог должен обновляться от имени
-- любого проголосовавшего.
create or replace function public.recalc_module_difficulty()
returns trigger language plpgsql security definer as $$
declare
  v_module text := coalesce(new.module_id, old.module_id);
  v_med    numeric;
  v_cnt    int;
begin
  select percentile_cont(0.5) within group (order by vote), count(*)
  into v_med, v_cnt
  from public.module_difficulty_votes
  where module_id = v_module;

  update public.curricula
  set difficulty       = case when v_cnt > 0 then round(v_med)::smallint else null end,
      difficulty_votes = v_cnt
  where id = v_module;
  return null;
end;
$$;

drop trigger if exists module_difficulty_recalc on public.module_difficulty_votes;
create trigger module_difficulty_recalc
  after insert or update or delete on public.module_difficulty_votes
  for each row execute function public.recalc_module_difficulty();

-- ══════════════════════════════════════════════════════════════════
-- ── Супергонка + Рейтинг + Достижения (2026-07-09) ────────────────
-- ══════════════════════════════════════════════════════════════════

-- 1. Ник и надетая косметика в профиле.
-- cosmetics = {"bg":true,"frame":true,"medal":true} — что из открытого надето.
alter table public.user_profiles add column if not exists nickname  text  not null default '';
alter table public.user_profiles add column if not exists cosmetics jsonb not null default '{}';

-- Дефолтный ник новичкам: имя из регистрации (metadata.name) или email до @.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.user_profiles (id, nickname)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data->>'name'), ''),
                  split_part(coalesce(new.email, ''), '@', 1)), 20)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Разовый бэкфилл ников уже существующим пользователям.
update public.user_profiles p
set nickname = left(coalesce(nullif(trim(u.raw_user_meta_data->>'name'), ''),
                             split_part(coalesce(u.email, ''), '@', 1)), 20)
from auth.users u
where u.id = p.id and p.nickname = '';

-- Смена ника: только своя строка, 2–20 символов. UPDATE на user_profiles
-- клиенту закрыт (см. «дыра безопасности» выше), поэтому RPC.
create or replace function public.set_nickname(p_nick text)
returns text language plpgsql security definer as $$
declare
  v text := left(trim(coalesce(p_nick, '')), 20);
begin
  if auth.uid() is null then return null; end if;
  if char_length(v) < 2 then raise exception 'nickname_too_short'; end if;
  update public.user_profiles set nickname = v where id = auth.uid();
  return v;
end;
$$;

-- 2. Достижения. Запись — только SECURITY DEFINER RPC (политик на запись нет),
-- чтение всем: рейтинг показывает чужую косметику.
-- kind: level10 (10-й уровень → подложка) · race_finisher (финишировал гонку →
-- рамка) · race_winner (топ-3 гонки → медаль, meta = {"place":1|2|3}, хранится
-- лучшее место за все гонки).
create table if not exists public.user_achievements (
  user_id     uuid not null references auth.users on delete cascade,
  kind        text not null check (kind in ('level10', 'race_finisher', 'race_winner')),
  meta        jsonb not null default '{}',
  unlocked_at timestamptz not null default now(),
  primary key (user_id, kind)
);

alter table public.user_achievements enable row level security;

drop policy if exists ach_select_all on public.user_achievements;
create policy ach_select_all
  on public.user_achievements for select using (true);

-- «10-й уровень»: клиент зовёт, когда видит нужный XP; сервер проверяет сам.
-- Порог = xpLevels.js уровень 10 (8000 XP) — при изменении таблицы уровней
-- поменять и здесь.
create or replace function public.claim_level_achievement()
returns boolean language plpgsql security definer as $$
declare v_xp int;
begin
  if auth.uid() is null then return false; end if;
  select xp into v_xp from public.user_profiles where id = auth.uid();
  if coalesce(v_xp, 0) < 8000 then return false; end if;
  insert into public.user_achievements (user_id, kind)
  values (auth.uid(), 'level10')
  on conflict do nothing;
  return true;
end;
$$;

-- Надеть/снять косметику: сервер пропускает только то, что реально открыто
-- соответствующим достижением. Возвращает применённый набор.
create or replace function public.set_cosmetics(p_cosmetics jsonb)
returns jsonb language plpgsql security definer as $$
declare v jsonb := '{}';
begin
  if auth.uid() is null then return null; end if;
  if coalesce((p_cosmetics->>'bg')::boolean, false) and exists
     (select 1 from public.user_achievements where user_id = auth.uid() and kind = 'level10')
  then v := v || '{"bg":true}'::jsonb; end if;
  if coalesce((p_cosmetics->>'frame')::boolean, false) and exists
     (select 1 from public.user_achievements where user_id = auth.uid() and kind = 'race_finisher')
  then v := v || '{"frame":true}'::jsonb; end if;
  if coalesce((p_cosmetics->>'medal')::boolean, false) and exists
     (select 1 from public.user_achievements where user_id = auth.uid() and kind = 'race_winner')
  then v := v || '{"medal":true}'::jsonb; end if;
  update public.user_profiles set cosmetics = v where id = auth.uid();
  return v;
end;
$$;

-- 3. Гонки. Страница гонки видна всем (анонс), правит только админ.
-- race_lesson_id — сам супер-урок (чат-сценарий темы недели);
-- prep_lesson_ids — упорядоченный список подготовительных уроков (ссылки на
-- lessons.id); порог открытия = сумма их lessonXp, считается на клиенте.
create table if not exists public.races (
  id                uuid primary key default gen_random_uuid(),
  title             text not null default '',
  description       text not null default '',
  race_lesson_id    text references public.lessons on delete set null,
  prep_lesson_ids   jsonb not null default '[]',
  starts_at         timestamptz,
  ends_at           timestamptz,
  results_published boolean not null default false,
  created_at        timestamptz not null default now()
);

alter table public.races enable row level security;

drop policy if exists races_select_all  on public.races;
drop policy if exists races_write_admin on public.races;

create policy races_select_all
  on public.races for select using (true);

create policy races_write_admin
  on public.races for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Результаты участников. Читать — только свою строку (чужие ошибки/время не
-- публичны, итоги выдаёт get_race_results без деталей). Писать — только RPC.
create table if not exists public.race_entries (
  race_id     uuid not null references public.races on delete cascade,
  user_id     uuid not null references auth.users on delete cascade,
  errors      int not null default 0,
  time_ms     bigint not null default 0,
  finished_at timestamptz,
  place       int,
  primary key (race_id, user_id)
);

alter table public.race_entries enable row level security;

drop policy if exists race_entries_select_own on public.race_entries;
create policy race_entries_select_own
  on public.race_entries for select using (auth.uid() = user_id);

-- Финиш гонки: одна запись на пользователя (повтор → already). Ошибки и время
-- присылает клиент (анти-чит — открытый вопрос v1, см. PROJECT.md). 10 минут
-- форы после ends_at — тем, кто стартовал перед самым закрытием.
create or replace function public.finish_race(p_race_id uuid, p_errors int, p_time_ms bigint)
returns jsonb language plpgsql security definer as $$
declare r public.races;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'reason', 'not_logged_in'); end if;
  select * into r from public.races where id = p_race_id;
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_race'); end if;
  if r.starts_at is null or now() < r.starts_at or now() > r.ends_at + interval '10 minutes' then
    return jsonb_build_object('ok', false, 'reason', 'closed');
  end if;
  insert into public.race_entries (race_id, user_id, errors, time_ms, finished_at)
  values (p_race_id, auth.uid(),
          greatest(0, coalesce(p_errors, 0)), greatest(0, coalesce(p_time_ms, 0)), now())
  on conflict (race_id, user_id) do nothing;
  if not found then return jsonb_build_object('ok', false, 'reason', 'already'); end if;
  -- Достижение «Участник гонки» — за финиш.
  insert into public.user_achievements (user_id, kind)
  values (auth.uid(), 'race_finisher')
  on conflict do nothing;
  return jsonb_build_object('ok', true);
end;
$$;

-- Подведение итогов: идемпотентно, зовёт первый же клиент после окончания
-- (флаг results_published берётся атомарно). Места: меньше ошибок выше, при
-- равенстве быстрее время. Топ-3 получают медаль, хранится лучшее место.
create or replace function public.finalize_race(p_race_id uuid)
returns boolean language plpgsql security definer as $$
declare r public.races;
begin
  update public.races set results_published = true
  where id = p_race_id and results_published = false
    and ends_at is not null and ends_at + interval '10 minutes' < now()
  returning * into r;
  if not found then return false; end if; -- рано или уже подведено

  update public.race_entries e
  set place = ranked.rn
  from (
    select user_id,
           row_number() over (order by errors asc, time_ms asc, finished_at asc) as rn
    from public.race_entries
    where race_id = p_race_id and finished_at is not null
  ) ranked
  where e.race_id = p_race_id and e.user_id = ranked.user_id;

  insert into public.user_achievements (user_id, kind, meta)
  select user_id, 'race_winner', jsonb_build_object('place', place)
  from public.race_entries
  where race_id = p_race_id and place between 1 and 3
  on conflict (user_id, kind) do update
    set meta = case
      when (excluded.meta->>'place')::int < coalesce((user_achievements.meta->>'place')::int, 99)
      then excluded.meta else user_achievements.meta end;
  return true;
end;
$$;

-- Итоговая таблица гонки: публично только место и очки (ошибки/время каждый
-- видит лишь свои — через race_entries_select_own). Очки — лексикографическая
-- свёртка (ошибки доминируют, время добивает), согласована с сортировкой мест.
create or replace function public.get_race_results(p_race_id uuid)
returns table(place int, user_id uuid, nickname text, cosmetics jsonb, medal_place int, score int)
language sql security definer as $$
  select e.place, e.user_id, p.nickname, p.cosmetics,
         (a.meta->>'place')::int,
         (greatest(0, 20 - e.errors) * 10000
          + greatest(0, 9999 - (e.time_ms / 1000)::int))::int
  from public.race_entries e
  join public.races r on r.id = e.race_id
  join public.user_profiles p on p.id = e.user_id
  left join public.user_achievements a on a.user_id = e.user_id and a.kind = 'race_winner'
  where e.race_id = p_race_id and r.results_published and e.place is not null
  order by e.place;
$$;

-- 4. Глобальный рейтинг по XP за всё время. SECURITY DEFINER: профили чужих
-- закрыты RLS, наружу отдаём только ник/XP/косметику. Админы скрыты — их XP
-- нафармлен тест-кнопками.
create or replace function public.get_leaderboard(p_limit int default 100)
returns table(user_id uuid, nickname text, xp int, cosmetics jsonb, medal_place int)
language sql security definer as $$
  select p.id, p.nickname, p.xp, p.cosmetics, (a.meta->>'place')::int
  from public.user_profiles p
  left join public.user_achievements a on a.user_id = p.id and a.kind = 'race_winner'
  where not p.is_admin
  order by p.xp desc, p.created_at asc
  limit least(greatest(coalesce(p_limit, 100), 1), 200);
$$;

-- Своё место в рейтинге (для строки «ты №N из M», если не попал в топ).
create or replace function public.get_my_rank()
returns jsonb language sql security definer as $$
  select jsonb_build_object(
    'rank',  (select count(*) + 1 from public.user_profiles q where not q.is_admin and q.xp > p.xp),
    'total', (select count(*)     from public.user_profiles q where not q.is_admin))
  from public.user_profiles p
  where p.id = auth.uid() and not p.is_admin;
$$;

-- ══════════════════════════════════════════════════════════════════
-- ── Правки супергонки и рейтинга по тесту (2026-07-10) ────────────
-- ══════════════════════════════════════════════════════════════════

-- 1. Админы показываются в рейтинге (решение после теста: для проверки и
-- живости топа). Чтобы снова скрыть — вернуть «where not p.is_admin».
create or replace function public.get_leaderboard(p_limit int default 100)
returns table(user_id uuid, nickname text, xp int, cosmetics jsonb, medal_place int)
language sql security definer as $$
  select p.id, p.nickname, p.xp, p.cosmetics, (a.meta->>'place')::int
  from public.user_profiles p
  left join public.user_achievements a on a.user_id = p.id and a.kind = 'race_winner'
  order by p.xp desc, p.created_at asc
  limit least(greatest(coalesce(p_limit, 100), 1), 200);
$$;

create or replace function public.get_my_rank()
returns jsonb language sql security definer as $$
  select jsonb_build_object(
    'rank',  (select count(*) + 1 from public.user_profiles q where q.xp > p.xp),
    'total', (select count(*)     from public.user_profiles q))
  from public.user_profiles p
  where p.id = auth.uid();
$$;

-- 2. Лимиты смены ника: 1-я смена бесплатно, 2-я — через 7 дней после
-- первой, 3-я и дальше — через 30 дней после предыдущей. Админ — всегда.
-- Бэкфилл при установке фичи сменой не считается (changes=0).
alter table public.user_profiles add column if not exists nickname_changed_at timestamptz;
alter table public.user_profiles add column if not exists nickname_changes int not null default 0;

-- Возврат теперь jsonb: { ok, nick?, reason?, next_at? }. Старая версия
-- возвращала text — тип возврата менять нельзя, сначала удаляем.
drop function if exists public.set_nickname(text);

create or replace function public.set_nickname(p_nick text)
returns jsonb language plpgsql security definer as $$
declare
  v    text := left(trim(coalesce(p_nick, '')), 20);
  prof record;
  next_at timestamptz;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'reason', 'not_logged_in'); end if;
  if char_length(v) < 2 then return jsonb_build_object('ok', false, 'reason', 'too_short'); end if;

  select nickname, nickname_changed_at, nickname_changes, is_admin
  into prof from public.user_profiles where id = auth.uid();
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_profile'); end if;

  -- Тот же ник — не считаем сменой
  if prof.nickname = v then return jsonb_build_object('ok', true, 'nick', v); end if;

  if not prof.is_admin and prof.nickname_changes > 0 and prof.nickname_changed_at is not null then
    next_at := prof.nickname_changed_at
      + case when prof.nickname_changes = 1 then interval '7 days' else interval '30 days' end;
    if now() < next_at then
      return jsonb_build_object('ok', false, 'reason', 'too_soon', 'next_at', next_at);
    end if;
  end if;

  update public.user_profiles
  set nickname = v,
      nickname_changed_at = case when prof.is_admin then nickname_changed_at else now() end,
      nickname_changes    = case when prof.is_admin then nickname_changes else nickname_changes + 1 end
  where id = auth.uid();
  return jsonb_build_object('ok', true, 'nick', v);
end;
$$;

-- 3. Задания подготовки гонки — теперь МОДУЛИ (curricula: Старт + уроки +
-- Финал), порог открытия = 80% от суммы XP всех уроков этих модулей.
-- prep_lesson_ids оставлен для совместимости, клиент его больше не читает.
alter table public.races add column if not exists prep_module_ids jsonb not null default '[]';

-- PostgREST кэширует схему — после ALTER просим перечитать сразу, иначе
-- клиент какое-то время видит «Could not find the column ... in schema cache».
notify pgrst, 'reload schema';

-- ══════════════════════════════════════════════════════════════════
-- ── Про-модули: супер-урок гонки (2026-07-10, вторая итерация) ────
-- ══════════════════════════════════════════════════════════════════

-- Про-модуль: как обычный, но без Старта/Финала — только уроки (может быть
-- и один). Скрыт от пользователей (published не включается, в ленту/профиль
-- не попадает); доступен только как супер-урок выбранной гонки. XP за его
-- уроки начисляется НЕ сразу, а после подведения итогов гонки.
alter table public.curricula add column if not exists is_pro boolean not null default false;

-- Супер-урок гонки — про-модуль (поле race_lesson_id устарело, не читается).
alter table public.races add column if not exists race_module_id text references public.curricula on delete set null;

-- Временное место в гонке (среди уже финишировавших) — для экрана итогов
-- супер-урока. Чужие строки закрыты RLS, поэтому SECURITY DEFINER RPC.
create or replace function public.get_my_race_rank(p_race_id uuid)
returns jsonb language sql security definer as $$
  select jsonb_build_object(
    'rank', (
      select count(*) + 1 from public.race_entries q
      where q.race_id = e.race_id and q.finished_at is not null
        and (q.errors < e.errors
             or (q.errors = e.errors and q.time_ms < e.time_ms)
             or (q.errors = e.errors and q.time_ms = e.time_ms and q.finished_at < e.finished_at))),
    'total', (
      select count(*) from public.race_entries q
      where q.race_id = e.race_id and q.finished_at is not null))
  from public.race_entries e
  where e.race_id = p_race_id and e.user_id = auth.uid() and e.finished_at is not null;
$$;

-- finalize_race v2: после расстановки мест начисляет всем финишировавшим
-- отложенный XP супер-урока (сумма lessonXp уроков про-модуля). Во время
-- гонки complete_lesson не вызывается (raceMode плеера) — XP только здесь.
create or replace function public.finalize_race(p_race_id uuid)
returns boolean language plpgsql security definer as $$
declare
  r    public.races;
  v_xp int := 0;
begin
  update public.races set results_published = true
  where id = p_race_id and results_published = false
    and ends_at is not null and ends_at + interval '10 minutes' < now()
  returning * into r;
  if not found then return false; end if; -- рано или уже подведено

  update public.race_entries e
  set place = ranked.rn
  from (
    select user_id,
           row_number() over (order by errors asc, time_ms asc, finished_at asc) as rn
    from public.race_entries
    where race_id = p_race_id and finished_at is not null
  ) ranked
  where e.race_id = p_race_id and e.user_id = ranked.user_id;

  insert into public.user_achievements (user_id, kind, meta)
  select user_id, 'race_winner', jsonb_build_object('place', place)
  from public.race_entries
  where race_id = p_race_id and place between 1 and 3
  on conflict (user_id, kind) do update
    set meta = case
      when (excluded.meta->>'place')::int < coalesce((user_achievements.meta->>'place')::int, 99)
      then excluded.meta else user_achievements.meta end;

  -- Отложенный XP супер-урока всем финишировавшим
  if r.race_module_id is not null then
    select coalesce(sum(coalesce((l.script->>'lessonXp')::int, 0)), 0) into v_xp
    from public.lessons l
    where l.id in (
      select jsonb_array_elements_text(c.lesson_ids)
      from public.curricula c where c.id = r.race_module_id);
    if v_xp > 0 then
      update public.user_profiles p
      set xp = p.xp + v_xp
      from public.race_entries e
      where e.race_id = p_race_id and e.finished_at is not null and p.id = e.user_id;
    end if;
  end if;
  return true;
end;
$$;

-- ── Энергия v3 (2026-07-10): жёсткий потолок 5 всегда ─────────────────────
-- Бонус новичку 10 отменён: профиль рисует 5 молний, а бейдж показывал 10.
-- Теперь больше 5 энергии не бывает нигде: default 5, старые значения
-- обрезаются, check-констрейнт запрещает выход за диапазон на уровне БД.
alter table public.user_profiles alter column energy set default 5;
update public.user_profiles set energy = 5 where energy > 5;
alter table public.user_profiles drop constraint if exists user_profiles_energy_range;
alter table public.user_profiles
  add constraint user_profiles_energy_range check (energy between 0 and 5);

-- ══════════════════════════════════════════════════════════════════
-- ── Подписка Pithy Pro (2026-07-10): оболочка платежей ────────────
-- ══════════════════════════════════════════════════════════════════
-- Решения: 399 ₽/мес; Pro = безлимит энергии + значок PRO в рейтинге.
-- has_subscription остаётся источником правды для всех проверок;
-- subscription_until — срок действия. Выданный вручную безлимит
-- (until is null) не истекает никогда. Платёж создаёт edge-функция
-- create-payment, подтверждает payment-webhook (ЮKassa) — обе работают
-- сервисной ролью; клиенту таблица payments доступна только на чтение своих.

alter table public.user_profiles add column if not exists subscription_until timestamptz;

create table if not exists public.payments (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users on delete cascade,
  provider            text not null default 'yookassa',
  provider_payment_id text unique,
  amount              numeric(10,2) not null,
  currency            text not null default 'RUB',
  status              text not null default 'pending', -- pending | succeeded | canceled
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  raw                 jsonb
);

alter table public.payments enable row level security;
drop policy if exists "payments_select_own" on public.payments;
create policy "payments_select_own"
  on public.payments for select using (auth.uid() = user_id);

-- Активация/продление: +p_days от максимума(сейчас, текущий срок) — досрочная
-- оплата не сжигает оплаченные дни. Только для сервисной роли (вебхук).
create or replace function public.activate_subscription(p_user uuid, p_days int default 30)
returns timestamptz language plpgsql security definer as $$
declare v_until timestamptz;
begin
  update public.user_profiles
  set subscription_until = greatest(coalesce(subscription_until, now()), now())
                           + make_interval(days => p_days),
      has_subscription   = true
  where id = p_user
  returning subscription_until into v_until;
  return v_until;
end;
$$;
revoke execute on function public.activate_subscription(uuid, int) from public, anon, authenticated;
grant execute on function public.activate_subscription(uuid, int) to service_role;

-- Ленивая проверка истечения (как реген энергии): зовётся из start_lesson.
create or replace function public.expire_subscription(p_uid uuid)
returns void language sql security definer as $$
  update public.user_profiles
  set has_subscription = false
  where id = p_uid and has_subscription
    and subscription_until is not null and subscription_until < now();
$$;

-- start_lesson v3: перед проверкой безлимита гасим истёкшую подписку
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

  perform public.expire_subscription(v_uid);
  perform public.apply_energy_regen(v_uid);
  select * into prof from public.user_profiles where id = v_uid for update;

  insert into public.lesson_sessions (user_id, lesson_id)
  values (v_uid, p_lesson_id)
  on conflict (user_id, lesson_id) do update set started_at = now();

  if prof.has_subscription or prof.is_admin then
    return jsonb_build_object('ok', true, 'energy', prof.energy);
  end if;

  select exists(
    select 1 from public.lesson_results
    where user_id = v_uid and lesson_id = p_lesson_id and xp_awarded
  ) into v_free;
  if not v_free then
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

-- Значок PRO в рейтинге: лидерборд отдаёт и флаг подписки. Админ считается
-- Pro автоматически (у него и так безлимит — значок просто показывает это).
-- drop обязателен: у create or replace нельзя менять состав колонок результата
drop function if exists public.get_leaderboard(int);
create function public.get_leaderboard(p_limit int default 100)
returns table(user_id uuid, nickname text, xp int, cosmetics jsonb, medal_place int, is_pro boolean)
language sql security definer as $$
  select p.id, p.nickname, p.xp, p.cosmetics, (a.meta->>'place')::int,
         (p.has_subscription or p.is_admin)
  from public.user_profiles p
  left join public.user_achievements a on a.user_id = p.id and a.kind = 'race_winner'
  order by p.xp desc, p.created_at asc
  limit least(greatest(coalesce(p_limit, 100), 1), 200);
$$;

-- ═══════════════════════════════════════════════════════════════
-- Золотые билеты + достижение «Чистый финал» (2026-07-11)
-- ═══════════════════════════════════════════════════════════════
-- Билет — топ-валюта: выдаётся за прохождение Финала модуля с ≤3
-- подсказками (раскрытиями перевода), максимум один билет с модуля
-- за всю жизнь (module_tickets). Тратится при старте супер-урока
-- гонки (start_race, один раз на гонку — повторный вход после
-- прерывания бесплатный). 0 подсказок = достижение clean_final →
-- золотая подложка (cosmetics.bg2).

alter table public.user_profiles add column if not exists tickets int not null default 0;

-- Реестр «билет с этого модуля уже получен» — гарантия редкости.
-- module_id — text: curricula.id текстовый (не uuid).
create table if not exists public.module_tickets (
  user_id   uuid not null references auth.users on delete cascade,
  module_id text not null references public.curricula on delete cascade,
  hints     int not null default 0,
  earned_at timestamptz not null default now(),
  primary key (user_id, module_id)
);

alter table public.module_tickets enable row level security;
drop policy if exists module_tickets_select_own on public.module_tickets;
create policy module_tickets_select_own
  on public.module_tickets for select using (auth.uid() = user_id);

-- Новый kind достижения: clean_final (Финал без единой подсказки).
alter table public.user_achievements drop constraint if exists user_achievements_kind_check;
alter table public.user_achievements add constraint user_achievements_kind_check
  check (kind in ('level10', 'race_finisher', 'race_winner', 'clean_final'));

-- Выдача билета: клиент зовёт после complete_lesson Финала, передаёт
-- число подсказок (анти-чит v1: серверу приходится верить клиенту —
-- тот же осознанный компромисс, что у времени/ошибок гонки).
-- Сервер проверяет: Финал модуля реально пройден (lesson_results),
-- модуль не про-модуль, билет с модуля ещё не выдавался.
create or replace function public.award_module_ticket(p_module_id text, p_hints int)
returns jsonb language plpgsql security definer as $$
declare
  v_uid     uuid := auth.uid();
  v_hints   int  := greatest(0, coalesce(p_hints, 0));
  v_final   text;
  v_tickets int;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'not_logged_in'); end if;

  select c.lesson_ids->>(jsonb_array_length(c.lesson_ids) - 1)
  into v_final
  from public.curricula c
  where c.id = p_module_id and coalesce(c.is_pro, false) = false;
  if v_final is null then return jsonb_build_object('ok', false, 'reason', 'no_module'); end if;

  if not exists(
    select 1 from public.lesson_results
    where user_id = v_uid and lesson_id = v_final and xp_awarded
  ) then
    return jsonb_build_object('ok', false, 'reason', 'final_not_done');
  end if;

  -- Идеальное прохождение: достижение выдаётся и при пересдаче,
  -- независимо от того, получен ли билет с этого модуля раньше.
  if v_hints = 0 then
    insert into public.user_achievements (user_id, kind)
    values (v_uid, 'clean_final')
    on conflict do nothing;
  end if;

  if v_hints > 3 then
    return jsonb_build_object('ok', false, 'reason', 'hints', 'clean', false);
  end if;

  insert into public.module_tickets (user_id, module_id, hints)
  values (v_uid, p_module_id, v_hints)
  on conflict do nothing;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'already', 'clean', v_hints = 0);
  end if;

  update public.user_profiles
  set tickets = tickets + 1
  where id = v_uid
  returning tickets into v_tickets;

  return jsonb_build_object('ok', true, 'tickets', v_tickets, 'clean', v_hints = 0);
end;
$$;

-- Списания билетов по гонкам: одна строка = вход оплачен. Повторный
-- start_race той же гонки (прерванная попытка) билет не списывает.
create table if not exists public.race_ticket_spends (
  race_id  uuid not null references public.races on delete cascade,
  user_id  uuid not null references auth.users on delete cascade,
  spent_at timestamptz not null default now(),
  primary key (race_id, user_id)
);

alter table public.race_ticket_spends enable row level security;
drop policy if exists race_ticket_spends_select_own on public.race_ticket_spends;
create policy race_ticket_spends_select_own
  on public.race_ticket_spends for select using (auth.uid() = user_id);

-- Открытие доступа к гонке: списывает 1 билет атомарно (админ — бесплатно).
-- Доступно с момента анонса и до конца гонки (не только в сб-вс): билет
-- покупает вход на страницу гонки, супер-урок дальше без доплат.
create or replace function public.start_race(p_race_id uuid)
returns jsonb language plpgsql security definer as $$
declare
  r    public.races;
  prof public.user_profiles;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'reason', 'not_logged_in'); end if;
  select * into r from public.races where id = p_race_id;
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_race'); end if;
  if r.ends_at is not null and now() > r.ends_at then
    return jsonb_build_object('ok', false, 'reason', 'closed');
  end if;

  if exists(select 1 from public.race_ticket_spends
            where race_id = p_race_id and user_id = auth.uid()) then
    return jsonb_build_object('ok', true, 'already', true);
  end if;

  select * into prof from public.user_profiles where id = auth.uid() for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_profile'); end if;

  if not prof.is_admin then
    if coalesce(prof.tickets, 0) <= 0 then
      return jsonb_build_object('ok', false, 'reason', 'no_ticket');
    end if;
    update public.user_profiles set tickets = tickets - 1 where id = auth.uid();
  end if;

  insert into public.race_ticket_spends (race_id, user_id)
  values (p_race_id, auth.uid())
  on conflict do nothing;

  return jsonb_build_object('ok', true, 'tickets', greatest(0, coalesce(prof.tickets, 0) - 1));
end;
$$;

-- set_cosmetics v2: + золотая подложка bg2 (достижение clean_final).
create or replace function public.set_cosmetics(p_cosmetics jsonb)
returns jsonb language plpgsql security definer as $$
declare v jsonb := '{}';
begin
  if auth.uid() is null then return null; end if;
  if coalesce((p_cosmetics->>'bg')::boolean, false) and exists
     (select 1 from public.user_achievements where user_id = auth.uid() and kind = 'level10')
  then v := v || '{"bg":true}'::jsonb; end if;
  if coalesce((p_cosmetics->>'bg2')::boolean, false) and exists
     (select 1 from public.user_achievements where user_id = auth.uid() and kind = 'clean_final')
  then v := v || '{"bg2":true}'::jsonb; end if;
  if coalesce((p_cosmetics->>'frame')::boolean, false) and exists
     (select 1 from public.user_achievements where user_id = auth.uid() and kind = 'race_finisher')
  then v := v || '{"frame":true}'::jsonb; end if;
  if coalesce((p_cosmetics->>'medal')::boolean, false) and exists
     (select 1 from public.user_achievements where user_id = auth.uid() and kind = 'race_winner')
  then v := v || '{"medal":true}'::jsonb; end if;
  update public.user_profiles set cosmetics = v where id = auth.uid();
  return v;
end;
$$;

-- ═══════════════════════════════════════════════════════════════
-- Звёзды обычных уроков (2026-07-11)
-- ═══════════════════════════════════════════════════════════════
-- Чистая косметика на схеме модуля: 3★ — без ошибок, 2★ — 1–2 ошибки,
-- 1★ — пройден. Хранится ЛУЧШИЙ результат (пересдача хуже не портит).
-- Только уроки между Стартом и Финалом; звёзды считает клиент (анти-чит
-- v1 — компромисс как у подсказок Финала, на игровой баланс не влияют).

alter table public.lesson_results add column if not exists stars int not null default 0;

-- Сохранить звёзды урока: кламп 1..3, только вверх (greatest). Требует
-- существующую строку lesson_results (создаёт complete_lesson — RPC зовётся
-- после него). Возвращает итоговые звёзды (0 — строки нет / не залогинен).
create or replace function public.save_lesson_stars(p_lesson_id text, p_stars int)
returns int language plpgsql security definer as $$
declare
  v_stars int := least(3, greatest(1, coalesce(p_stars, 1)));
  v_out   int;
begin
  if auth.uid() is null then return 0; end if;
  update public.lesson_results
  set stars = greatest(stars, v_stars)
  where user_id = auth.uid() and lesson_id = p_lesson_id
  returning stars into v_out;
  return coalesce(v_out, 0);
end;
$$;

-- ═══════════════════════════════════════════════════════════════
-- Аватары из пака DiceBear (2026-07-11)
-- ═══════════════════════════════════════════════════════════════
-- Пользователь не загружает свою картинку — только выбирает сид из
-- фиксированного пака на клиенте (src/shared/lib/avatarPack.js, стиль
-- adventurer). Менять можно без ограничений, в отличие от ника.
-- set_avatar не сверяет сид с точным списком пака (список живёт в JS и
-- может меняться без миграций) — проверяет только безопасный формат
-- (латиница/цифры, до 40 символов), сама картинка всегда рисуется
-- по фиксированному URL DiceBear на клиенте, поэтому подменить sid на
-- чужой домен/скрипт нельзя.
alter table public.user_profiles add column if not exists avatar_seed text;

create or replace function public.set_avatar(p_seed text)
returns text language plpgsql security definer as $$
begin
  if auth.uid() is null then return null; end if;
  if p_seed is not null and p_seed !~ '^[A-Za-z0-9]{1,40}$' then
    return null;
  end if;
  update public.user_profiles set avatar_seed = p_seed where id = auth.uid();
  return p_seed;
end;
$$;

-- Аватар в рейтинге: лидерборд отдаёт и сид. drop обязателен — у create or
-- replace нельзя менять состав колонок результата.
drop function if exists public.get_leaderboard(int);
create function public.get_leaderboard(p_limit int default 100)
returns table(user_id uuid, nickname text, xp int, cosmetics jsonb, medal_place int, is_pro boolean, avatar_seed text)
language sql security definer as $$
  select p.id, p.nickname, p.xp, p.cosmetics, (a.meta->>'place')::int,
         (p.has_subscription or p.is_admin), p.avatar_seed
  from public.user_profiles p
  left join public.user_achievements a on a.user_id = p.id and a.kind = 'race_winner'
  order by p.xp desc, p.created_at asc
  limit least(greatest(coalesce(p_limit, 100), 1), 200);
$$;

notify pgrst, 'reload schema';

-- ══════════════════════════════════════════════════════════════════
-- ── Ежедневный стрик + окно наград (2026-07-12) ───────────────────
-- ══════════════════════════════════════════════════════════════════
-- См. PROJECT.md → «Ежедневный стрик + окно наград» для полного описания
-- механики. Награда — только основной XP (+ билеты на вехах), получение
-- вручную через claim_streak_reward. Заморозки списываются автоматически
-- внутри touch_daily_login при обнаружении пропуска дня.

alter table public.user_profiles add column if not exists current_streak int not null default 0;
alter table public.user_profiles add column if not exists longest_streak int not null default 0;
alter table public.user_profiles add column if not exists last_active_date date;
alter table public.user_profiles add column if not exists last_claimed_streak_day int not null default 0;
-- Заморозка: одна штука про запас, не стакается (флаг, не счётчик).
alter table public.user_profiles add column if not exists has_freeze_charge boolean not null default false;
-- Авто заморозка (обычный пользователь): пул защиты на N пропущенных дней
-- (сейчас 2 при покупке); у PRO эта колонка не используется — там отдельное
-- бесплатное правило внутри touch_daily_login.
alter table public.user_profiles add column if not exists auto_freeze_charges_left int not null default 0;
-- PRO: неделя (ISO, 'IYYY-IW'), в которую уже был прощён один будний день —
-- защита от бесконечного использования бесплатного правила несколько раз в неделю.
alter table public.user_profiles add column if not exists pro_weekday_forgiven_week text;

-- Вехи наград — конфиг в БД, редактируется админом из приложения (этап 8),
-- не кодом. День не из этой таблицы получает дефолт 5 XP (см. claim_streak_reward).
create table if not exists public.streak_milestones (
  day_number    int primary key,
  xp_reward     int not null default 0,
  ticket_reward int not null default 0,
  special       boolean not null default false, -- «спецокно» вместо обычного попапа
  label         text not null default ''
);

alter table public.streak_milestones enable row level security;

drop policy if exists streak_milestones_select_all on public.streak_milestones;
drop policy if exists streak_milestones_write_admin on public.streak_milestones;

create policy streak_milestones_select_all
  on public.streak_milestones for select using (true);

create policy streak_milestones_write_admin
  on public.streak_milestones for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Начальные вехи (37/45 — награда-плейсхолдер, донабить точные числа через
-- админку — этап 8; не блокирует остальную разработку).
insert into public.streak_milestones (day_number, xp_reward, ticket_reward, special, label) values
  (7,   150, 0, false, '7 дней'),
  (15,  300, 0, false, '15 дней'),
  (30,  500, 1, false, '30 дней'),
  (37,  50,  0, false, '37 дней (уточнить награду)'),
  (45,  75,  0, false, '45 дней (уточнить награду)'),
  (182, 0,   2, true,  'Полгода'),
  (365, 0,   3, true,  'Год')
on conflict (day_number) do nothing;

-- Раз при загрузке приложения: считает вход, продлевает/спасает/сбрасывает
-- серию. Границы суток — Москва (тот же часовой пояс, что у вечернего
-- пуша push_audience_evening).
create or replace function public.touch_daily_login()
returns jsonb language plpgsql security definer as $$
declare
  v_uid         uuid := auth.uid();
  prof          public.user_profiles;
  v_today       date;
  v_gap         int;
  v_missed_from date;
  v_missed_to   date;
  v_week        text;
  v_is_pro      boolean;
  v_saved       text := null;
  v_new_streak  int;
begin
  if v_uid is null then return jsonb_build_object('ok', false); end if;

  select * into prof from public.user_profiles where id = v_uid for update;
  if not found then return jsonb_build_object('ok', false); end if;

  v_today  := (now() at time zone 'Europe/Moscow')::date;
  v_is_pro := prof.has_subscription or prof.is_admin;

  if prof.last_active_date = v_today then
    return jsonb_build_object('ok', true, 'streak', prof.current_streak,
      'longest', prof.longest_streak, 'saved_by', null);
  end if;

  if prof.last_active_date is null then
    update public.user_profiles
    set current_streak = 1, longest_streak = greatest(prof.longest_streak, 1),
        last_active_date = v_today
    where id = v_uid;
    return jsonb_build_object('ok', true, 'streak', 1,
      'longest', greatest(prof.longest_streak, 1), 'saved_by', null);
  end if;

  v_gap := v_today - prof.last_active_date;

  if v_gap = 1 then
    v_new_streak := prof.current_streak + 1;
    update public.user_profiles
    set current_streak = v_new_streak,
        longest_streak = greatest(longest_streak, v_new_streak),
        last_active_date = v_today
    where id = v_uid;
    return jsonb_build_object('ok', true, 'streak', v_new_streak,
      'longest', greatest(prof.longest_streak, v_new_streak), 'saved_by', null);
  end if;

  -- v_gap >= 2: пропущено (v_gap - 1) дней между последним визитом и сегодня.
  v_missed_from := prof.last_active_date + 1;
  v_missed_to   := v_today - 1;

  -- PRO: пропущенный диапазон целиком суббота/воскресенье — прощается всегда,
  -- без ограничения раз в неделю (это отдельная, «бесплатная», гарантия).
  if v_is_pro and not exists (
    select 1 from generate_series(v_missed_from, v_missed_to, interval '1 day') d
    where extract(isodow from d) not in (6, 7)
  ) then
    v_saved := 'pro_weekend';
  elsif v_is_pro and v_gap = 2 then
    -- Один пропущенный будний день — прощается, но не чаще раза в неделю.
    v_week := to_char(v_missed_from, 'IYYY-IW');
    if prof.pro_weekday_forgiven_week is distinct from v_week then
      v_saved := 'pro_weekday';
      update public.user_profiles set pro_weekday_forgiven_week = v_week where id = v_uid;
    end if;
  end if;

  -- Заморозка: одна штука, покрывает ровно один пропущенный день.
  if v_saved is null and prof.has_freeze_charge and v_gap = 2 then
    v_saved := 'freeze';
    update public.user_profiles set has_freeze_charge = false where id = v_uid;
  end if;

  -- Авто заморозка: пул на несколько пропущенных дней разом.
  if v_saved is null and prof.auto_freeze_charges_left >= (v_gap - 1) then
    v_saved := 'auto_freeze';
    update public.user_profiles
    set auto_freeze_charges_left = auto_freeze_charges_left - (v_gap - 1)
    where id = v_uid;
  end if;

  if v_saved is not null then
    v_new_streak := prof.current_streak + 1;
    update public.user_profiles
    set current_streak = v_new_streak,
        longest_streak = greatest(longest_streak, v_new_streak),
        last_active_date = v_today
    where id = v_uid;
    return jsonb_build_object('ok', true, 'streak', v_new_streak,
      'longest', greatest(prof.longest_streak, v_new_streak), 'saved_by', v_saved);
  end if;

  -- Ничего не спасло серию — сброс. Непроклеймленные награды сгорают
  -- (last_claimed_streak_day обнуляется вместе со стриком).
  update public.user_profiles
  set current_streak = 1, last_claimed_streak_day = 0, last_active_date = v_today
  where id = v_uid;
  return jsonb_build_object('ok', true, 'streak', 1,
    'longest', prof.longest_streak, 'saved_by', null, 'reset', true);
end;
$$;

-- Забрать награду за следующий незабранный день серии (строго по порядку —
-- нельзя забрать день 5, не забрав день 4). Награда — из streak_milestones,
-- дефолт 5 XP для дней вне таблицы.
create or replace function public.claim_streak_reward()
returns jsonb language plpgsql security definer as $$
declare
  v_uid    uuid := auth.uid();
  prof     public.user_profiles;
  v_day    int;
  v_xp     int;
  v_tick   int;
  v_special boolean;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'not_logged_in'); end if;

  select * into prof from public.user_profiles where id = v_uid for update;
  if not found then return jsonb_build_object('ok', false); end if;

  v_day := prof.last_claimed_streak_day + 1;
  if v_day > prof.current_streak then
    return jsonb_build_object('ok', false, 'reason', 'nothing_to_claim');
  end if;

  select xp_reward, ticket_reward, special into v_xp, v_tick, v_special
  from public.streak_milestones where day_number = v_day;

  if not found then
    v_xp := 5; v_tick := 0; v_special := false;
  end if;

  update public.user_profiles
  set xp = xp + v_xp, tickets = tickets + v_tick, last_claimed_streak_day = v_day
  where id = v_uid;

  return jsonb_build_object('ok', true, 'day', v_day, 'xp', v_xp,
    'tickets', v_tick, 'special', coalesce(v_special, false));
end;
$$;

-- Покупка «Заморозки» — не стакается, ровно одна про запас.
create or replace function public.buy_streak_freeze()
returns jsonb language plpgsql security definer as $$
declare
  v_uid  uuid := auth.uid();
  v_cost int  := 2; -- билетов; потюнить после теста через админку/апдейт
  prof   public.user_profiles;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'not_logged_in'); end if;

  select * into prof from public.user_profiles where id = v_uid for update;
  if not found then return jsonb_build_object('ok', false); end if;

  if prof.has_freeze_charge then
    return jsonb_build_object('ok', false, 'reason', 'already_have');
  end if;
  if prof.tickets < v_cost then
    return jsonb_build_object('ok', false, 'reason', 'not_enough_tickets');
  end if;

  update public.user_profiles
  set tickets = tickets - v_cost, has_freeze_charge = true
  where id = v_uid;

  return jsonb_build_object('ok', true, 'tickets', prof.tickets - v_cost);
end;
$$;

-- Покупка «Авто заморозки» — только обычным пользователям (PRO её получает
-- бесплатно и автоматически, см. touch_daily_login); не стакается — пока
-- пул не обнулится, повторная покупка недоступна.
create or replace function public.buy_auto_freeze()
returns jsonb language plpgsql security definer as $$
declare
  v_uid  uuid := auth.uid();
  v_cost int  := 3; -- билетов; потюнить после теста
  prof   public.user_profiles;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'not_logged_in'); end if;

  select * into prof from public.user_profiles where id = v_uid for update;
  if not found then return jsonb_build_object('ok', false); end if;

  if prof.has_subscription or prof.is_admin then
    return jsonb_build_object('ok', false, 'reason', 'pro_has_it_free');
  end if;
  if prof.auto_freeze_charges_left > 0 then
    return jsonb_build_object('ok', false, 'reason', 'already_have');
  end if;
  if prof.tickets < v_cost then
    return jsonb_build_object('ok', false, 'reason', 'not_enough_tickets');
  end if;

  update public.user_profiles
  set tickets = tickets - v_cost, auto_freeze_charges_left = 2
  where id = v_uid;

  return jsonb_build_object('ok', true, 'tickets', prof.tickets - v_cost);
end;
$$;

-- Рейтинг: добавляем стрик в лидерборд (значок 🔥 у ника).
drop function if exists public.get_leaderboard(int);
create function public.get_leaderboard(p_limit int default 100)
returns table(user_id uuid, nickname text, xp int, cosmetics jsonb, medal_place int, is_pro boolean, avatar_seed text, current_streak int)
language sql security definer as $$
  select p.id, p.nickname, p.xp, p.cosmetics, (a.meta->>'place')::int,
         (p.has_subscription or p.is_admin), p.avatar_seed, p.current_streak
  from public.user_profiles p
  left join public.user_achievements a on a.user_id = p.id and a.kind = 'race_winner'
  order by p.xp desc, p.created_at asc
  limit least(greatest(coalesce(p_limit, 100), 1), 200);
$$;

-- Вечерняя аудитория пушей — переписана на реальный стрик вместо эвристики
-- по lesson_results (этап 9 плана стрика). streak_risk — last_active_date
-- был вчера и current_streak > 0 (серия жива, но под угрозой); иначе —
-- inactive_today. Число дней (streak) прокидывается в текст шаблона
-- (push-trigger/index.ts подставляет {streak}).
drop function if exists public.push_audience_evening();
create function public.push_audience_evening()
returns table(uid uuid, kind text, streak int)
language sql security definer as $$
  with tz as (select (now() at time zone 'Europe/Moscow')::date as today),
  users as (
    select distinct s.user_id as uid
    from public.push_subscriptions s
    where s.user_id is not null
  )
  select u.uid,
         case when p.last_active_date = (select today from tz) - 1 and coalesce(p.current_streak, 0) > 0
              then 'streak_risk' else 'inactive_today' end,
         coalesce(p.current_streak, 0)
  from users u
  join public.user_profiles p on p.id = u.uid
  where coalesce(p.last_active_date, (select today from tz) - 2) < (select today from tz)
    and not exists (
      select 1 from public.push_trigger_log l
      where l.user_id = u.uid
        and l.trigger_kind in ('streak_risk', 'inactive_today')
        and (l.sent_at at time zone 'Europe/Moscow')::date = (select today from tz)
    );
$$;
revoke execute on function public.push_audience_evening() from public, anon, authenticated;

notify pgrst, 'reload schema';
