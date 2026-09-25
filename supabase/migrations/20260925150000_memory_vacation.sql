-- Режим «Отпуск» — пауза расписания повторения (этап 5 системы повторения,
-- 2026-09-25). Концепция: PROJECT.md → «Деньги, серия, XP, пуши»: «Отпуск»
-- бесплатно.
--
-- Уехал — сроки повторения замирают: вкладка «Моё обучение» ничего не
-- предлагает, точки нет (клиент смотрит на vacation_since). Вернулся — все
-- сроки памяти сдвигаются вперёд на число дней отпуска: то, что должно было
-- созреть в отпуске, созреет через столько же дней после возвращения, и
-- никакого долга. Серию отпуск НЕ замораживает — для этого есть заморозки.

alter table public.user_profiles
  add column if not exists vacation_since date;

comment on column public.user_profiles.vacation_since is
  'Режим «Отпуск»: с какой даты (пояс tz) расписание повторения на паузе; null — не в отпуске. Ставит и снимает memory_set_vacation.';

create or replace function public.memory_set_vacation(p_on boolean) returns jsonb
    language plpgsql security definer
    set search_path = public
    as $$
declare
  v_uid   uuid := auth.uid();
  v_since date;
  v_today date;
  v_days  int := 0;
  v_n     int := 0;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'auth');
  end if;

  select vacation_since into v_since from public.user_profiles where id = v_uid for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'profile');
  end if;
  v_today := public.user_local_today(v_uid);

  if coalesce(p_on, false) then
    if v_since is null then
      update public.user_profiles set vacation_since = v_today where id = v_uid;
      v_since := v_today;
    end if;
    return jsonb_build_object('ok', true, 'on', true, 'since', v_since);
  end if;

  if v_since is not null then
    v_days := greatest(0, v_today - v_since);
    if v_days > 0 then
      update public.word_memory set due_on = due_on + v_days where user_id = v_uid;
      get diagnostics v_n = row_count;
    end if;
    update public.user_profiles set vacation_since = null where id = v_uid;
  end if;
  return jsonb_build_object('ok', true, 'on', false, 'days', v_days, 'shifted', v_n);
end;
$$;

revoke all on function public.memory_set_vacation(boolean) from public, anon;
grant execute on function public.memory_set_vacation(boolean) to authenticated;
