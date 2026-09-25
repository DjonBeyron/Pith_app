-- Админ: вручную занести слово в СВОЮ память повторения и убрать его
-- (2026-09-25). Зачем: проверить вкладку «Моё обучение» и повторение на любом
-- слове с колодой, не проходя его урок (обычно слово заносит только триггер
-- word_memory_seed при первом зачёте урока-слова). Та же проверка прав, что у
-- memory_debug_shift: только админ, только своя память (auth.uid()).

-- Занести слово «к повтору сегодня». Новое — шаг 1; уже в памяти — шаг не
-- трогаем, только срок на сегодня (повтор доступен сразу, без «прожить дни»).
-- { ok, word, step, due_on } | { ok: false, reason: 'auth' | 'word' }
create or replace function public.memory_debug_add(p_word text) returns jsonb
    language plpgsql security definer
    set search_path = public
    as $$
declare
  v_uid   uuid := auth.uid();
  v_word  text := public.word_key(p_word);
  v_today date;
  v_row   public.word_memory;
begin
  if not public.is_admin() then
    raise exception 'memory_debug_add: admin only';
  end if;
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'auth');
  end if;
  if v_word is null then
    return jsonb_build_object('ok', false, 'reason', 'word');
  end if;

  v_today := public.user_local_today(v_uid);
  insert into public.word_memory (user_id, word, step, due_on)
  values (v_uid, v_word, 1, v_today)
  on conflict (user_id, word) do update set due_on = v_today
  returning * into v_row;

  return jsonb_build_object('ok', true, 'word', v_row.word, 'step', v_row.step, 'due_on', v_row.due_on);
end;
$$;

-- Убрать слово из своей памяти (сброс проверки). Возвращает число удалённых
-- строк: 1 — было, 0 — не было. Журнал review_events не трогаем
create or replace function public.memory_debug_remove(p_word text) returns int
    language plpgsql security definer
    set search_path = public
    as $$
declare
  v_n int;
begin
  if not public.is_admin() then
    raise exception 'memory_debug_remove: admin only';
  end if;
  delete from public.word_memory
  where user_id = auth.uid() and word = public.word_key(p_word);
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function public.memory_debug_add(text) from public, anon;
grant execute on function public.memory_debug_add(text) to authenticated;
revoke all on function public.memory_debug_remove(text) from public, anon;
grant execute on function public.memory_debug_remove(text) to authenticated;
