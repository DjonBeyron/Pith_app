-- Память слова — фундамент системы повторения (2026-09-24).
-- Концепция: PROJECT.md → «Система повторения „Моё обучение“».
--
-- Единица памяти — СЛОВО, а не урок: ключ = нормализованное название
-- урока-слова (public.word_key — зеркало src/shared/lib/wordAudio/wordKey.js,
-- тот же ключ, что у библиотеки озвучки word_audio). Одно слово в нескольких
-- модулях = одна строка памяти.
--
-- Слово попадает в память САМО: триггер на lesson_results при первом зачёте
-- урока-слова (урок между Стартом и Финалом модуля). Клиент ничего не зовёт —
-- поэтому любой путь прохождения (схема модуля, lesson_ref, админский тест)
-- заносит слово одинаково.
--
-- Шаги 1..5, интервалы 1/3/7/16/35 дней (на шаге 5 — поддержка 60 дней).
-- Шаг меняет только сервер (memory_review_word): раньше срока верный ответ
-- шаг не двигает, ошибка снижает всегда.

-- ---------------------------------------------------------------------------
-- Ключ слова: апострофы к одному виду, пунктуация по краям прочь, пробелы
-- схлопнуты, нижний регистр; только латиница/цифры/пробел/апостроф/дефис и
-- хотя бы одна латинская буква — иначе null (урок «Таблицы» — не слово).
create or replace function public.word_key(p_text text) returns text
    language plpgsql immutable
    as $$
declare
  v text;
begin
  v := translate(coalesce(p_text, ''), '’‘`´', repeat(chr(39), 4));
  v := regexp_replace(v, '^[\s.,!?;:"''“”«»()\[\]{}…–—-]+', '');
  v := regexp_replace(v, '[\s.,!?;:"“”«»()\[\]{}…–—-]+$', '');
  v := lower(btrim(regexp_replace(v, '\s+', ' ', 'g')));
  if v = '' or v !~ '^[a-z0-9'' -]+$' or v !~ '[a-z]' then
    return null;
  end if;
  return v;
end;
$$;

-- Урок-слово = стоит в каком-то модуле строго между первым (Старт) и
-- последним (Финал) уроком. Тот же критерий, что у копилки слов в профиле
-- (lessonIds.slice(1, -1)).
create or replace function public.is_word_lesson(p_lesson_id text) returns boolean
    language sql stable security definer
    set search_path = public
    as $$
  select exists (
    select 1 from public.curricula c
    where jsonb_typeof(c.lesson_ids) = 'array'
      and jsonb_array_length(c.lesson_ids) > 2
      and c.lesson_ids ? p_lesson_id
      and c.lesson_ids->>0 <> p_lesson_id
      and c.lesson_ids->>(jsonb_array_length(c.lesson_ids) - 1) <> p_lesson_id
  );
$$;

-- «Сегодня» в поясе пользователя (user_profiles.tz, как у стрика).
create or replace function public.user_local_today(p_uid uuid) returns date
    language sql stable security definer
    set search_path = public
    as $$
  select (now() at time zone coalesce(
    (select tz from public.user_profiles where id = p_uid), 'Europe/Moscow'))::date;
$$;

-- Интервал (дней) для шага памяти.
create or replace function public.word_memory_interval(p_step int) returns int
    language sql immutable
    as $$
  select case p_step when 1 then 1 when 2 then 3 when 3 then 7 when 4 then 16 else 35 end;
$$;

-- ---------------------------------------------------------------------------
-- Таблицы

create table if not exists public.word_memory (
  user_id          uuid not null references auth.users(id) on delete cascade,
  word             text not null,
  step             smallint not null default 1 check (step between 1 and 5),
  due_on           date not null,
  last_reviewed_at timestamptz,
  last_card_id     text,
  reviews          integer not null default 0,
  lapses           integer not null default 0,
  created_at       timestamptz not null default now(),
  primary key (user_id, word)
);

comment on table public.word_memory is
  'Память слова для повторения: шаг 1..5 и дата следующего повтора (в поясе пользователя). Пишет только сервер: триггер на lesson_results и RPC memory_review_word.';

create index if not exists word_memory_user_due_idx on public.word_memory (user_id, due_on);

create table if not exists public.review_events (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  word        text not null,
  outcome     text not null check (outcome in ('good', 'hard', 'again', 'fail', 'know')),
  source      text not null default 'review' check (source in ('review', 'feed')),
  lesson_id   text,
  card_id     text,
  step_before smallint,
  step_after  smallint,
  applied     boolean not null default true,
  events      jsonb,
  created_at  timestamptz not null default now()
);

comment on table public.review_events is
  'Журнал повторений: исход слова за сессию (или слайд «Помнишь?» в ленте), шаг до/после, сырые ответы карточек. applied=false — ответ раньше срока, шаг не менялся.';

create index if not exists review_events_user_idx on public.review_events (user_id, created_at desc);

alter table public.word_memory enable row level security;
alter table public.review_events enable row level security;

drop policy if exists word_memory_select_own on public.word_memory;
create policy word_memory_select_own on public.word_memory
  for select to authenticated using (user_id = auth.uid());

drop policy if exists review_events_select_own on public.review_events;
create policy review_events_select_own on public.review_events
  for select to authenticated using (user_id = auth.uid());

-- Писать напрямую нельзя никому из клиентов — только через функции ниже.
revoke all on table public.word_memory from anon, authenticated;
revoke all on table public.review_events from anon, authenticated;
grant select on table public.word_memory to authenticated;
grant select on table public.review_events to authenticated;
grant all on table public.word_memory to service_role;
grant all on table public.review_events to service_role;

-- ---------------------------------------------------------------------------
-- Поля профиля под повторение: минуты в день (потолок карточек 5→8, 10→14,
-- 15→20 — считает клиент, dailyPick.js) и цель обучения (вопрос онбординга —
-- позже, поле заводим сразу, чтобы не делать лишнюю миграцию).

alter table public.user_profiles
  add column if not exists daily_minutes smallint not null default 5;
alter table public.user_profiles
  add column if not exists learning_goal text;

alter table public.user_profiles drop constraint if exists user_profiles_daily_minutes_check;
alter table public.user_profiles add constraint user_profiles_daily_minutes_check
  check (daily_minutes in (5, 10, 15));

alter table public.user_profiles drop constraint if exists user_profiles_learning_goal_check;
alter table public.user_profiles add constraint user_profiles_learning_goal_check
  check (learning_goal is null or learning_goal in ('travel', 'work', 'movies', 'relocation'));

-- ---------------------------------------------------------------------------
-- Занесение слова в память при первом зачёте урока-слова. Повторить завтра.
-- Любая ошибка здесь НЕ должна ломать зачёт урока (XP, звёзды) — ловим всё.

create or replace function public.word_memory_seed() returns trigger
    language plpgsql security definer
    set search_path = public
    as $$
declare
  v_word text;
begin
  if not new.xp_awarded then return new; end if;
  if tg_op = 'UPDATE' and old.xp_awarded then return new; end if;
  if not public.is_word_lesson(new.lesson_id) then return new; end if;

  select public.word_key(title) into v_word from public.lessons where id = new.lesson_id;
  if v_word is null then return new; end if;

  insert into public.word_memory (user_id, word, step, due_on)
  values (new.user_id, v_word, 1, public.user_local_today(new.user_id) + 1)
  on conflict (user_id, word) do nothing;
  return new;
exception when others then
  raise warning 'word_memory_seed: % (lesson %)', sqlerrm, new.lesson_id;
  return new;
end;
$$;

drop trigger if exists lesson_results_word_memory_seed on public.lesson_results;
create trigger lesson_results_word_memory_seed
  after insert or update of xp_awarded on public.lesson_results
  for each row execute function public.word_memory_seed();

-- ---------------------------------------------------------------------------
-- Запуск без лавины: слова, пройденные ДО релиза, заводятся по 5 в день,
-- начиная с завтра; первыми — с меньшими звёздами, среди равных — свежие.
-- Повторный прогон миграции ничего не дублирует (on conflict do nothing).

with done as (
  select r.user_id, public.word_key(l.title) as word, r.stars, r.completed_at
  from public.lesson_results r
  join public.lessons l on l.id = r.lesson_id
  where r.xp_awarded
    and public.is_word_lesson(r.lesson_id)
    and exists (select 1 from auth.users u where u.id = r.user_id)
),
best as (
  select distinct on (user_id, word) user_id, word, stars, completed_at
  from done
  where word is not null
  order by user_id, word, stars asc, completed_at desc
),
ranked as (
  select user_id, word,
         row_number() over (partition by user_id order by stars asc, completed_at desc, word) as rn
  from best
)
insert into public.word_memory (user_id, word, step, due_on)
select user_id, word, 1, public.user_local_today(user_id) + 1 + ((rn - 1) / 5)::int
from ranked
on conflict (user_id, word) do nothing;

-- ---------------------------------------------------------------------------
-- Исход повторения слова. Исход считает клиент по ответам карточек
-- (reviewOutcome.js), шаг и дату — только сервер:
--   good / know → шаг +1 (на шаге 5 — остаётся, поддержка 60 дней)
--   hard        → шаг тот же, интервал текущего шага
--   again       → шаг −1, завтра          (ошибся, на возврате исправил)
--   fail        → шаг −2, завтра          (ошибся и на возврате)
-- Верный ответ раньше срока (слово ещё не созрело) шаг НЕ двигает — только
-- пишется в журнал (applied = false): так двойное повторение за день или
-- «повторить сейчас» не прокачивают память. Ошибка снижает всегда.
-- От 7 дней — разброс ±1 день, чтобы повторения не сбивались в один день.

create or replace function public.memory_review_word(
  p_word text,
  p_outcome text,
  p_card_id text default null,
  p_lesson_id text default null,
  p_source text default 'review',
  p_events jsonb default null
) returns jsonb
    language plpgsql security definer
    set search_path = public
    as $$
declare
  v_uid     uuid := auth.uid();
  v_word    text := public.word_key(p_word);
  m         public.word_memory;
  v_today   date;
  v_step    int;
  v_due     date;
  v_days    int;
  v_applied boolean := true;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'auth');
  end if;
  if p_outcome is null or p_outcome not in ('good', 'hard', 'again', 'fail', 'know') then
    return jsonb_build_object('ok', false, 'reason', 'outcome');
  end if;
  if p_source is null or p_source not in ('review', 'feed') then
    return jsonb_build_object('ok', false, 'reason', 'source');
  end if;

  select * into m from public.word_memory
  where user_id = v_uid and word = v_word
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  v_today := public.user_local_today(v_uid);
  v_step  := m.step;
  v_due   := m.due_on;

  if p_outcome in ('again', 'fail') then
    v_step := greatest(1, m.step - case when p_outcome = 'fail' then 2 else 1 end);
    v_due  := v_today + 1;
  elsif m.due_on > v_today then
    v_applied := false;
  else
    if p_outcome = 'hard' then
      v_days := public.word_memory_interval(m.step);
    elsif m.step >= 5 then
      v_step := 5;
      v_days := 60;
    else
      v_step := m.step + 1;
      v_days := public.word_memory_interval(v_step);
    end if;
    if v_days >= 7 then
      v_days := v_days + floor(random() * 3)::int - 1;
    end if;
    v_due := v_today + v_days;
  end if;

  update public.word_memory
  set step             = v_step,
      due_on           = v_due,
      last_reviewed_at = now(),
      last_card_id     = coalesce(p_card_id, last_card_id),
      reviews          = reviews + 1,
      lapses           = lapses + case when p_outcome in ('again', 'fail') then 1 else 0 end
  where user_id = v_uid and word = v_word;

  insert into public.review_events
    (user_id, word, outcome, source, lesson_id, card_id, step_before, step_after, applied, events)
  values
    (v_uid, v_word, p_outcome, p_source, p_lesson_id, p_card_id, m.step, v_step, v_applied,
     case when p_events is not null and pg_column_size(p_events) <= 16384 then p_events end);

  return jsonb_build_object(
    'ok', true, 'word', v_word, 'prev_step', m.step, 'step', v_step,
    'due_on', v_due, 'applied', v_applied);
end;
$$;

-- Тест интервалов (только админ, только своя память): сдвинуть даты повторов
-- на N дней назад — «прожить» N дней, не дожидаясь их.
create or replace function public.memory_debug_shift(p_days int) returns int
    language plpgsql security definer
    set search_path = public
    as $$
declare
  v_n int;
begin
  if not public.is_admin() then
    raise exception 'memory_debug_shift: admin only';
  end if;
  update public.word_memory
  set due_on = due_on - greatest(-365, least(365, coalesce(p_days, 0)))
  where user_id = auth.uid();
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Права. Supabase по умолчанию раздаёт execute на новые функции anon и
-- authenticated — внутренние закрываем явно.

revoke all on function public.is_word_lesson(text) from public, anon, authenticated;
revoke all on function public.user_local_today(uuid) from public, anon, authenticated;
revoke all on function public.word_memory_seed() from public, anon, authenticated;

revoke all on function public.memory_review_word(text, text, text, text, text, jsonb) from public, anon;
grant execute on function public.memory_review_word(text, text, text, text, text, jsonb) to authenticated;

revoke all on function public.memory_debug_shift(int) from public, anon;
grant execute on function public.memory_debug_shift(int) to authenticated;

grant execute on function public.word_key(text) to anon, authenticated;
grant execute on function public.word_memory_interval(int) to anon, authenticated;
