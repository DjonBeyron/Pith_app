-- «Ловля слов в ленте» (2026-10-08). Фраза модуля скрыта шариками; если во
-- фразе есть слова из памяти пользователя (шаг ≥ 3), лента предлагает
-- напечатать те, что он расслышал. Два сигнала в память — оба БЕЗ смены шага
-- (шаг двигает только memory_review_word из повторения):
--   напечатал сам      → «услышано в живой речи»: журнал good, applied=false
--   «Помочь памяти»    → «не расслышал»: due_on = min(due_on, завтра), журнал hard
-- Плюс флаг модуля feed_catch_enabled — админ может выключить задание у фразы.

-- ---------------------------------------------------------------------------
-- Журнал: новый источник 'feed_catch' (констрейнт inline в create table —
-- автоимя review_events_source_check)
alter table public.review_events drop constraint if exists review_events_source_check;
alter table public.review_events add constraint review_events_source_check
  check (source in ('review', 'feed', 'feed_catch'));

-- Флаг модуля: показывать ли задание «Ловля слов» на этой фразе в ленте
alter table public.curricula
  add column if not exists feed_catch_enabled boolean not null default true;

comment on column public.curricula.feed_catch_enabled is
  'Ловля слов в ленте: предлагать ли на фразе задание «напечатай расслышанные слова». false — админ выключил у модуля.';

-- ---------------------------------------------------------------------------
-- Слово напечатано без помощи — «услышано в живой речи». Шаг и срок не
-- трогаем, только журнал (applied=false). heard — сколько раз слово поймано
-- в ленте всего (счётчик «услышано в N видео»)
create or replace function public.memory_catch_heard(p_word text, p_module_id text default null) returns jsonb
    language plpgsql security definer
    set search_path = public
    as $$
declare
  v_uid   uuid := auth.uid();
  v_word  text := public.word_key(p_word);
  v_step  smallint;
  v_heard int;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'auth');
  end if;
  select step into v_step from public.word_memory where user_id = v_uid and word = v_word;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  insert into public.review_events
    (user_id, word, outcome, source, lesson_id, step_before, step_after, applied, events)
  values
    (v_uid, v_word, 'good', 'feed_catch', p_module_id, v_step, v_step, false,
     jsonb_build_object('module', p_module_id));

  select count(*) into v_heard from public.review_events
  where user_id = v_uid and word = v_word and source = 'feed_catch' and outcome = 'good';

  return jsonb_build_object('ok', true, 'word', v_word, 'heard', v_heard);
end;
$$;

-- «Помочь памяти» — не расслышал: слово завтра первой карточкой (срок не
-- отодвигаем, если он уже ближе), шаг тот же; журнал hard, applied=true
create or replace function public.memory_catch_help(p_word text, p_module_id text default null) returns jsonb
    language plpgsql security definer
    set search_path = public
    as $$
declare
  v_uid  uuid := auth.uid();
  v_word text := public.word_key(p_word);
  m      public.word_memory;
  v_due  date;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'auth');
  end if;
  select * into m from public.word_memory where user_id = v_uid and word = v_word for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  v_due := least(m.due_on, public.user_local_today(v_uid) + 1);
  update public.word_memory set due_on = v_due where user_id = v_uid and word = v_word;

  insert into public.review_events
    (user_id, word, outcome, source, lesson_id, step_before, step_after, applied, events)
  values
    (v_uid, v_word, 'hard', 'feed_catch', p_module_id, m.step, m.step, true,
     jsonb_build_object('module', p_module_id));

  return jsonb_build_object('ok', true, 'word', v_word, 'due_on', v_due);
end;
$$;

-- Счётчики «услышано в N видео» по всем словам текущего пользователя
create or replace function public.memory_catch_counts() returns table(word text, heard int)
    language sql stable security definer
    set search_path = public
    as $$
  select e.word, count(*)::int as heard
  from public.review_events e
  where e.user_id = auth.uid() and e.source = 'feed_catch' and e.outcome = 'good'
  group by e.word;
$$;

-- ---------------------------------------------------------------------------
-- Права: только вошедшим
revoke all on function public.memory_catch_heard(text, text) from public, anon;
grant execute on function public.memory_catch_heard(text, text) to authenticated;

revoke all on function public.memory_catch_help(text, text) from public, anon;
grant execute on function public.memory_catch_help(text, text) to authenticated;

revoke all on function public.memory_catch_counts() from public, anon;
grant execute on function public.memory_catch_counts() to authenticated;
