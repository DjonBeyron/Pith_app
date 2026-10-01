-- Тест админа (2026-10-01): пройти слово по уровням памяти до конца и сбросить.
-- В окне слова вкладки «Память» у админа две кнопки: «Повторил → следующий
-- уровень» (одно нажатие = верный ответ в срок: шаг +1, срок по интервалу шага;
-- на шаге 5 слово уходит в постоянную память; в постоянной — дальше некуда) и
-- «Сбросить слово» (как новое: шаг 1, срок через день, счётчики с нуля,
-- постоянная память снимается). Только админ и только своя память. В журнал
-- повторений ничего не пишет — итоги недели и XP от теста не искажаются.
-- Идемпотентно (or replace).

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
    v_due := v_today + public.word_memory_interval(1);
    update public.word_memory
    set step = 1, due_on = v_due, settled_on = null,
        reviews = 0, lapses = 0, last_reviewed_at = null
    where user_id = v_uid and word = v_word;
    return jsonb_build_object('ok', true, 'word', v_word, 'prev_step', m.step, 'step', 1,
      'due_on', v_due, 'settled', false, 'end', false);
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

revoke all on function public.memory_debug_step(text, text) from public, anon;
grant execute on function public.memory_debug_step(text, text) to authenticated;
