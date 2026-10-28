-- Пуш повторения: без известного пояса не шлём (PLAN_NEW_USER.md → A3, решение 12).
-- Раньше при tz is null подставлялась «Москва» (coalesce(p.tz, 'Europe/Moscow')) —
-- человеку из другого пояса пуш мог прийти посреди ночи. Теперь push_audience_review()
-- пропускает тех, у кого пояс ещё не пришёл с устройства (touch_daily_login).
-- Больше ничего не менялось: тело — копия из 20260925180000_push_review_due.sql.
-- Запасной пояс в серии (20260831120000_streak_by_lesson.sql, граница суток серии)
-- НЕ тронут — это решение владельца. Как применять: файл целиком в SQL Editor.

create or replace function public.push_audience_review()
returns table(uid uuid, words int, words_label text, minutes int)
    language sql stable security definer
    set search_path = public
    as $$
  with cand as (
    select p.id,
           p.tz as tz,
           (now() at time zone p.tz)::date as today,
           extract(hour from now() at time zone p.tz)::int as hour_now,
           case p.daily_minutes when 10 then 14 when 15 then 20 else 8 end as budget
    from public.user_profiles p
    where p.vacation_since is null
      and p.tz is not null
      and exists (select 1 from public.push_subscriptions s where s.user_id = p.id)
  ),
  timed as (
    select c.*
    from cand c
    where c.hour_now = coalesce((
      select extract(hour from x.t at time zone c.tz)::int
      from (
        select r.completed_at as t from public.lesson_results r
        where r.user_id = c.id and r.completed_at > now() - interval '30 days'
        union all
        select e.created_at from public.review_events e
        where e.user_id = c.id and e.created_at > now() - interval '30 days'
      ) x
      group by 1 order by count(*) desc, 1 desc limit 1
    ), 18)
      and not exists (
        select 1 from public.review_events e
        where e.user_id = c.id and e.source in ('review', 'feed')
          and (e.created_at at time zone c.tz)::date = c.today)
      and not exists (
        select 1 from public.push_trigger_log l
        where l.user_id = c.id
          and l.trigger_kind in ('review_due', 'inactive_today', 'streak_risk')
          and (l.sent_at at time zone c.tz)::date = c.today)
  ),
  due as (
    select t.id, t.budget, m.word,
           case when m.step <= 2 then 2 else 1 end as cards,
           row_number() over (partition by t.id order by m.step, m.due_on, m.word) as rn
    from timed t
    join public.word_memory m on m.user_id = t.id and m.due_on <= t.today
    where exists (
      select 1 from public.lessons l
      where l.published and public.word_key(l.title) = m.word and public.is_word_lesson(l.id)
        and jsonb_array_length(coalesce(l.script->'reviewCards', '[]'::jsonb)) > 0)
  ),
  run as (
    select d.*, sum(d.cards) over (partition by d.id order by d.rn) as total from due d
  ),
  picked as (
    select r.id, count(*)::int as words, sum(least(r.cards, r.budget - (r.total - r.cards)))::int as cards
    from run r
    where r.total - r.cards < r.budget
    group by r.id
  )
  select p.id, p.words,
         case when p.words % 10 = 1 and p.words % 100 <> 11 then 'слово ждёт'
              when p.words % 10 between 2 and 4 and (p.words % 100 < 12 or p.words % 100 > 14) then 'слова ждут'
              else 'слов ждут' end,
         greatest(1, round(p.cards * 15 / 60.0))::int
  from picked p;
$$;

revoke all on function public.push_audience_review() from public, anon, authenticated;
grant execute on function public.push_audience_review() to service_role;
