-- Журнал продуктовой аналитики (2026-09-24).
-- Концепция: PROJECT.md → «Система повторения…» → «Аналитика — свой журнал».
--
-- Свой журнал в Supabase, а не PostHog/Метрика: персональные данные не
-- уходят за рубеж (152-ФЗ), блокировщики рекламы его не режут, работает в
-- Telegram Mini App, и события соединяются с данными обучения одним запросом.
--
-- Клиент копит события и шлёт пачкой (src/shared/lib/analytics/track.js) в
-- RPC log_events — и гость, и залогиненный. anon_id — id устройства
-- (localStorage), общий для гостя и того же человека после регистрации:
-- по нему воронка «гость → урок → регистрация» склеивается без догадок.
-- Читать журнал может только админ (отчёт analytics_report).

create table if not exists public.app_events (
  id          bigint generated always as identity primary key,
  user_id     uuid references auth.users(id) on delete set null,
  anon_id     text not null,
  session_id  text,
  name        text not null,
  props       jsonb,
  app_version text,
  client_at   timestamptz,
  created_at  timestamptz not null default now()
);

comment on table public.app_events is
  'Журнал продуктовой аналитики: имя события + props, anon_id устройства, user_id если вошёл. Пишет только RPC log_events, читает админ.';

create index if not exists app_events_name_time_idx on public.app_events (name, created_at);
create index if not exists app_events_anon_time_idx on public.app_events (anon_id, created_at);
create index if not exists app_events_user_idx on public.app_events (user_id) where user_id is not null;

alter table public.app_events enable row level security;

drop policy if exists app_events_select_admin on public.app_events;
create policy app_events_select_admin on public.app_events
  for select to authenticated using (public.is_admin());

revoke all on table public.app_events from anon, authenticated;
grant select on table public.app_events to authenticated;
grant all on table public.app_events to service_role;

-- Время с устройства: кривое/чужое не должно ронять всю пачку.
-- Дальше 7 дней от серверного «сейчас» — не верим (часы устройства сбиты).
create or replace function public.try_client_time(p text) returns timestamptz
    language plpgsql stable
    as $$
begin
  return p::timestamptz;
exception when others then
  return null;
end;
$$;

-- Приём пачки событий. p_events: [{ name, props, at, sid }], не больше 50
-- за вызов. Имя — латиница snake_case; props — объект до 2 КБ (больше —
-- props отбрасываются, событие остаётся). Анти-спам: не больше 600 событий
-- с одного устройства за 10 минут. Возвращает число записанных событий.
create or replace function public.log_events(
  p_anon_id text,
  p_app_version text,
  p_events jsonb
) returns int
    language plpgsql security definer
    set search_path = public
    as $$
declare
  v_uid    uuid := auth.uid();
  v_recent int;
  v_n      int;
begin
  if p_anon_id is null or p_anon_id !~ '^[A-Za-z0-9-]{8,64}$' then return 0; end if;
  if p_events is null or jsonb_typeof(p_events) <> 'array' then return 0; end if;

  select count(*) into v_recent from public.app_events
  where anon_id = p_anon_id and created_at > now() - interval '10 minutes';
  if v_recent >= 600 then return 0; end if;

  insert into public.app_events (user_id, anon_id, session_id, name, props, app_version, client_at)
  select v_uid,
         p_anon_id,
         left(e->>'sid', 64),
         e->>'name',
         case when jsonb_typeof(e->'props') = 'object' and pg_column_size(e->'props') <= 2048
              then e->'props' end,
         left(p_app_version, 32),
         case when abs(extract(epoch from (now() - public.try_client_time(e->>'at')))) <= 7 * 86400
              then public.try_client_time(e->>'at') end
  from (select value as e from jsonb_array_elements(p_events) limit 50) x
  where jsonb_typeof(e) = 'object'
    and (e->>'name') ~ '^[a-z][a-z0-9_]{1,39}$';

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Отчёт для вкладки «Аналитика» в админке (только админ). Одним вызовом —
-- всё, что нужно экрану; даты — по Москве. Устройства, на которых хоть раз
-- был админ, из отчёта исключены (иначе тесты админа искажают цифры).
--   funnel    — сколько устройств за период сделали шаг воронки
--   daily     — активные устройства по дням
--   retention — когорты по дню первого события: размер, вернулись D1 / D7
--   lessons   — старты/финиши/брошенные по урокам, средний % при бросании
--   feed      — показы/медиана просмотра/быстрые пролистывания/«Изучить» по фразам
create or replace function public.analytics_report(p_days int default 14) returns jsonb
    language plpgsql stable security definer
    set search_path = public
    as $$
declare
  v_days  int := greatest(1, least(90, coalesce(p_days, 14)));
  v_since timestamptz := now() - make_interval(days => v_days);
  v_today date := (now() at time zone 'Europe/Moscow')::date;
  v_res   jsonb;
begin
  if not public.is_admin() then
    raise exception 'analytics_report: admin only';
  end if;

  with excluded as (
    select distinct e.anon_id
    from public.app_events e
    join public.user_profiles p on p.id = e.user_id
    where p.is_admin
  ),
  ev as (
    select e.*, (e.created_at at time zone 'Europe/Moscow')::date as day
    from public.app_events e
    where e.created_at >= v_since
      and not exists (select 1 from excluded x where x.anon_id = e.anon_id)
  ),
  first_seen as (
    select e.anon_id, min((e.created_at at time zone 'Europe/Moscow')::date) as day
    from public.app_events e
    where not exists (select 1 from excluded x where x.anon_id = e.anon_id)
    group by e.anon_id
  ),
  active_days as (
    select distinct e.anon_id, (e.created_at at time zone 'Europe/Moscow')::date as day
    from public.app_events e
    where e.created_at >= v_since - interval '8 days'
  )
  select jsonb_build_object(
    'days', v_days,
    'funnel', (
      select jsonb_build_object(
        'devices',       count(distinct anon_id),
        'feed_view',     count(distinct anon_id) filter (where name = 'feed_view'),
        'feed_learn',    count(distinct anon_id) filter (where name = 'feed_learn'),
        'lesson_start',  count(distinct anon_id) filter (where name = 'lesson_start'),
        'lesson_finish', count(distinct anon_id) filter (where name = 'lesson_finish'),
        'signup',        count(distinct anon_id) filter (where name = 'signup'),
        'push_open',     count(*) filter (where name = 'push_open'),
        'paywall_view',  count(*) filter (where name = 'paywall_view'),
        'paywall_click', count(*) filter (where name = 'paywall_click'))
      from ev
    ),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object('day', day, 'devices', n) order by day desc)
      from (select day, count(distinct anon_id) as n from ev group by day) d
    ), '[]'::jsonb),
    'retention', coalesce((
      select jsonb_agg(jsonb_build_object(
        'day', f.day,
        'size', f.size,
        'd1', case when f.day + 1 <= v_today then f.d1 end,
        'd7', case when f.day + 7 <= v_today then f.d7 end) order by f.day desc)
      from (
        select fs.day,
               count(*) as size,
               count(*) filter (where exists (select 1 from active_days a
                 where a.anon_id = fs.anon_id and a.day = fs.day + 1)) as d1,
               count(*) filter (where exists (select 1 from active_days a
                 where a.anon_id = fs.anon_id and a.day = fs.day + 7)) as d7
        from first_seen fs
        where fs.day >= (v_since at time zone 'Europe/Moscow')::date
        group by fs.day
      ) f
    ), '[]'::jsonb),
    'lessons', coalesce((
      select jsonb_agg(jsonb_build_object(
        'lesson_id', l.lesson_id, 'title', coalesce(ls.title, l.lesson_id),
        'starts', l.starts, 'finishes', l.finishes, 'abandons', l.abandons,
        'abandon_pct', l.abandon_pct) order by l.starts desc)
      from (
        select props->>'lesson_id' as lesson_id,
               count(*) filter (where name = 'lesson_start')   as starts,
               count(*) filter (where name = 'lesson_finish')  as finishes,
               count(*) filter (where name = 'lesson_abandon') as abandons,
               round(avg((props->>'pct')::numeric) filter (
                 where name = 'lesson_abandon' and (props->>'pct') ~ '^\d{1,3}$')) as abandon_pct
        from ev
        where name in ('lesson_start', 'lesson_finish', 'lesson_abandon')
          and props->>'lesson_id' is not null
        group by 1
        order by 2 desc
        limit 40
      ) l
      left join public.lessons ls on ls.id = l.lesson_id
    ), '[]'::jsonb),
    'feed', coalesce((
      select jsonb_agg(jsonb_build_object(
        'module_id', f.module_id, 'title', coalesce(c.title, f.module_id),
        'views', f.views, 'median_ms', f.median_ms, 'skips', f.skips,
        'learns', f.learns) order by f.views desc)
      from (
        select props->>'module_id' as module_id,
               count(*) filter (where name = 'feed_view') as views,
               round(percentile_cont(0.5) within group (order by (props->>'ms')::numeric)
                 filter (where name = 'feed_view' and (props->>'ms') ~ '^\d{1,9}$')) as median_ms,
               count(*) filter (where name = 'feed_view' and (props->>'ms') ~ '^\d{1,9}$'
                 and (props->>'ms')::int < 2000) as skips,
               count(*) filter (where name = 'feed_learn') as learns
        from ev
        where name in ('feed_view', 'feed_learn') and props->>'module_id' is not null
        group by 1
        order by 2 desc
        limit 40
      ) f
      left join public.curricula c on c.id = f.module_id
    ), '[]'::jsonb)
  ) into v_res;

  return v_res;
end;
$$;

revoke all on function public.log_events(text, text, jsonb) from public;
grant execute on function public.log_events(text, text, jsonb) to anon, authenticated;

revoke all on function public.analytics_report(int) from public, anon;
grant execute on function public.analytics_report(int) to authenticated;

grant execute on function public.try_client_time(text) to anon, authenticated;
