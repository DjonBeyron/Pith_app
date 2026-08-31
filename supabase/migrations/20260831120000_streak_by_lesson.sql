-- Стрик по урокам (2026-08-31).
--
-- Было: touch_daily_login давал +1 за сам ФАКТ захода в приложение — открыл
-- и закрыл, день серии засчитан. Стало: день серии закрывает только
-- пройденный урок (bump_streak_on_lesson), а touch_daily_login отвечает
-- лишь за визит, часовой пояс и судьбу серии (сгорание/заморозки/PRO).
--
-- Ключевые следствия:
--   * сгорание считается по НОВОЙ колонке last_lesson_date, а не по
--     last_active_date — иначе «захожу каждый день, уроков не прохожу» дало
--     бы бессмертную серию, которая не растёт и не падает;
--   * при сбросе current_streak = 0 (а не 1, как раньше): сегодняшний урок
--     ещё не пройден, поэтому и день ещё не закрыт;
--   * защита «не чаще раза в 12 реальных часов» переехала с захода на зачёт
--     урока — иначе сдвиг пояса + пять уроков подряд дали бы +5 дней.
--
-- Старые серии, накопленные заходами, сохраняются целиком: бэкофилл
-- last_lesson_date из last_active_date, чтобы в день деплоя ни у кого
-- ничего не сгорело.

alter table public.user_profiles
  add column if not exists last_lesson_date date;

comment on column public.user_profiles.last_lesson_date is
  'Дата (в поясе tz) последнего дня, в котором пройден хотя бы один урок. Именно она — источник правды о серии; last_active_date остаётся визитом.';

update public.user_profiles
set last_lesson_date = last_active_date
where last_lesson_date is null and current_streak > 0;


-- Зачёт дня серии за пройденный урок. Идемпотентна в пределах суток:
-- второй и следующие уроки за день возвращают incremented = false.
create or replace function public.bump_streak_on_lesson() returns jsonb
    language plpgsql security definer
    as $$
declare
  v_uid   uuid := auth.uid();
  prof    public.user_profiles;
  v_tz    text;
  v_today date;
  v_gap   int;
  v_new   int;
begin
  if v_uid is null then return jsonb_build_object('ok', false); end if;

  select * into prof from public.user_profiles where id = v_uid for update;
  if not found then return jsonb_build_object('ok', false); end if;

  v_tz    := coalesce(prof.tz, 'Europe/Moscow');
  v_today := (now() at time zone v_tz)::date;

  -- Сегодня день уже закрыт — второй урок ничего не добавляет.
  if prof.last_lesson_date = v_today then
    return jsonb_build_object('ok', true, 'streak', prof.current_streak,
      'incremented', false, 'reason', 'already_today');
  end if;

  -- Защита 12ч: календарный день сменился, но реальных часов с прошлого
  -- засчитанного дня прошло слишком мало (манипуляция поясом / урок сразу
  -- после полуночи). День помечаем закрытым — серия НЕ сгорает, но и +1 нет.
  if prof.last_streak_increment_at is not null
     and now() - prof.last_streak_increment_at < interval '12 hours' then
    update public.user_profiles
    set last_lesson_date = v_today,
        last_active_date = greatest(coalesce(last_active_date, v_today), v_today)
    where id = v_uid;
    return jsonb_build_object('ok', true, 'streak', prof.current_streak,
      'incremented', false, 'guarded', true);
  end if;

  if prof.last_lesson_date is null then
    v_new := 1;
  else
    v_gap := v_today - prof.last_lesson_date;
    if v_gap = 1 then
      v_new := prof.current_streak + 1;             -- вчера занимался — серия растёт
    elsif v_gap <= 0 then
      v_new := greatest(prof.current_streak, 1);    -- пояс уехал назад — не наказываем
    else
      v_new := 1;                                   -- разрыв (touch не отработал) — с нуля
    end if;
  end if;

  update public.user_profiles
  set current_streak  = v_new,
      longest_streak  = greatest(longest_streak, v_new),
      last_lesson_date = v_today,
      last_streak_increment_at = now(),
      last_active_date = greatest(coalesce(last_active_date, v_today), v_today)
  where id = v_uid;

  return jsonb_build_object('ok', true, 'streak', v_new,
    'prev_streak', prof.current_streak, 'incremented', true,
    'longest', greatest(prof.longest_streak, v_new));
end;
$$;

alter function public.bump_streak_on_lesson() owner to postgres;
grant all on function public.bump_streak_on_lesson() to anon;
grant all on function public.bump_streak_on_lesson() to authenticated;
grant all on function public.bump_streak_on_lesson() to service_role;


-- Визит: фиксирует заход, чинит часовой пояс и решает судьбу серии по дате
-- последнего УРОКА. Больше не наращивает серию — это делает
-- bump_streak_on_lesson. Ответ расширен полями, по которым клиент решает,
-- показывать ли полноэкранное окно серии и что именно в нём написать
-- (см. useStreakGate.js): first_today, today, состояние защит, детали
-- пропуска. Старые ключи (streak/saved_by/reset/lost_streak/auto_claimed)
-- сохранены — прежний клиент не ломается.
create or replace function public.touch_daily_login(p_tz text default null) returns jsonb
    language plpgsql security definer
    as $$
declare
  v_uid         uuid := auth.uid();
  prof          public.user_profiles;
  v_tz          text;
  v_today       date;
  v_is_pro      boolean;
  v_first       boolean;
  v_gap         int  := 0;
  v_missed      int  := 0;
  v_weekend     boolean := false;
  v_missed_from date;
  v_missed_to   date;
  v_week        text;
  v_saved       text := null;
  v_reset       boolean := false;
  v_ac_days     int := 0;
  v_ac_xp       int := 0;
  v_ac_tick     int := 0;
  v_streak      int;
  v_has_freeze  boolean;
  v_auto_left   int;
  v_pro_week    text;
begin
  if v_uid is null then return jsonb_build_object('ok', false); end if;

  select * into prof from public.user_profiles where id = v_uid for update;
  if not found then return jsonb_build_object('ok', false); end if;

  -- Пояс: валидируем присланный клиентом; мусор/подделка → остаёмся на сохранённом.
  v_tz := coalesce(prof.tz, 'Europe/Moscow');
  if p_tz is not null and p_tz is distinct from v_tz then
    begin
      perform now() at time zone p_tz;
      v_tz := p_tz;
    exception when others then null;
    end;
  end if;

  v_today      := (now() at time zone v_tz)::date;
  v_is_pro     := prof.has_subscription or prof.is_admin;
  v_streak     := prof.current_streak;
  v_has_freeze := prof.has_freeze_charge;
  v_auto_left  := prof.auto_freeze_charges_left;
  v_pro_week   := prof.pro_weekday_forgiven_week;

  -- Первый заход в сутки (по мнению СЕРВЕРА — клиент про свои часы не спрашиваем).
  v_first := prof.last_active_date is null or prof.last_active_date < v_today;

  if not v_first then
    if v_tz is distinct from prof.tz then
      update public.user_profiles set tz = v_tz where id = v_uid;
    end if;
    return jsonb_build_object('ok', true, 'first_today', false,
      'streak', v_streak, 'longest', prof.longest_streak, 'today', v_today,
      'saved_by', null, 'has_freeze_charge', v_has_freeze,
      'auto_freeze_charges_left', v_auto_left, 'is_pro', v_is_pro,
      'pro_weekday_used', (v_pro_week is not distinct from to_char(v_today, 'IYYY-IW')));
  end if;

  -- Визит зафиксирован (серия при этом не растёт — её растит только урок).
  update public.user_profiles set last_active_date = v_today, tz = v_tz where id = v_uid;

  if prof.last_lesson_date is not null and v_streak > 0 then
    v_gap := v_today - prof.last_lesson_date;

    if v_gap >= 2 then
      v_missed      := v_gap - 1;
      v_missed_from := prof.last_lesson_date + 1;
      v_missed_to   := v_today - 1;
      v_weekend     := not exists (
        select 1 from generate_series(v_missed_from, v_missed_to, interval '1 day') d
        where extract(isodow from d) not in (6, 7));

      -- Порядок важен: бесплатная защита PRO тратится раньше купленной за
      -- билеты, чтобы купленное не сгорало зря.
      if v_is_pro and v_weekend then
        v_saved := 'pro_weekend';
      elsif v_is_pro and v_gap = 2 then
        v_week := to_char(v_missed_from, 'IYYY-IW');
        if prof.pro_weekday_forgiven_week is distinct from v_week then
          v_saved := 'pro_weekday';
          update public.user_profiles set pro_weekday_forgiven_week = v_week where id = v_uid;
          v_pro_week := v_week;
        end if;
      end if;

      if v_saved is null and prof.has_freeze_charge and v_gap = 2 then
        v_saved := 'freeze';
        update public.user_profiles set has_freeze_charge = false where id = v_uid;
        v_has_freeze := false;
      end if;

      if v_saved is null and prof.auto_freeze_charges_left >= v_missed then
        v_saved := 'auto_freeze';
        update public.user_profiles
        set auto_freeze_charges_left = auto_freeze_charges_left - v_missed
        where id = v_uid;
        v_auto_left := v_auto_left - v_missed;
      end if;

      if v_saved is not null then
        -- Пропуск прощён. Серия не растёт (это дело урока), но и не сгорает:
        -- двигаем «последний урок» на вчера, чтобы сегодня был обычный день.
        update public.user_profiles set last_lesson_date = v_today - 1 where id = v_uid;
      else
        -- Сброс. Незабранные награды НЕ сгорают: автоклейм — начисляем всё
        -- накопленное (вехи из streak_milestones, остальные дни по 5 XP).
        if v_streak > prof.last_claimed_streak_day then
          select count(*)::int,
                 coalesce(sum(coalesce(m.xp_reward, 5)), 0)::int,
                 coalesce(sum(coalesce(m.ticket_reward, 0)), 0)::int
          into v_ac_days, v_ac_xp, v_ac_tick
          from generate_series(prof.last_claimed_streak_day + 1, v_streak) d
          left join public.streak_milestones m on m.day_number = d;
        end if;

        update public.user_profiles
        set current_streak = 0, last_claimed_streak_day = 0, last_lesson_date = null,
            xp = xp + v_ac_xp, tickets = tickets + v_ac_tick
        where id = v_uid;
        v_reset  := true;
        v_streak := 0;
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'ok', true, 'first_today', true,
    'streak', v_streak, 'longest', prof.longest_streak, 'today', v_today,
    'saved_by', v_saved,
    'missed_days', v_missed,
    'missed_weekend_only', v_weekend,
    'reset', v_reset,
    'lost_streak', case when v_reset then prof.current_streak else null end,
    'auto_claimed', jsonb_build_object('days', v_ac_days, 'xp', v_ac_xp, 'tickets', v_ac_tick),
    'has_freeze_charge', v_has_freeze,
    'auto_freeze_charges_left', v_auto_left,
    'is_pro', v_is_pro,
    'pro_weekday_used', (v_pro_week is not distinct from to_char(v_today, 'IYYY-IW'))
  );
end;
$$;

alter function public.touch_daily_login(text) owner to postgres;
grant all on function public.touch_daily_login(text) to anon;
grant all on function public.touch_daily_login(text) to authenticated;
grant all on function public.touch_daily_login(text) to service_role;
