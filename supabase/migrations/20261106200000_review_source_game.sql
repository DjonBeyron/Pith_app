-- Источник 'game' в журнале повторений (2026-11-06, CONCEPT_RACE.md → «Этап 2»
-- → «Память: запись из игры»). 'game' — события мини-игры «Встряхни память»:
-- в финале игры клиент шлёт memory_review_word по одному разу на сыгранное
-- слово (good / hard / again по точности слова), p_source = 'game'.
-- Правило шага то же, что у повторения: верный ответ раньше due_on шаг не
-- двигает (applied = false), again — шаг вниз и срок завтра.
-- Идемпотентно: констрейнт пересоздаётся, функция — create or replace.

-- ---------------------------------------------------------------------------
-- Журнал: констрейнт источника (последняя версия — 20261008130000_feed_catch.sql)
-- плюс 'game'
alter table public.review_events drop constraint if exists review_events_source_check;
alter table public.review_events add constraint review_events_source_check
  check (source in ('review', 'feed', 'feed_catch', 'game'));

-- ---------------------------------------------------------------------------
-- Исход повторения — ЦЕЛИКОМ как в 20260926120000_memory_settled.sql (последняя
-- версия функции), изменён только список источников: + 'game' (мини-игра
-- «Встряхни память»). 'feed_catch' сюда не входит — его пишут свои функции
-- memory_catch_heard / memory_catch_help
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
  v_settled date;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'auth');
  end if;
  if p_outcome is null or p_outcome not in ('good', 'hard', 'again', 'fail', 'know') then
    return jsonb_build_object('ok', false, 'reason', 'outcome');
  end if;
  if p_source is null or p_source not in ('review', 'feed', 'game') then
    return jsonb_build_object('ok', false, 'reason', 'source');
  end if;

  select * into m from public.word_memory
  where user_id = v_uid and word = v_word
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  v_today   := public.user_local_today(v_uid);
  v_step    := m.step;
  v_due     := m.due_on;
  v_settled := m.settled_on;

  if p_outcome in ('again', 'fail') then
    v_step    := greatest(1, m.step - case when p_outcome = 'fail' then 2 else 1 end);
    v_due     := v_today + 1;
    v_settled := null;
  elsif m.due_on > v_today then
    v_applied := false;
  else
    if p_outcome = 'hard' then
      v_days := public.word_memory_interval(m.step);
    elsif m.step >= 5 then
      v_step    := 5;
      v_days    := 60;
      v_settled := coalesce(m.settled_on, v_today);
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
      settled_on       = v_settled,
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
    'due_on', v_due, 'applied', v_applied,
    'settled', m.settled_on is null and v_settled is not null, 'settled_on', v_settled);
end;
$$;

revoke all on function public.memory_review_word(text, text, text, text, text, jsonb) from public, anon;
grant execute on function public.memory_review_word(text, text, text, text, text, jsonb) to authenticated;
