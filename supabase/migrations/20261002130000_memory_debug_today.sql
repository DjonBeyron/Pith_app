-- Тест админа (2026-10-02): прогнать слова в повторе «на сегодня» без ожидания.
-- Почему «прожить день» и «сбросить слово» не помогали:
--   1) бюджет карточек дня («минут в день») считается по ЖУРНАЛУ review_events, а
--      «прожить день» двигал только сроки слов — журнал оставался «сегодняшним»;
--      если за день уже набралось карточек на весь бюджет, вкладка «Память» не
--      предлагала повторять слова (оставалось «Памяти пора отдыхать»), хотя сроки
--      наступили;
--   2) «Сбросить слово» ставил срок «завтра» — до повтора оставался ещё «день».
-- Теперь:
--   memory_debug_shift  — «прожить N дней» двигает назад и сроки слов, и журнал
--                         повторений (бюджет дня освобождается, как после смены даты);
--   memory_debug_today  — НОВАЯ: слова к повтору сегодня (все или список) и бюджет
--                         дня свободен; для кнопок «На сегодня» в админке и в окне слова;
--   memory_debug_step   — 'reset' теперь «как новое слово, к повтору сегодня».
-- Только админ, только своя память. Идемпотентно (or replace / drop if exists).

-- «Прожить» N дней: сроки слов и журнал повторений своей памяти — назад
create or replace function public.memory_debug_shift(p_days int) returns int
    language plpgsql security definer
    set search_path = public
    as $$
declare
  v_n    int;
  v_days int := greatest(-365, least(365, coalesce(p_days, 0)));
begin
  if not public.is_admin() then
    raise exception 'memory_debug_shift: admin only';
  end if;
  update public.word_memory
  set due_on = due_on - v_days
  where user_id = auth.uid();
  get diagnostics v_n = row_count;
  update public.review_events
  set created_at = created_at - make_interval(days => v_days)
  where user_id = auth.uid();
  return v_n;
end;
$$;

-- Слова — к повтору сегодня (p_words — список слов; null — все слова памяти) и
-- бюджет дня свободен: журнал последних 36 часов уходит на 2 дня назад, так что
-- сегодняшних карточек в нём нет. Слова, у которых срок уже наступил, не трогаем.
-- { ok, words, journal } | { ok: false, reason }
create or replace function public.memory_debug_today(p_words text[] default null) returns jsonb
    language plpgsql security definer
    set search_path = public
    as $$
declare
  v_uid   uuid := auth.uid();
  v_today date;
  v_keys  text[];
  v_w     int;
  v_j     int;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'auth');
  end if;
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;
  v_today := public.user_local_today(v_uid);
  if p_words is not null then
    select array_agg(distinct public.word_key(w)) into v_keys
    from unnest(p_words) as w
    where public.word_key(w) is not null;
  end if;

  update public.word_memory
  set due_on = v_today
  where user_id = v_uid and due_on > v_today
    and (p_words is null or word = any(coalesce(v_keys, '{}'::text[])));
  get diagnostics v_w = row_count;

  update public.review_events
  set created_at = created_at - interval '2 days'
  where user_id = v_uid and created_at >= now() - interval '36 hours';
  get diagnostics v_j = row_count;

  return jsonb_build_object('ok', true, 'words', v_w, 'journal', v_j);
end;
$$;

-- Пройти слово по уровням и сбросить: 'next' (верный повтор в срок: шаг +1, на
-- шаге 5 — в постоянную память) и 'reset' (как новое: шаг 1, постоянная
-- снимается, счётчики с нуля, срок — СЕГОДНЯ). Журнал повторений не пишется.
create or replace function public.memory_debug_step(p_word text, p_action text) returns jsonb
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
  v_settled date;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'auth');
  end if;
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;
  if p_action is null or p_action not in ('next', 'reset') then
    return jsonb_build_object('ok', false, 'reason', 'action');
  end if;

  select * into m from public.word_memory
  where user_id = v_uid and word = v_word
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  v_today := public.user_local_today(v_uid);

  if p_action = 'reset' then
    update public.word_memory
    set step = 1, due_on = v_today, settled_on = null,
        reviews = 0, lapses = 0, last_reviewed_at = null
    where user_id = v_uid and word = v_word;
    return jsonb_build_object('ok', true, 'word', v_word, 'prev_step', m.step, 'step', 1,
      'due_on', v_today, 'settled', false, 'end', false);
  end if;

  -- next: уже в постоянной памяти — это конец пути
  if m.settled_on is not null then
    return jsonb_build_object('ok', true, 'word', v_word, 'prev_step', m.step, 'step', m.step,
      'due_on', m.due_on, 'settled', true, 'end', true);
  end if;

  if m.step >= 5 then
    v_step := 5;
    v_settled := v_today;
    v_due := v_today + 60;
  else
    v_step := m.step + 1;
    v_settled := null;
    v_due := v_today + public.word_memory_interval(v_step);
  end if;

  update public.word_memory
  set step = v_step, due_on = v_due, settled_on = v_settled,
      last_reviewed_at = now(), reviews = reviews + 1
  where user_id = v_uid and word = v_word;
  return jsonb_build_object('ok', true, 'word', v_word, 'prev_step', m.step, 'step', v_step,
    'due_on', v_due, 'settled', v_settled is not null, 'end', false);
end;
$$;

revoke all on function public.memory_debug_shift(int) from public, anon;
grant execute on function public.memory_debug_shift(int) to authenticated;
revoke all on function public.memory_debug_today(text[]) from public, anon;
grant execute on function public.memory_debug_today(text[]) to authenticated;
revoke all on function public.memory_debug_step(text, text) from public, anon;
grant execute on function public.memory_debug_step(text, text) to authenticated;
