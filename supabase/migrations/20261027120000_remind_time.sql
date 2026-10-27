-- Напоминания по своему времени (PLAN_NEW_USER.md → этап A3, решения 11, 12, 19).
-- Человек выбирает местное время («в 20:00», «в 7:40»), пояс берём с устройства
-- (user_profiles.tz — его пишет touch_daily_login(p_tz) при каждом визите).
-- Храним МЕСТНОЕ время и пояс, а следующий момент отправки — в next_remind_at
-- (timestamptz): push-trigger раз в 10 минут берёт тех, у кого он наступил, шлёт
-- и сдвигает на следующий день. Пояс неизвестен — не шлём и не подставляем «Москву».
--
-- Как применять: вставить файл целиком в Supabase → SQL Editor (повторный запуск
-- безопасен), затем передеплоить функцию:
--   supabase functions deploy push-trigger --no-verify-jwt
-- и завести cron раз в 10 минут (миграции cron не создают — расширение pg_cron
-- может быть выключено; тело вызова — как у существующего job «evening», но
-- {"kind":"remind"}):
--   select cron.schedule('push_remind', '*/10 * * * *', $cron$
--     select net.http_post(
--       url     := 'https://<project-ref>.supabase.co/functions/v1/push-trigger',
--       headers := jsonb_build_object('Content-Type', 'application/json',
--                                     'x-cron-secret', '<CRON_SECRET>'),
--       body    := '{"kind":"remind"}'::jsonb) $cron$);

alter table public.user_profiles
  add column if not exists remind_at time,
  add column if not exists remind_enabled boolean not null default false,
  add column if not exists next_remind_at timestamptz;

comment on column public.user_profiles.remind_at is
  'Местное время напоминания (по поясу user_profiles.tz), например 20:00 или 07:40';
comment on column public.user_profiles.remind_enabled is
  'Напоминания включены (человек выбрал время; «Не нужно» = false)';
comment on column public.user_profiles.next_remind_at is
  'Следующий момент отправки напоминания (UTC); null — нечего слать или пояс неизвестен';

-- Ближайший момент СТРОГО после p_from, когда на часах пояса p_tz будет p_remind_at.
-- Считаем через местную дату (+1 день), а не «+24 часа»: при переходе на
-- летнее/зимнее время местное время остаётся тем же. Время, которого в этот день
-- нет (пропущенный час весной), Postgres сдвигает вперёд — напоминание придёт
-- на час позже, но в тот же день.
create or replace function public.next_remind_at(
  p_tz text, p_remind_at time, p_from timestamptz default now())
returns timestamptz
    language sql stable
    set search_path = public
    as $$
  select case
    when p_tz is null or p_remind_at is null then null
    else (
      select case when q.today_at > p_from then q.today_at
                  else ((q.d + 1) + p_remind_at) at time zone p_tz end
      from (
        select (p_from at time zone p_tz)::date as d,
               ((p_from at time zone p_tz)::date + p_remind_at) at time zone p_tz as today_at
      ) q)
  end;
$$;

-- Клиент: выбор времени. Пояс берём из профиля (tz); его пока нет — время
-- запоминаем, но next_remind_at = null и ответ needs_tz (пояс придёт при
-- следующем визите, триггер ниже сам досчитает момент).
-- { ok: true, next_remind_at } | { ok: true, needs_tz: true } | { ok: false, reason }
create or replace function public.set_remind_time(p_remind_at time, p_enabled boolean)
returns jsonb
    language plpgsql security definer
    set search_path = public
    as $$
declare
  v_uid  uuid := auth.uid();
  v_tz   text;
  v_next timestamptz;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no_session'); end if;
  if coalesce(p_enabled, false) and p_remind_at is null then
    return jsonb_build_object('ok', false, 'reason', 'no_time');
  end if;

  select tz into v_tz from public.user_profiles where id = v_uid;
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_profile'); end if;

  v_next := case when coalesce(p_enabled, false)
                 then public.next_remind_at(v_tz, p_remind_at, now()) end;

  update public.user_profiles
     set remind_at = coalesce(p_remind_at, remind_at),
         remind_enabled = coalesce(p_enabled, false),
         next_remind_at = v_next
   where id = v_uid;

  if coalesce(p_enabled, false) and v_tz is null then
    return jsonb_build_object('ok', true, 'needs_tz', true);
  end if;
  return jsonb_build_object('ok', true, 'next_remind_at', v_next);
end;
$$;

alter function public.set_remind_time(time, boolean) owner to postgres;
revoke all on function public.set_remind_time(time, boolean) from public, anon;
grant execute on function public.set_remind_time(time, boolean) to authenticated;

-- Сменился пояс (человек улетел, или пояс впервые пришёл с устройства) —
-- момент отправки пересчитывается под новый пояс. Срабатывает на update tz,
-- который делает touch_daily_login, — самой функции править не нужно.
create or replace function public.user_profiles_remind_tz()
returns trigger
    language plpgsql
    set search_path = public
    as $$
begin
  if new.remind_enabled and new.tz is distinct from old.tz then
    new.next_remind_at := public.next_remind_at(new.tz, new.remind_at, now());
  end if;
  return new;
end;
$$;

drop trigger if exists user_profiles_remind_tz on public.user_profiles;
create trigger user_profiles_remind_tz
  before update of tz on public.user_profiles
  for each row execute function public.user_profiles_remind_tz();

-- push-trigger (режим remind): кому пора. Пояс неизвестен — не берём.
-- overdue_min — на сколько минут опоздали (простой cron): сильно опоздавшее
-- push-trigger не шлёт, а только сдвигает на следующий день.
create or replace function public.push_audience_remind()
returns table(user_id uuid, tz text, remind_at time, overdue_min int)
    language sql stable security definer
    set search_path = public
    as $$
  select p.id, p.tz, p.remind_at,
         (extract(epoch from now() - p.next_remind_at) / 60)::int
  from public.user_profiles p
  where p.remind_enabled
    and p.tz is not null
    and p.remind_at is not null
    and p.next_remind_at is not null
    and p.next_remind_at <= now();
$$;

-- После обработки (отправили или пропустили): следующий момент от «сейчас»
create or replace function public.advance_remind(p_user_id uuid)
returns void
    language sql security definer
    set search_path = public
    as $$
  update public.user_profiles p
     set next_remind_at = public.next_remind_at(p.tz, p.remind_at, now())
   where p.id = p_user_id and p.remind_enabled;
$$;

alter function public.push_audience_remind() owner to postgres;
alter function public.advance_remind(uuid) owner to postgres;
revoke all on function public.push_audience_remind() from public, anon, authenticated;
revoke all on function public.advance_remind(uuid) from public, anon, authenticated;
grant execute on function public.push_audience_remind() to service_role;
grant execute on function public.advance_remind(uuid) to service_role;

-- Шаблон по умолчанию (правится в админке → «Пуши»). Слово в текст пока не
-- подставляется ({word} зарезервирован под следующий шаг)
insert into public.push_templates (name, title, body, url, trigger_kind, enabled)
select 'Напоминание в выбранное время', 'Пит напоминает',
       'Пора повторить слово — одна минутка', '/', 'remind_word', true
where not exists (select 1 from public.push_templates where trigger_kind = 'remind_word');
