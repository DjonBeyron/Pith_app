-- Постоянная память (этап 3 вкладки «Моя память», 2026-09-26; PROJECT.md →
-- «Вкладки»). Родное слово (шаг 5), которое вспомнили на месячной проверке
-- (верный ответ в срок на шаге 5), уходит в постоянную память: дата — в
-- settled_on. Ошибка на слове постоянной памяти возвращает его на ступени
-- (settled_on = null, шаг снижается как обычно). Повторы идут и дальше —
-- раз в ~60 дней. Гость — то же правило локально (guestMemory.js).

alter table public.word_memory add column if not exists settled_on date;

comment on column public.word_memory.settled_on is
  'Постоянная память: дата, когда родное слово (шаг 5) вспомнили на месячной проверке. null — слово на ступенях временной памяти.';

-- Догнать уже прошедших проверку: шаг 5, в журнале — засчитанный верный
-- ответ на шаге 5, после которого ошибок не было
update public.word_memory m
set settled_on = e.day
from (
  select distinct on (r.user_id, r.word) r.user_id, r.word, r.created_at, r.created_at::date as day
  from public.review_events r
  where r.step_before = 5 and r.applied and r.outcome in ('good', 'know')
  order by r.user_id, r.word, r.created_at desc
) e
where m.user_id = e.user_id and m.word = e.word and m.step = 5 and m.settled_on is null
  and not exists (
    select 1 from public.review_events x
    where x.user_id = e.user_id and x.word = e.word and x.created_at > e.created_at
      and x.outcome in ('again', 'fail'));

-- Исход повторения — как в 20260924120000_word_memory.sql, плюс постоянная
-- память: верный ответ в срок на шаге 5 → settled_on (если ещё не было);
-- again / fail → settled_on = null. В ответе settled — слово ушло в
-- постоянную память именно сейчас (итог повторения это празднует)
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
  if p_source is null or p_source not in ('review', 'feed') then
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

-- Перенос памяти гостя — как в 20260925160000_memory_import_guest.sql, плюс
-- постоянная память гостя: settled_on берём только у слова на шаге 5, не
-- позже сегодняшнего дня
create or replace function public.memory_import_guest(p_words jsonb) returns jsonb
    language plpgsql security definer
    set search_path = public
    as $$
declare
  v_uid     uuid := auth.uid();
  v_today   date;
  v_n       int := 0;
  v_rc      int;
  r         jsonb;
  v_word    text;
  v_step    int;
  v_due     date;
  v_settled date;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'auth');
  end if;
  if p_words is null or jsonb_typeof(p_words) <> 'array' or jsonb_array_length(p_words) > 500 then
    return jsonb_build_object('ok', false, 'reason', 'words');
  end if;
  v_today := public.user_local_today(v_uid);

  for r in select * from jsonb_array_elements(p_words) loop
    continue when jsonb_typeof(r) <> 'object';
    v_word := public.word_key(r->>'word');
    continue when v_word is null;
    continue when not exists (
      select 1 from public.lessons l
      where public.word_key(l.title) = v_word and public.is_word_lesson(l.id));

    v_step := case when (r->>'step') ~ '^[0-9]{1,2}$' then least(5, greatest(1, (r->>'step')::int)) else 1 end;
    v_due  := case when (r->>'due_on') ~ '^\d{4}-\d{2}-\d{2}$' then (r->>'due_on')::date else v_today + 1 end;
    v_due  := least(v_today + 60, greatest(v_today, v_due));
    v_settled := case when v_step = 5 and (r->>'settled_on') ~ '^\d{4}-\d{2}-\d{2}$'
                      then least(v_today, (r->>'settled_on')::date) end;

    insert into public.word_memory (user_id, word, step, due_on, settled_on, reviews, lapses, last_card_id)
    values (
      v_uid, v_word, v_step, v_due, v_settled,
      case when (r->>'reviews') ~ '^[0-9]{1,4}$' then (r->>'reviews')::int else 0 end,
      case when (r->>'lapses')  ~ '^[0-9]{1,4}$' then (r->>'lapses')::int  else 0 end,
      left(r->>'last_card_id', 64))
    on conflict (user_id, word) do nothing;
    get diagnostics v_rc = row_count;
    v_n := v_n + v_rc;
  end loop;

  return jsonb_build_object('ok', true, 'imported', v_n);
end;
$$;

revoke all on function public.memory_import_guest(jsonb) from public, anon;
grant execute on function public.memory_import_guest(jsonb) to authenticated;
