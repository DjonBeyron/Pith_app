-- «Сколько минут в день?» — онбординг повторения (этап 7 системы повторения,
-- 2026-09-25). PROJECT.md → «Онбординг»: после первого пройденного урока, два
-- тапа, можно пропустить; ответ задаёт потолок карточек в день
-- (5 → 8, 10 → 14, 15 → 20 — считает клиент, dailyPick.js). Колонка
-- user_profiles.daily_minutes заведена ещё в 20260924120000_word_memory.sql;
-- писать профиль клиенту нельзя (RLS только на чтение) — отсюда RPC.

create or replace function public.memory_set_daily_minutes(p_minutes int) returns jsonb
    language plpgsql security definer
    set search_path = public
    as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'auth');
  end if;
  if p_minutes is null or p_minutes not in (5, 10, 15) then
    return jsonb_build_object('ok', false, 'reason', 'minutes');
  end if;
  update public.user_profiles set daily_minutes = p_minutes where id = v_uid;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'profile');
  end if;
  return jsonb_build_object('ok', true, 'minutes', p_minutes);
end;
$$;

revoke all on function public.memory_set_daily_minutes(int) from public, anon;
grant execute on function public.memory_set_daily_minutes(int) to authenticated;
