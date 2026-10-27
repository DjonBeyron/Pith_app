-- Разрез аналитики по группе «вопросы Пита» (PLAN_NEW_USER.md, решение 23; этап A1, часть 2).
-- Вкладка «Аналитика» в админке (src/features/admin/AnalyticsGroups.jsx) сравнивает контрольную группу
-- (control — без умных вопросов) с группой с вопросами (prompts). Только админ; даты — по Москве;
-- устройства, на которых хоть раз был админ, исключены — как в analytics_report (20260924130000_app_events.sql).
-- Идемпотентно: create or replace.
--
-- Что считается (только по устройствам, ВПЕРВЫЕ появившимся в период, — старых пользователей группа не касалась):
--   group           — props->>'group' первого app_open устройства, где группа указана ('control' | 'prompts');
--                     устройства без группы (старые версии клиента) в разрез не попадают
--   devices         — сколько таких устройств
--   d2_base, ret_d2 — база и возврат на 2-й день: база — устройства, у которых следующий календарный день после
--                     первого уже наступил; ret_d2 — из них те, у кого есть событие в этот следующий день
--   d7_base, ret_d7 — база и возврат на 7-й день: база — устройства, у которых 7-й день после первого уже наступил;
--                     ret_d7 — из них те, у кого есть событие на 7-й день или позже, но не дальше 13-го
--                     (окно в 7 дней: дни +7…+13). У свежих устройств окно ещё не закрыто — абсолютное значение
--                     слегка занижено, но обе группы меряются одинаково, так что сравнивать их можно
--   prompt_shown    — число событий prompt_shown этих устройств за период
--   prompt_dismiss  — число событий prompt_dismiss (закрыл/смахнул и «Спроси позже») этих устройств за период
-- Выход: { days, groups: [ { group, devices, d2_base, ret_d2, d7_base, ret_d7, prompt_shown, prompt_dismiss }, ... ] }
-- Обе группы присутствуют всегда (control, затем prompts), даже если в одной нет устройств.

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
    select distinct e.anon_id
    from public.app_events e
    join public.user_profiles p on p.id = e.user_id
    where p.is_admin
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
