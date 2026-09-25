-- Перенос памяти гостя в аккаунт при входе/регистрации (этап 5 системы
-- повторения, 2026-09-25). PROJECT.md → «Онбординг»: память гостя живёт в
-- localStorage (src/shared/lib/memory/guestMemory.js), после входа клиент
-- один раз отправляет её сюда и чистит у себя.
--
-- Доверие ограничено: берём только настоящие слова (ключ word_key и урок-слово
-- с таким названием есть в каком-то модуле), шаг 1..5, срок — от сегодня до
-- +60 дней, не больше 500 слов. Слово, которое в памяти аккаунта уже есть, не
-- трогаем: аккаунт — источник правды (гость мог войти в старый аккаунт).

create or replace function public.memory_import_guest(p_words jsonb) returns jsonb
    language plpgsql security definer
    set search_path = public
    as $$
declare
  v_uid   uuid := auth.uid();
  v_today date;
  v_n     int := 0;
  v_rc    int;
  r       jsonb;
  v_word  text;
  v_step  int;
  v_due   date;
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

    insert into public.word_memory (user_id, word, step, due_on, reviews, lapses, last_card_id)
    values (
      v_uid, v_word, v_step, v_due,
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
