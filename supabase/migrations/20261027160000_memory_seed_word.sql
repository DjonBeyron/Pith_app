-- «Семена памяти» (B6, PLAN_NEW_USER.md): после верного ответа в игре ленты человеку
-- предлагают сохранить слово, и по «Сохранить» слово заносится в память повторения
-- ровно так, как его заносит прохождение урока-слова (триггер word_memory_seed):
-- шаг 1, повторить завтра (по местной дате пользователя). Слово, которое уже в памяти,
-- не трогаем (on conflict do nothing) — шаг и срок остаются прежними.
-- Сервер сам проверяет, что слово — настоящее слово-урок (is_word_lesson), как
-- memory_import_guest: произвольную строку в память не занести.
-- Права как у memory_catch_heard: только вошедшим (гостю — локальная память, guestMemory.js).
-- Идемпотентна: create or replace, on conflict do nothing.

create or replace function public.memory_seed_word(p_word text, p_module_id text default null) returns jsonb
    language plpgsql security definer
    set search_path = public
    as $$
declare
  v_uid     uuid := auth.uid();
  v_word    text := public.word_key(p_word);
  v_created boolean;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'auth');
  end if;
  if v_word is null then
    return jsonb_build_object('ok', false, 'reason', 'word');
  end if;
  -- только слова, у которых есть урок-слово (между Стартом и Финалом модуля)
  if not exists (
    select 1 from public.lessons l
    where public.word_key(l.title) = v_word and public.is_word_lesson(l.id)
  ) then
    return jsonb_build_object('ok', false, 'reason', 'not_word');
  end if;

  insert into public.word_memory (user_id, word, step, due_on)
  values (v_uid, v_word, 1, public.user_local_today(v_uid) + 1)
  on conflict (user_id, word) do nothing;
  v_created := found; -- true — строка вставлена, false — слово уже было в памяти

  return jsonb_build_object('ok', true, 'word', v_word, 'created', v_created, 'module', p_module_id);
end;
$$;

revoke all on function public.memory_seed_word(text, text) from public, anon;
grant execute on function public.memory_seed_word(text, text) to authenticated;

-- Событие журнала: сохранил слово или отказался (props: word, saved)
insert into public.app_event_names (name, note)
values ('memory_seed', 'семена памяти: saved/declined')
on conflict (name) do nothing;
