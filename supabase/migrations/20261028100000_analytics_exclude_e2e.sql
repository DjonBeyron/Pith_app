-- Тестовые устройства e2e-прогонов не попадают в аналитику (E2E против настоящей базы, workflow newbie-live).
-- Прогоны под тестовыми аккаунтами ставят в браузере localStorage.pithy_anon_id = 'e2e-live-<n>-<run>'
-- (e2e/helpers/liveAccounts.js). Отчёты и так исключают устройства админа (excluded); теперь в excluded
-- входят и все anon_id, начинающиеся с 'e2e-'. Остальной текст функций — без изменений (копии тел из
-- 20260924130000_app_events.sql и 20261027141000_analytics_prompt_groups.sql).
-- Идемпотентно: create or replace. Длинная — в SQL Editor вставляй двумя частями (граница — «часть 2»).

-- ===== часть 1: analytics_report =====
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
    -- устройства, на которых хоть раз был админ
    select distinct e.anon_id
    from public.app_events e
    join public.user_profiles p on p.id = e.user_id
    where p.is_admin
    union
    -- тестовые устройства e2e-прогонов на настоящей базе (e2e/helpers/liveAccounts.js: anon_id 'e2e-live-<n>-<run>')
    select distinct e.anon_id
    from public.app_events e
    where e.anon_id like 'e2e-%'
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

revoke all on function public.analytics_report(int) from public, anon;
grant execute on function public.analytics_report(int) to authenticated;

-- ===== часть 2: analytics_prompt_groups =====
create or replace function public.analytics_prompt_groups(p_days int default 14) returns jsonb
    language plpgsql stable security definer
    set search_path = public
    as $$
declare
  v_days      int := greatest(1, least(90, coalesce(p_days, 14)));
  v_since     timestamptz := now() - make_interval(days => v_days);
  v_since_day date := (v_since at time zone 'Europe/Moscow')::date;
  v_today     date := (now() at time zone 'Europe/Moscow')::date;
  v_res       jsonb;
begin
  if not public.is_admin() then
    raise exception 'analytics_prompt_groups: admin only';
  end if;

  with excluded as (
    -- устройства, на которых хоть раз был админ
    select distinct e.anon_id
    from public.app_events e
    join public.user_profiles p on p.id = e.user_id
    where p.is_admin
    union
    -- тестовые устройства e2e-прогонов на настоящей базе (e2e/helpers/liveAccounts.js: anon_id 'e2e-live-<n>-<run>')
    select distinct e.anon_id
    from public.app_events e
    where e.anon_id like 'e2e-%'
  ),
  first_seen as (
    select e.anon_id, min((e.created_at at time zone 'Europe/Moscow')::date) as day
    from public.app_events e
    where not exists (select 1 from excluded x where x.anon_id = e.anon_id)
    group by e.anon_id
  ),
  dev as (
    select fs.anon_id, fs.day, g.grp
    from first_seen fs
    join lateral (
      select e.props->>'group' as grp
      from public.app_events e
      where e.anon_id = fs.anon_id
        and e.name = 'app_open'
        and e.props->>'group' in ('control', 'prompts')
      order by e.created_at, e.id
      limit 1
    ) g on true
    where fs.day >= v_since_day
  ),
  active_days as (
    select distinct e.anon_id, (e.created_at at time zone 'Europe/Moscow')::date as day
    from public.app_events e
    join dev d on d.anon_id = e.anon_id
  ),
  per_dev as (
    select d.grp,
           (d.day + 1 <= v_today) as d2_ok,
           exists (select 1 from active_days a
                   where a.anon_id = d.anon_id and a.day = d.day + 1) as d2,
           (d.day + 7 <= v_today) as d7_ok,
           exists (select 1 from active_days a
                   where a.anon_id = d.anon_id and a.day between d.day + 7 and d.day + 13) as d7
    from dev d
  ),
  ret as (
    select grp,
           count(*)                           as devices,
           count(*) filter (where d2_ok)      as d2_base,
           count(*) filter (where d2_ok and d2) as ret_d2,
           count(*) filter (where d7_ok)      as d7_base,
           count(*) filter (where d7_ok and d7) as ret_d7
    from per_dev
    group by grp
  ),
  prompts as (
    select d.grp,
           count(*) filter (where e.name = 'prompt_shown')   as shown,
           count(*) filter (where e.name = 'prompt_dismiss') as dismissed
    from public.app_events e
    join dev d on d.anon_id = e.anon_id
    where e.created_at >= v_since
      and e.name in ('prompt_shown', 'prompt_dismiss')
    group by d.grp
  )
  select jsonb_build_object(
    'days', v_days,
    'groups', coalesce(jsonb_agg(jsonb_build_object(
      'group',          g.grp,
      'devices',        coalesce(r.devices, 0),
      'd2_base',        coalesce(r.d2_base, 0),
      'ret_d2',         coalesce(r.ret_d2, 0),
      'd7_base',        coalesce(r.d7_base, 0),
      'ret_d7',         coalesce(r.ret_d7, 0),
      'prompt_shown',   coalesce(pr.shown, 0),
      'prompt_dismiss', coalesce(pr.dismissed, 0)) order by g.grp), '[]'::jsonb))
  into v_res
  from (values ('control'), ('prompts')) as g(grp)
  left join ret r on r.grp = g.grp
  left join prompts pr on pr.grp = g.grp;

  return v_res;
end;
$$;

revoke all on function public.analytics_prompt_groups(int) from public, anon;
grant execute on function public.analytics_prompt_groups(int) to authenticated;
