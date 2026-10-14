-- Журнал событий (app_events) — защита и ретеншн перед настройкой весов ленты.
-- log_events: белый список имён (чужое — тихо мимо, пачка не падает), props только
-- плоские скаляры (≤12 ключей, строка ≤64, итог ≤2 КБ), суточный потолок 3000/anon_id
-- вдобавок к 600/10 мин. Новое: purge_old_events (service_role/админ), delete_my_events
-- (пользователь удаляет свои), индекс (user_id, name, client_at) под будущие запросы.
--
-- Расписание очистки (вручную, после применения, если расширение pg_cron включено
-- в Dashboard → Database → Extensions; сам cron здесь не создаём — расширения может не быть):
--   select cron.schedule('purge_app_events', '30 3 * * *', $$select public.purge_old_events(180)$$);
-- Задача pg_cron выполняется от postgres — функция пускает его наравне с service_role.

-- Плоский фильтр props: только объект; берём не больше 12 ключей (имя ключа ≤32) в
-- порядке хранения jsonb (короткие имена первыми — ms, pct, dir переживут длинные),
-- значения — число / булево / строка (обрезается до 64 символов). Вложенные объекты,
-- массивы и null выбрасываются. Не объект → null.
create or replace function public.sanitize_event_props(p jsonb) returns jsonb
    language sql immutable
    as $$
  select case when jsonb_typeof(p) <> 'object' then null
    else coalesce((
      select jsonb_object_agg(k, v) from (
        select left(key, 32) as k,
               case when jsonb_typeof(value) = 'string'
                    then to_jsonb(left(value #>> '{}', 64))
                    else value end as v
        from jsonb_each(p)
        where jsonb_typeof(value) in ('string', 'number', 'boolean')
        limit 12
      ) s), '{}'::jsonb) end
$$;

create or replace function public.log_events(
  p_anon_id text,
  p_app_version text,
  p_events jsonb
) returns int
    language plpgsql security definer
    set search_path = public
    as $$
declare
  v_uid     uuid := auth.uid();
  v_recent  int;
  v_day     int;
  v_room    int;
  v_n       int;
  -- Белый список имён. Новое событие в клиенте = новая миграция с create or replace
  -- этой функции (иначе событие молча не запишется).
  v_allowed text[] := array[
    'app_open', 'push_open', 'signup', 'paywall_view', 'paywall_click',
    'feed_view', 'feed_learn',
    'lesson_start', 'lesson_finish', 'lesson_abandon', 'lesson_answer',
    'review_start', 'review_answer', 'review_finish', 'review_abandon',
    'feed_catch_start', 'feed_catch_next', 'feed_catch_check', 'feed_catch_hint',
    'feed_catch_reveal', 'feed_catch_later', 'feed_catch_finish',
    'feed_swipe', 'feed_pause', 'feed_sound', 'feed_slow', 'feed_phrase_open',
    'feed_reveal', 'feed_recall_answer', 'feed_like', 'feed_save', 'feed_repost',
    'feed_search', 'feed_filter', 'say_attempt',
    'say_phrase_start', 'say_phrase_result', 'say_phrase_skip'];
begin
  if p_anon_id is null or p_anon_id !~ '^[A-Za-z0-9-]{8,64}$' then return 0; end if;
  if p_events is null or jsonb_typeof(p_events) <> 'array' then return 0; end if;

  -- Анти-спам: 600 за 10 минут и 3000 за сутки с одного устройства.
  -- Пишем не больше, чем осталось до потолка (пачка режется, а не отбрасывается целиком).
  select count(*) filter (where created_at > now() - interval '10 minutes'), count(*)
    into v_recent, v_day
  from public.app_events
  where anon_id = p_anon_id and created_at > now() - interval '24 hours';
  v_room := least(50, 600 - v_recent, 3000 - v_day);
  if v_room <= 0 then return 0; end if;

  insert into public.app_events (user_id, anon_id, session_id, name, props, app_version, client_at)
  select v_uid,
         p_anon_id,
         left(e->>'sid', 64),
         e->>'name',
         case when pg_column_size(public.sanitize_event_props(e->'props')) <= 2048
              then public.sanitize_event_props(e->'props') end,
         left(p_app_version, 32),
         case when abs(extract(epoch from (now() - public.try_client_time(e->>'at')))) <= 7 * 86400
              then public.try_client_time(e->>'at') end
  from (
    select value as e
    from jsonb_array_elements(p_events) with ordinality o(value, i)
    where jsonb_typeof(value) = 'object'
      and (value->>'name') = any(v_allowed)
    order by i
    limit v_room
  ) x;

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- Ретеншн: удалить события старше p_days (не меньше 30 — защита от случайного
-- обнуления). Только service_role, pg_cron (сессия postgres) или админ.
create or replace function public.purge_old_events(p_days int default 180) returns bigint
    language plpgsql security definer
    set search_path = public
    as $$
declare
  v_days int := greatest(30, coalesce(p_days, 180));
  v_role text := coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
                          nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role');
  v_n    bigint;
begin
  if not (v_role = 'service_role' or session_user in ('postgres', 'supabase_admin') or public.is_admin()) then
    raise exception 'purge_old_events: service_role or admin only';
  end if;
  delete from public.app_events where created_at < now() - make_interval(days => v_days);
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- Пользователь удаляет свои события (те, что записаны с его user_id).
-- Гостевые события того же устройства (user_id null) остаются — они не привязаны к нему.
create or replace function public.delete_my_events() returns bigint
    language plpgsql security definer
    set search_path = public
    as $$
declare
  v_uid uuid := auth.uid();
  v_n   bigint;
begin
  if v_uid is null then return 0; end if;
  delete from public.app_events where user_id = v_uid;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

create index if not exists app_events_user_name_time_idx
  on public.app_events (user_id, name, client_at) where user_id is not null;

revoke all on function public.sanitize_event_props(jsonb) from public;
grant execute on function public.sanitize_event_props(jsonb) to anon, authenticated, service_role;

revoke all on function public.log_events(text, text, jsonb) from public;
grant execute on function public.log_events(text, text, jsonb) to anon, authenticated;

revoke all on function public.purge_old_events(int) from public, anon;
grant execute on function public.purge_old_events(int) to authenticated, service_role;

revoke all on function public.delete_my_events() from public, anon;
grant execute on function public.delete_my_events() to authenticated;
