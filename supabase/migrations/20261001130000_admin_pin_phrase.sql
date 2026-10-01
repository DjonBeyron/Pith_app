-- Тест-инструмент админа (2026-10-01): кнопка ★ в схеме модуля закрепляет фразу
-- (модуль) в СВОЕЙ памяти админа — она появляется в разделе «Фразы» вкладки
-- «Память», — а повторное нажатие открепляет. Нужна, чтобы проверять раздел
-- без прохождения всех слов фразы. Слова в память не добавляет (они там, если
-- уже есть). Только админ и только своя запись: чужим пользователям и чужим
-- записям функция недоступна. Закрепление — снимок названия и слов, как у
-- memory_consolidate_phrase (20261001120000). Идемпотентно (or replace).

create or replace function public.memory_admin_pin_phrase(p_module_id text, p_pinned boolean) returns jsonb
    language plpgsql security definer
    set search_path = public
    as $$
declare
  v_uid   uuid := auth.uid();
  v_title text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'auth');
  end if;
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;

  select title into v_title from public.curricula where id = p_module_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'module');
  end if;

  if p_pinned then
    insert into public.phrase_memory (user_id, module_id, phrase_title, phrase_words)
    values (v_uid, p_module_id, v_title, public.phrase_word_keys(p_module_id))
    on conflict (user_id, module_id) do update
      set phrase_title = excluded.phrase_title,
          phrase_words = excluded.phrase_words;
  else
    delete from public.phrase_memory where user_id = v_uid and module_id = p_module_id;
  end if;
  return jsonb_build_object('ok', true, 'pinned', p_pinned, 'module_id', p_module_id);
end;
$$;

revoke all on function public.memory_admin_pin_phrase(text, boolean) from public, anon;
grant execute on function public.memory_admin_pin_phrase(text, boolean) to authenticated;
