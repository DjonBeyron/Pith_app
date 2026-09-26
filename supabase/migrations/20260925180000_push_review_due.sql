-- Пуш повторения (этап 7 системы повторения, 2026-09-25). PROJECT.md →
-- «Деньги, серия, XP, пуши»: один пуш в день, в привычное время; нечего
-- повторять — не шлём. Шлёт push-trigger (supabase/functions/push-trigger)
-- в том же ежечасном прогоне, что и вечерние пуши — новый cron не нужен.
--
-- Аудитория push_audience_review(): есть подписка, не «Отпуск», сейчас его
-- привычный час (самый частый час уроков и повторений за 30 дней в его
-- поясе; истории нет — 18:00), есть созревшие слова с колодой, сегодня ещё
-- не повторял (ни сессии, ни «Помнишь?») и сегодня ему ещё не было ни одного
-- пуша-напоминания. Слова и минуты — как выбор дня на клиенте (dailyPick.js):
-- сначала слабые, слабому 2 карточки, крепкому 1, в пределах бюджета минут.

create or replace function public.push_audience_review()
returns table(uid uuid, words int, words_label text, minutes int)
    language sql stable security definer
    set search_path = public
    as $$
  with cand as (
    select p.id,
           coalesce(p.tz, 'Europe/Moscow') as tz,
           (now() at time zone coalesce(p.tz, 'Europe/Moscow'))::date as today,
           extract(hour from now() at time zone coalesce(p.tz, 'Europe/Moscow'))::int as hour_now,
           case p.daily_minutes when 10 then 14 when 15 then 20 else 8 end as budget
    from public.user_profiles p
    where p.vacation_since is null
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

-- Шаблон по умолчанию (правится в админке → «Пуши»). Тап — сразу во вкладку
-- «Моё обучение» (?tab=learn, ShellV2)
insert into public.push_templates (name, title, body, url, trigger_kind, enabled)
select 'Повторение ждёт', 'Пора повторить',
       '{words} {words_label} · {minutes} мин — и день засчитан', '/?tab=learn', 'review_due', true
where not exists (select 1 from public.push_templates where trigger_kind = 'review_due');

-- «Один пуш в день»: вечерние «сегодня не занимался / серия под угрозой» не
-- шлём тем, кому сегодня уже ушло напоминание о повторении. Тело — из
-- baseline, добавлена только проверка review_due в первой ветке
create or replace function public.push_audience_evening()
returns table(uid uuid, kind text, streak integer, m_day integer, m_xp integer, m_tickets integer)
    language sql security definer
    as $$
  with candidates as (
    select p.id, coalesce(p.tz, 'Europe/Moscow') as tz,
           p.last_active_date, coalesce(p.current_streak, 0) as streak,
           (now() at time zone coalesce(p.tz, 'Europe/Moscow'))::date as local_today
    from public.user_profiles p
    where exists (select 1 from public.push_subscriptions s where s.user_id = p.id)
      and extract(hour from now() at time zone coalesce(p.tz, 'Europe/Moscow')) = 19
  )
  select c.id,
         case when c.last_active_date = c.local_today - 1 and c.streak > 0
              then 'streak_risk' else 'inactive_today' end,
         c.streak, null::int, null::int, null::int
  from candidates c
  where coalesce(c.last_active_date, c.local_today - 2) < c.local_today
    and not exists (
      select 1 from public.push_trigger_log l
      where l.user_id = c.id
        and l.trigger_kind in ('streak_risk', 'inactive_today', 'review_due')
        and (l.sent_at at time zone c.tz)::date = c.local_today
    )
  union all
  select c.id, 'streak_milestone_eve', c.streak, m.day_number, m.xp_reward, m.ticket_reward
  from candidates c
  join public.streak_milestones m on m.day_number = c.streak + 1
  where c.last_active_date = c.local_today
    and not exists (
      select 1 from public.push_trigger_log l
      where l.user_id = c.id
        and l.trigger_kind = 'streak_milestone_eve'
        and (l.sent_at at time zone c.tz)::date = c.local_today
    );
$$;

alter function public.push_audience_evening() owner to postgres;
revoke all on function public.push_audience_evening() from public;
grant all on function public.push_audience_evening() to service_role;
