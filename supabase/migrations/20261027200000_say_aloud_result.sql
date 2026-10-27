-- Итог раунда «Скажи вслух» → память и XP (PLAN_NEW_USER.md → «Этап E», 2026-10-27).
-- Клиент (src/shared/api/sayAloudApi.js) шлёт после раунда [{ "word": "...", "ok": true|false }, ...].
-- Правила — как у «Ловли» (feed_catch.sql), шаг НЕ меняется никогда (шаг двигает только повторение):
--   * промах (ok=false)  → слово придёт завтра: due_on = least(due_on, сегодня + 1);
--   * попадание          → в памяти ничего не меняем;
--   * XP: +1 за каждое верно названное слово, у которого due_on <= сегодня («к повтору»),
--     потолок SAY_ALOUD_XP_DAY = 10 XP в день (пояс пользователя). Одно слово оплачивается
--     один раз в день (иначе тот же слой гонять по кругу ради XP). Слова, которых нет в
--     памяти пользователя, молча пропускаются (ни XP, ни записи).
--   * серия (streak) НЕ трогается — игра день серии не закрывает.
-- Учёт потолка — таблица say_aloud_days (день, XP, раундов, оплаченные слова), по образцу
-- review_xp_date/review_xp_today у повторения; XP добавляется в user_profiles.xp тем же
-- способом, что в memory_finish_session. Идемпотентна: повторный запуск файла ничего не ломает.

-- ---------------------------------------------------------------------------
-- Дневной учёт: одна строка на пользователя и день (локальный день пользователя)
create table if not exists public.say_aloud_days (
  user_id uuid not null references auth.users(id) on delete cascade,
  day     date not null,
  xp      integer not null default 0,
  rounds  integer not null default 0,
  words   text[] not null default '{}',
  primary key (user_id, day)
);

comment on table public.say_aloud_days is
  'Мини-игра «Скажи вслух»: XP за день (потолок 10 в say_aloud_result), число раундов и слова, за которые XP уже начислен. Пишет только say_aloud_result.';

alter table public.say_aloud_days enable row level security;

drop policy if exists say_aloud_days_select_own on public.say_aloud_days;
create policy say_aloud_days_select_own on public.say_aloud_days
  for select to authenticated using (user_id = auth.uid());

revoke all on table public.say_aloud_days from anon, authenticated;
grant select on table public.say_aloud_days to authenticated;
grant all on table public.say_aloud_days to service_role;

-- ---------------------------------------------------------------------------
-- Итог раунда: промахи — на завтра, верные слова «к повтору» — XP с потолком
create or replace function public.say_aloud_result(p_items jsonb) returns jsonb
    language plpgsql security definer
    set search_path = public
    as $$
declare
  v_uid   uuid := auth.uid();
  v_cap   constant int := 10;   -- SAY_ALOUD_XP_DAY
  v_per   constant int := 1;    -- XP за слово
  v_today date;
  d       public.say_aloud_days;
  m       public.word_memory;
  r       record;
  v_xp    int := 0;
  v_moved int := 0;
  v_paid  text[] := '{}';
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'auth');
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 20 then
    return jsonb_build_object('ok', false, 'reason', 'items');
  end if;

  v_today := public.user_local_today(v_uid);

  -- Строка дня создаётся и блокируется: два раунда подряд/из двух вкладок не пробьют потолок
  insert into public.say_aloud_days (user_id, day) values (v_uid, v_today)
  on conflict (user_id, day) do nothing;
  select * into d from public.say_aloud_days where user_id = v_uid and day = v_today for update;

  -- Слова раунда без повторов; если слово встретилось дважды — считается промах (ok=false первым)
  for r in
    select distinct on (k) k as word, ok
    from (
      select public.word_key(e ->> 'word') as k, coalesce(e ->> 'ok', 'false') = 'true' as ok
      from jsonb_array_elements(p_items) as e
    ) t
    where k is not null
    order by k, ok
  loop
    select * into m from public.word_memory where user_id = v_uid and word = r.word for update;
    if not found then
      continue;
    end if;

    if not r.ok then
      -- Промах: слово завтра (срок, который уже ближе, не отодвигаем), шаг тот же
      if m.due_on > v_today + 1 then
        update public.word_memory set due_on = v_today + 1 where user_id = v_uid and word = r.word;
        v_moved := v_moved + 1;
      end if;
    elsif m.due_on <= v_today
          and not (r.word = any(d.words))
          and d.xp + v_xp + v_per <= v_cap then
      -- Верно названное слово «к повтору»: +1 XP, слово оплачено на сегодня
      v_xp := v_xp + v_per;
      v_paid := v_paid || r.word;
    end if;
  end loop;

  update public.say_aloud_days
  set xp = xp + v_xp, rounds = rounds + 1, words = words || v_paid
  where user_id = v_uid and day = v_today;

  if v_xp > 0 then
    update public.user_profiles set xp = xp + v_xp where id = v_uid;
  end if;

  return jsonb_build_object('ok', true, 'xp', v_xp, 'moved', v_moved, 'xp_today', d.xp + v_xp, 'xp_cap', v_cap);
end;
$$;

-- Права — как у memory_catch_heard: только вошедшим
revoke all on function public.say_aloud_result(jsonb) from public, anon;
grant execute on function public.say_aloud_result(jsonb) to authenticated;
