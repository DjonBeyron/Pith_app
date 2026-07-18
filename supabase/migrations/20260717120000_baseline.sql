


-- ═══════════════════════════════════════════════════════════════════════
-- BASELINE — снимок реальной схемы public на 2026-07-17 (этап 4 стабилизации)
-- Источник правды о состоянии БД. Снят через `supabase db dump --schema public`
-- с боевого проекта — каждая функция здесь ровно в одном экземпляре
-- (в архивном supabase_schema.sql их накопилось по 3-4 версии).
-- Новые изменения БД — НЕ правкой этого файла, а новым файлом миграции
-- supabase/migrations/<timestamp>_<имя>.sql (см. правило в CLAUDE.md).
-- ═══════════════════════════════════════════════════════════════════════

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."activate_subscription"("p_user" "uuid", "p_days" integer DEFAULT 30) RETURNS timestamp with time zone
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare v_until timestamptz;
begin
  update public.user_profiles
  set subscription_until = greatest(coalesce(subscription_until, now()), now())
                           + make_interval(days => p_days),
      has_subscription   = true
  where id = p_user
  returning subscription_until into v_until;
  return v_until;
end;
$$;


ALTER FUNCTION "public"."activate_subscription"("p_user" "uuid", "p_days" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_energy_regen"("p_uid" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  prof  public.user_profiles;
  ticks int;
begin
  select * into prof from public.user_profiles where id = p_uid for update;
  if not found then return; end if;
  if prof.energy >= 5 then
    -- Полный бак: часы капли стоят «на нуле», отсчёт начнётся с первой траты
    update public.user_profiles set energy_updated_at = now() where id = p_uid;
    return;
  end if;
  ticks := floor(extract(epoch from (now() - prof.energy_updated_at)) / 14400);
  if ticks <= 0 then return; end if;
  update public.user_profiles
  set energy = least(5, prof.energy + ticks),
      energy_updated_at = case
        when prof.energy + ticks >= 5 then now()
        else prof.energy_updated_at + (ticks * interval '4 hours')
      end
  where id = p_uid;
end;
$$;


ALTER FUNCTION "public"."apply_energy_regen"("p_uid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."award_module_ticket"("p_module_id" "text", "p_hints" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_uid     uuid := auth.uid();
  v_hints   int  := greatest(0, coalesce(p_hints, 0));
  v_final   text;
  v_tickets int;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'not_logged_in'); end if;

  select c.lesson_ids->>(jsonb_array_length(c.lesson_ids) - 1)
  into v_final
  from public.curricula c
  where c.id = p_module_id and coalesce(c.is_pro, false) = false;
  if v_final is null then return jsonb_build_object('ok', false, 'reason', 'no_module'); end if;

  if not exists(
    select 1 from public.lesson_results
    where user_id = v_uid and lesson_id = v_final and xp_awarded
  ) then
    return jsonb_build_object('ok', false, 'reason', 'final_not_done');
  end if;

  -- Идеальное прохождение: достижение выдаётся и при пересдаче,
  -- независимо от того, получен ли билет с этого модуля раньше.
  if v_hints = 0 then
    insert into public.user_achievements (user_id, kind)
    values (v_uid, 'clean_final')
    on conflict do nothing;
  end if;

  if v_hints > 3 then
    return jsonb_build_object('ok', false, 'reason', 'hints', 'clean', false);
  end if;

  insert into public.module_tickets (user_id, module_id, hints)
  values (v_uid, p_module_id, v_hints)
  on conflict do nothing;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'already', 'clean', v_hints = 0);
  end if;

  update public.user_profiles
  set tickets = tickets + 1
  where id = v_uid
  returning tickets into v_tickets;

  return jsonb_build_object('ok', true, 'tickets', v_tickets, 'clean', v_hints = 0);
end;
$$;


ALTER FUNCTION "public"."award_module_ticket"("p_module_id" "text", "p_hints" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."buy_auto_freeze"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_uid  uuid := auth.uid();
  v_cost int  := 3;
  prof   public.user_profiles;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'not_logged_in'); end if;

  select * into prof from public.user_profiles where id = v_uid for update;
  if not found then return jsonb_build_object('ok', false); end if;

  if prof.has_subscription or prof.is_admin then
    return jsonb_build_object('ok', false, 'reason', 'pro_has_it_free');
  end if;
  if prof.auto_freeze_charges_left > 0 then
    return jsonb_build_object('ok', false, 'reason', 'already_have');
  end if;
  if prof.tickets < v_cost then
    return jsonb_build_object('ok', false, 'reason', 'not_enough_tickets');
  end if;

  update public.user_profiles
  set tickets = tickets - v_cost, auto_freeze_charges_left = 2
  where id = v_uid;

  return jsonb_build_object('ok', true, 'tickets', prof.tickets - v_cost);
end;
$$;


ALTER FUNCTION "public"."buy_auto_freeze"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."buy_streak_freeze"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_uid  uuid := auth.uid();
  v_cost int  := 2;
  prof   public.user_profiles;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'not_logged_in'); end if;

  select * into prof from public.user_profiles where id = v_uid for update;
  if not found then return jsonb_build_object('ok', false); end if;

  if prof.has_freeze_charge then
    return jsonb_build_object('ok', false, 'reason', 'already_have');
  end if;
  if prof.tickets < v_cost then
    return jsonb_build_object('ok', false, 'reason', 'not_enough_tickets');
  end if;

  update public.user_profiles
  set tickets = tickets - v_cost, has_freeze_charge = true
  where id = v_uid;

  return jsonb_build_object('ok', true, 'tickets', prof.tickets - v_cost);
end;
$$;


ALTER FUNCTION "public"."buy_streak_freeze"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_level_achievement"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare v_xp int;
begin
  if auth.uid() is null then return false; end if;
  select xp into v_xp from public.user_profiles where id = auth.uid();
  if coalesce(v_xp, 0) < 8000 then return false; end if;
  insert into public.user_achievements (user_id, kind)
  values (auth.uid(), 'level10')
  on conflict do nothing;
  return true;
end;
$$;


ALTER FUNCTION "public"."claim_level_achievement"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_streak_reward"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_uid    uuid := auth.uid();
  prof     public.user_profiles;
  v_day    int;
  v_xp     int;
  v_tick   int;
  v_special boolean;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'not_logged_in'); end if;

  select * into prof from public.user_profiles where id = v_uid for update;
  if not found then return jsonb_build_object('ok', false); end if;

  v_day := prof.last_claimed_streak_day + 1;
  if v_day > prof.current_streak then
    return jsonb_build_object('ok', false, 'reason', 'nothing_to_claim');
  end if;

  select xp_reward, ticket_reward, special into v_xp, v_tick, v_special
  from public.streak_milestones where day_number = v_day;

  if not found then
    v_xp := 5; v_tick := 0; v_special := false;
  end if;

  update public.user_profiles
  set xp = xp + v_xp, tickets = tickets + v_tick, last_claimed_streak_day = v_day
  where id = v_uid;

  return jsonb_build_object('ok', true, 'day', v_day, 'xp', v_xp,
    'tickets', v_tick, 'special', coalesce(v_special, false));
end;
$$;


ALTER FUNCTION "public"."claim_streak_reward"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_streak_rewards_all"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_uid     uuid := auth.uid();
  prof      public.user_profiles;
  v_days    int;
  v_xp      int;
  v_tick    int;
  v_special boolean;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'not_logged_in'); end if;

  select * into prof from public.user_profiles where id = v_uid for update;
  if not found then return jsonb_build_object('ok', false); end if;

  if prof.last_claimed_streak_day >= prof.current_streak then
    return jsonb_build_object('ok', false, 'reason', 'nothing_to_claim');
  end if;

  select count(*)::int,
         coalesce(sum(coalesce(m.xp_reward, 5)), 0)::int,
         coalesce(sum(coalesce(m.ticket_reward, 0)), 0)::int,
         coalesce(bool_or(coalesce(m.special, false)), false)
  into v_days, v_xp, v_tick, v_special
  from generate_series(prof.last_claimed_streak_day + 1, prof.current_streak) d
  left join public.streak_milestones m on m.day_number = d;

  update public.user_profiles
  set xp = xp + v_xp, tickets = tickets + v_tick,
      last_claimed_streak_day = prof.current_streak
  where id = v_uid;

  return jsonb_build_object('ok', true, 'days', v_days, 'xp', v_xp,
    'tickets', v_tick, 'special', v_special);
end;
$$;


ALTER FUNCTION "public"."claim_streak_rewards_all"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_lesson"("p_lesson_id" "text") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_uid    uuid := auth.uid();
  v_reward integer;
begin
  if v_uid is null then
    return 0;
  end if;

  if not exists(
    select 1 from public.lesson_sessions
    where user_id = v_uid and lesson_id = p_lesson_id
  ) then
    return 0;
  end if;
  delete from public.lesson_sessions
  where user_id = v_uid and lesson_id = p_lesson_id;

  insert into public.lesson_results (user_id, lesson_id, xp_awarded)
  values (v_uid, p_lesson_id, true)
  on conflict (user_id, lesson_id) do update
    set xp_awarded = true, completed_at = now()
    where lesson_results.xp_awarded = false;

  if not found then
    return 0;
  end if;

  select coalesce((script->>'lessonXp')::int, 0)
  into v_reward
  from public.lessons
  where id = p_lesson_id;

  v_reward := coalesce(v_reward, 0);

  if v_reward > 0 then
    update public.user_profiles
    set xp = xp + v_reward
    where id = v_uid;
  end if;

  return v_reward;
end;
$$;


ALTER FUNCTION "public"."complete_lesson"("p_lesson_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."expire_subscription"("p_uid" "uuid") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  update public.user_profiles
  set has_subscription = false
  where id = p_uid and has_subscription
    and subscription_until is not null and subscription_until < now();
$$;


ALTER FUNCTION "public"."expire_subscription"("p_uid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."finalize_race"("p_race_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  r    public.races;
  v_xp int := 0;
begin
  update public.races set results_published = true
  where id = p_race_id and results_published = false
    and ends_at is not null and ends_at + interval '10 minutes' < now()
  returning * into r;
  if not found then return false; end if; -- рано или уже подведено

  update public.race_entries e
  set place = ranked.rn
  from (
    select user_id,
           row_number() over (order by errors asc, time_ms asc, finished_at asc) as rn
    from public.race_entries
    where race_id = p_race_id and finished_at is not null
  ) ranked
  where e.race_id = p_race_id and e.user_id = ranked.user_id;

  insert into public.user_achievements (user_id, kind, meta)
  select user_id, 'race_winner', jsonb_build_object('place', place)
  from public.race_entries
  where race_id = p_race_id and place between 1 and 3
  on conflict (user_id, kind) do update
    set meta = case
      when (excluded.meta->>'place')::int < coalesce((user_achievements.meta->>'place')::int, 99)
      then excluded.meta else user_achievements.meta end;

  -- Отложенный XP супер-урока всем финишировавшим
  if r.race_module_id is not null then
    select coalesce(sum(coalesce((l.script->>'lessonXp')::int, 0)), 0) into v_xp
    from public.lessons l
    where l.id in (
      select jsonb_array_elements_text(c.lesson_ids)
      from public.curricula c where c.id = r.race_module_id);
    if v_xp > 0 then
      update public.user_profiles p
      set xp = p.xp + v_xp
      from public.race_entries e
      where e.race_id = p_race_id and e.finished_at is not null and p.id = e.user_id;
    end if;
  end if;
  return true;
end;
$$;


ALTER FUNCTION "public"."finalize_race"("p_race_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."finish_race"("p_race_id" "uuid", "p_errors" integer, "p_time_ms" bigint) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare r public.races;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'reason', 'not_logged_in'); end if;
  select * into r from public.races where id = p_race_id;
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_race'); end if;
  if r.starts_at is null or now() < r.starts_at or now() > r.ends_at + interval '10 minutes' then
    return jsonb_build_object('ok', false, 'reason', 'closed');
  end if;
  insert into public.race_entries (race_id, user_id, errors, time_ms, finished_at)
  values (p_race_id, auth.uid(),
          greatest(0, coalesce(p_errors, 0)), greatest(0, coalesce(p_time_ms, 0)), now())
  on conflict (race_id, user_id) do nothing;
  if not found then return jsonb_build_object('ok', false, 'reason', 'already'); end if;
  -- Достижение «Участник гонки» — за финиш.
  insert into public.user_achievements (user_id, kind)
  values (auth.uid(), 'race_finisher')
  on conflict do nothing;
  return jsonb_build_object('ok', true);
end;
$$;


ALTER FUNCTION "public"."finish_race"("p_race_id" "uuid", "p_errors" integer, "p_time_ms" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_leaderboard"("p_limit" integer DEFAULT 100) RETURNS TABLE("user_id" "uuid", "nickname" "text", "xp" integer, "cosmetics" "jsonb", "medal_place" integer, "is_pro" boolean, "avatar_seed" "text", "current_streak" integer)
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  select p.id, p.nickname, p.xp, p.cosmetics, (a.meta->>'place')::int,
         (p.has_subscription or p.is_admin), p.avatar_seed, p.current_streak
  from public.user_profiles p
  left join public.user_achievements a on a.user_id = p.id and a.kind = 'race_winner'
  order by p.xp desc, p.created_at asc
  limit least(greatest(coalesce(p_limit, 100), 1), 200);
$$;


ALTER FUNCTION "public"."get_leaderboard"("p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_race_rank"("p_race_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  select jsonb_build_object(
    'rank', (
      select count(*) + 1 from public.race_entries q
      where q.race_id = e.race_id and q.finished_at is not null
        and (q.errors < e.errors
             or (q.errors = e.errors and q.time_ms < e.time_ms)
             or (q.errors = e.errors and q.time_ms = e.time_ms and q.finished_at < e.finished_at))),
    'total', (
      select count(*) from public.race_entries q
      where q.race_id = e.race_id and q.finished_at is not null))
  from public.race_entries e
  where e.race_id = p_race_id and e.user_id = auth.uid() and e.finished_at is not null;
$$;


ALTER FUNCTION "public"."get_my_race_rank"("p_race_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_rank"() RETURNS "jsonb"
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  select jsonb_build_object(
    'rank',  (select count(*) + 1 from public.user_profiles q where q.xp > p.xp),
    'total', (select count(*)     from public.user_profiles q))
  from public.user_profiles p
  where p.id = auth.uid();
$$;


ALTER FUNCTION "public"."get_my_rank"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_race_results"("p_race_id" "uuid") RETURNS TABLE("place" integer, "user_id" "uuid", "nickname" "text", "cosmetics" "jsonb", "medal_place" integer, "score" integer)
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  select e.place, e.user_id, p.nickname, p.cosmetics,
         (a.meta->>'place')::int,
         (greatest(0, 20 - e.errors) * 10000
          + greatest(0, 9999 - (e.time_ms / 1000)::int))::int
  from public.race_entries e
  join public.races r on r.id = e.race_id
  join public.user_profiles p on p.id = e.user_id
  left join public.user_achievements a on a.user_id = e.user_id and a.kind = 'race_winner'
  where e.race_id = p_race_id and r.results_published and e.place is not null
  order by e.place;
$$;


ALTER FUNCTION "public"."get_race_results"("p_race_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  insert into public.user_profiles (id, nickname)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data->>'name'), ''),
                  split_part(coalesce(new.email, ''), '@', 1)), 20)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
declare
  admin boolean;
begin
  select up.is_admin into admin
  from public.user_profiles up
  where up.id = auth.uid();
  return coalesce(admin, false);
end;
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."push_audience_energy_full"() RETURNS SETOF "uuid"
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  select p.id
  from public.user_profiles p
  where exists (select 1 from public.push_subscriptions s where s.user_id = p.id)
    and coalesce(p.has_subscription, false) = false
    and p.energy < 5
    and p.energy_updated_at + (5 - p.energy) * interval '4 hours' <= now()
    and not exists (
      select 1 from public.push_trigger_log l
      where l.user_id = p.id
        and l.trigger_kind = 'energy_full'
        and l.sent_at >= p.energy_updated_at
    );
$$;


ALTER FUNCTION "public"."push_audience_energy_full"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."push_audience_evening"() RETURNS TABLE("uid" "uuid", "kind" "text", "streak" integer, "m_day" integer, "m_xp" integer, "m_tickets" integer)
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
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
        and l.trigger_kind in ('streak_risk', 'inactive_today')
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


ALTER FUNCTION "public"."push_audience_evening"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recalc_module_difficulty"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_module text := coalesce(new.module_id, old.module_id);
  v_med    numeric;
  v_cnt    int;
begin
  select percentile_cont(0.5) within group (order by vote), count(*)
  into v_med, v_cnt
  from public.module_difficulty_votes
  where module_id = v_module;

  update public.curricula
  set difficulty       = case when v_cnt > 0 then round(v_med)::smallint else null end,
      difficulty_votes = v_cnt
  where id = v_module;
  return null;
end;
$$;


ALTER FUNCTION "public"."recalc_module_difficulty"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reset_lesson_progress"("p_lesson_ids" "text"[], "p_clear_answers" boolean DEFAULT false) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_uid    uuid := auth.uid();
  v_refund integer := 0;
begin
  if v_uid is null then
    return 0;
  end if;

  select coalesce(sum(coalesce((l.script->>'lessonXp')::int, 0)), 0)
  into v_refund
  from public.lesson_results r
  join public.lessons l on l.id = r.lesson_id
  where r.user_id = v_uid and r.lesson_id = any(p_lesson_ids) and r.xp_awarded;

  update public.lesson_results
  set xp_awarded = false,
      answers = case when p_clear_answers then null else answers end
  where user_id = v_uid and lesson_id = any(p_lesson_ids);

  if v_refund > 0 then
    update public.user_profiles
    set xp = greatest(0, xp - v_refund)
    where id = v_uid;
  end if;

  return v_refund;
end;
$$;


ALTER FUNCTION "public"."reset_lesson_progress"("p_lesson_ids" "text"[], "p_clear_answers" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_lesson_stars"("p_lesson_id" "text", "p_stars" integer) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_stars int := least(3, greatest(1, coalesce(p_stars, 1)));
  v_out   int;
begin
  if auth.uid() is null then return 0; end if;
  update public.lesson_results
  set stars = greatest(stars, v_stars)
  where user_id = auth.uid() and lesson_id = p_lesson_id
  returning stars into v_out;
  return coalesce(v_out, 0);
end;
$$;


ALTER FUNCTION "public"."save_lesson_stars"("p_lesson_id" "text", "p_stars" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_avatar"("p_seed" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $_$
begin
  if auth.uid() is null then return null; end if;
  if p_seed is not null and p_seed !~ '^[A-Za-z0-9]{1,40}$' then
    return null;
  end if;
  update public.user_profiles set avatar_seed = p_seed where id = auth.uid();
  return p_seed;
end;
$_$;


ALTER FUNCTION "public"."set_avatar"("p_seed" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_cosmetics"("p_cosmetics" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare v jsonb := '{}';
begin
  if auth.uid() is null then return null; end if;
  if coalesce((p_cosmetics->>'bg')::boolean, false) and exists
     (select 1 from public.user_achievements where user_id = auth.uid() and kind = 'level10')
  then v := v || '{"bg":true}'::jsonb; end if;
  if coalesce((p_cosmetics->>'bg2')::boolean, false) and exists
     (select 1 from public.user_achievements where user_id = auth.uid() and kind = 'clean_final')
  then v := v || '{"bg2":true}'::jsonb; end if;
  if coalesce((p_cosmetics->>'frame')::boolean, false) and exists
     (select 1 from public.user_achievements where user_id = auth.uid() and kind = 'race_finisher')
  then v := v || '{"frame":true}'::jsonb; end if;
  if coalesce((p_cosmetics->>'medal')::boolean, false) and exists
     (select 1 from public.user_achievements where user_id = auth.uid() and kind = 'race_winner')
  then v := v || '{"medal":true}'::jsonb; end if;
  update public.user_profiles set cosmetics = v where id = auth.uid();
  return v;
end;
$$;


ALTER FUNCTION "public"."set_cosmetics"("p_cosmetics" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_nickname"("p_nick" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v    text := left(trim(coalesce(p_nick, '')), 20);
  prof record;
  next_at timestamptz;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'reason', 'not_logged_in'); end if;
  if char_length(v) < 2 then return jsonb_build_object('ok', false, 'reason', 'too_short'); end if;

  select nickname, nickname_changed_at, nickname_changes, is_admin
  into prof from public.user_profiles where id = auth.uid();
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_profile'); end if;

  if prof.nickname = v then return jsonb_build_object('ok', true, 'nick', v); end if;

  if not prof.is_admin and prof.nickname_changes > 0 and prof.nickname_changed_at is not null then
    next_at := prof.nickname_changed_at
      + case when prof.nickname_changes = 1 then interval '7 days' else interval '30 days' end;
    if now() < next_at then
      return jsonb_build_object('ok', false, 'reason', 'too_soon', 'next_at', next_at);
    end if;
  end if;

  update public.user_profiles
  set nickname = v,
      nickname_changed_at = case when prof.is_admin then nickname_changed_at else now() end,
      nickname_changes    = case when prof.is_admin then nickname_changes else nickname_changes + 1 end
  where id = auth.uid();
  return jsonb_build_object('ok', true, 'nick', v);
end;
$$;


ALTER FUNCTION "public"."set_nickname"("p_nick" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."spend_energy"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  prof public.user_profiles;
begin
  select * into prof
  from public.user_profiles
  where id = auth.uid()
  for update;

  if not found then return false; end if;

  -- Reset energy once per day
  if prof.energy_updated_at < current_date then
    update public.user_profiles
    set energy = 3, energy_updated_at = current_date
    where id = auth.uid();
    prof.energy := 3;
  end if;

  if prof.has_subscription then return true; end if;
  if prof.energy <= 0 then return false; end if;

  update public.user_profiles
  set energy = energy - 1
  where id = auth.uid();

  return true;
end;
$$;


ALTER FUNCTION "public"."spend_energy"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."start_lesson"("p_lesson_id" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_uid  uuid := auth.uid();
  prof   public.user_profiles;
  v_free boolean;
begin
  if v_uid is null then
    return jsonb_build_object('ok', true, 'guest', true);
  end if;

  perform public.expire_subscription(v_uid);
  perform public.apply_energy_regen(v_uid);
  select * into prof from public.user_profiles where id = v_uid for update;

  insert into public.lesson_sessions (user_id, lesson_id)
  values (v_uid, p_lesson_id)
  on conflict (user_id, lesson_id) do update set started_at = now();

  if prof.has_subscription or prof.is_admin then
    return jsonb_build_object('ok', true, 'energy', prof.energy);
  end if;

  select exists(
    select 1 from public.lesson_results
    where user_id = v_uid and lesson_id = p_lesson_id and xp_awarded
  ) into v_free;
  if not v_free then
    select exists(
      select 1 from public.curricula c
      where c.lesson_ids->>0 = p_lesson_id
         or c.lesson_ids->>(jsonb_array_length(c.lesson_ids) - 1) = p_lesson_id
    ) into v_free;
  end if;
  if v_free then
    return jsonb_build_object('ok', true, 'energy', prof.energy);
  end if;

  if prof.energy <= 0 then
    delete from public.lesson_sessions
    where user_id = v_uid and lesson_id = p_lesson_id;
    return jsonb_build_object(
      'ok', false, 'reason', 'no_energy',
      'next_at', prof.energy_updated_at + interval '4 hours');
  end if;

  update public.user_profiles
  set energy = prof.energy - 1,
      energy_updated_at = case when prof.energy >= 5 then now() else energy_updated_at end
  where id = v_uid;

  return jsonb_build_object('ok', true, 'energy', prof.energy - 1);
end;
$$;


ALTER FUNCTION "public"."start_lesson"("p_lesson_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."start_race"("p_race_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  r    public.races;
  prof public.user_profiles;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'reason', 'not_logged_in'); end if;
  select * into r from public.races where id = p_race_id;
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_race'); end if;
  if r.starts_at is null or now() < r.starts_at or now() > r.ends_at then
    return jsonb_build_object('ok', false, 'reason', 'closed');
  end if;

  if exists(select 1 from public.race_ticket_spends
            where race_id = p_race_id and user_id = auth.uid()) then
    return jsonb_build_object('ok', true, 'already', true);
  end if;

  select * into prof from public.user_profiles where id = auth.uid() for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_profile'); end if;

  if not prof.is_admin then
    if coalesce(prof.tickets, 0) <= 0 then
      return jsonb_build_object('ok', false, 'reason', 'no_ticket');
    end if;
    update public.user_profiles set tickets = tickets - 1 where id = auth.uid();
  end if;

  insert into public.race_ticket_spends (race_id, user_id)
  values (p_race_id, auth.uid())
  on conflict do nothing;

  return jsonb_build_object('ok', true, 'tickets', greatest(0, coalesce(prof.tickets, 0) - 1));
end;
$$;


ALTER FUNCTION "public"."start_race"("p_race_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_daily_login"("p_tz" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_uid         uuid := auth.uid();
  prof          public.user_profiles;
  v_tz          text;
  v_today       date;
  v_gap         int;
  v_missed_from date;
  v_missed_to   date;
  v_week        text;
  v_is_pro      boolean;
  v_saved       text := null;
  v_new_streak  int;
  v_guarded     boolean;
  v_ac_days     int := 0;
  v_ac_xp       int := 0;
  v_ac_tick     int := 0;
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

  v_today  := (now() at time zone v_tz)::date;
  v_is_pro := prof.has_subscription or prof.is_admin;

  -- Сегодня уже заходил (или пояс сдвинули назад и «сегодня» уехало в прошлое —
  -- отрицательный gap не должен ронять серию).
  if prof.last_active_date >= v_today then
    if v_tz is distinct from prof.tz then
      update public.user_profiles set tz = v_tz where id = v_uid;
    end if;
    return jsonb_build_object('ok', true, 'streak', prof.current_streak,
      'longest', prof.longest_streak, 'saved_by', null);
  end if;

  if prof.last_active_date is null then
    update public.user_profiles
    set current_streak = 1, longest_streak = greatest(prof.longest_streak, 1),
        last_active_date = v_today, tz = v_tz, last_streak_increment_at = now()
    where id = v_uid;
    return jsonb_build_object('ok', true, 'streak', 1,
      'longest', greatest(prof.longest_streak, 1), 'saved_by', null);
  end if;

  -- Защита 12ч: календарный день сменился, но реальных часов с прошлого
  -- засчитанного дня прошло слишком мало (манипуляция поясом / заход сразу
  -- после полуночи). День помечаем посещённым — серия НЕ сгорает, +1 позже.
  v_guarded := prof.last_streak_increment_at is not null
    and now() - prof.last_streak_increment_at < interval '12 hours';
  if v_guarded then
    update public.user_profiles
    set last_active_date = v_today, tz = v_tz
    where id = v_uid;
    return jsonb_build_object('ok', true, 'streak', prof.current_streak,
      'longest', prof.longest_streak, 'saved_by', null, 'guarded', true);
  end if;

  v_gap := v_today - prof.last_active_date;

  if v_gap = 1 then
    v_new_streak := prof.current_streak + 1;
    update public.user_profiles
    set current_streak = v_new_streak,
        longest_streak = greatest(longest_streak, v_new_streak),
        last_active_date = v_today, tz = v_tz, last_streak_increment_at = now()
    where id = v_uid;
    return jsonb_build_object('ok', true, 'streak', v_new_streak,
      'longest', greatest(prof.longest_streak, v_new_streak), 'saved_by', null);
  end if;

  -- v_gap >= 2: пропущено (v_gap - 1) дней между последним визитом и сегодня.
  v_missed_from := prof.last_active_date + 1;
  v_missed_to   := v_today - 1;

  -- PRO: пропущенный диапазон целиком суббота/воскресенье — прощается всегда.
  if v_is_pro and not exists (
    select 1 from generate_series(v_missed_from, v_missed_to, interval '1 day') d
    where extract(isodow from d) not in (6, 7)
  ) then
    v_saved := 'pro_weekend';
  elsif v_is_pro and v_gap = 2 then
    -- Один пропущенный будний день — прощается, но не чаще раза в неделю.
    v_week := to_char(v_missed_from, 'IYYY-IW');
    if prof.pro_weekday_forgiven_week is distinct from v_week then
      v_saved := 'pro_weekday';
      update public.user_profiles set pro_weekday_forgiven_week = v_week where id = v_uid;
    end if;
  end if;

  if v_saved is null and prof.has_freeze_charge and v_gap = 2 then
    v_saved := 'freeze';
    update public.user_profiles set has_freeze_charge = false where id = v_uid;
  end if;

  if v_saved is null and prof.auto_freeze_charges_left >= (v_gap - 1) then
    v_saved := 'auto_freeze';
    update public.user_profiles
    set auto_freeze_charges_left = auto_freeze_charges_left - (v_gap - 1)
    where id = v_uid;
  end if;

  if v_saved is not null then
    v_new_streak := prof.current_streak + 1;
    update public.user_profiles
    set current_streak = v_new_streak,
        longest_streak = greatest(longest_streak, v_new_streak),
        last_active_date = v_today, tz = v_tz, last_streak_increment_at = now()
    where id = v_uid;
    return jsonb_build_object('ok', true, 'streak', v_new_streak,
      'longest', greatest(prof.longest_streak, v_new_streak), 'saved_by', v_saved);
  end if;

  -- Сброс. Незабранные награды НЕ сгорают: автоклейм — начисляем всё
  -- накопленное (вехи из streak_milestones, остальные дни по 5 XP).
  if prof.current_streak > prof.last_claimed_streak_day then
    select count(*)::int,
           coalesce(sum(coalesce(m.xp_reward, 5)), 0)::int,
           coalesce(sum(coalesce(m.ticket_reward, 0)), 0)::int
    into v_ac_days, v_ac_xp, v_ac_tick
    from generate_series(prof.last_claimed_streak_day + 1, prof.current_streak) d
    left join public.streak_milestones m on m.day_number = d;
  end if;

  update public.user_profiles
  set current_streak = 1, last_claimed_streak_day = 0, last_active_date = v_today,
      tz = v_tz, last_streak_increment_at = now(),
      xp = xp + v_ac_xp, tickets = tickets + v_ac_tick
  where id = v_uid;

  return jsonb_build_object('ok', true, 'streak', 1,
    'longest', prof.longest_streak, 'saved_by', null, 'reset', true,
    'lost_streak', prof.current_streak,
    'auto_claimed', jsonb_build_object('days', v_ac_days, 'xp', v_ac_xp, 'tickets', v_ac_tick));
end;
$$;


ALTER FUNCTION "public"."touch_daily_login"("p_tz" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."client_errors" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "message" "text" NOT NULL,
    "stack" "text",
    "source" "text",
    "ua" "text",
    "app_version" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."client_errors" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."curricula" (
    "id" "text" NOT NULL,
    "title" "text" DEFAULT ''::"text" NOT NULL,
    "lesson_ids" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "video_url" "text",
    "poster_url" "text",
    "published" boolean DEFAULT false NOT NULL,
    "poster_crop" "jsonb",
    "difficulty" smallint,
    "difficulty_votes" integer DEFAULT 0 NOT NULL,
    "is_pro" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."curricula" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."files" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "file_name" "text" NOT NULL,
    "size_bytes" bigint NOT NULL,
    "content_type" "text" DEFAULT 'application/octet-stream'::"text" NOT NULL,
    "r2_url" "text" NOT NULL,
    "uploaded_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."files" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."highlight_color_presets" (
    "id" "text" NOT NULL,
    "colors" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL
);


ALTER TABLE "public"."highlight_color_presets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lesson_results" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "lesson_id" "text" NOT NULL,
    "errors" integer DEFAULT 0 NOT NULL,
    "elapsed_seconds" integer DEFAULT 0 NOT NULL,
    "completed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "answers" "jsonb",
    "xp_awarded" boolean DEFAULT true NOT NULL,
    "stars" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."lesson_results" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lesson_sessions" (
    "user_id" "uuid" NOT NULL,
    "lesson_id" "text" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "free_restart_used" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."lesson_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lessons" (
    "id" "text" NOT NULL,
    "title" "text" DEFAULT ''::"text" NOT NULL,
    "published" boolean DEFAULT false NOT NULL,
    "blocks" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "script" "jsonb" DEFAULT '{"nodes": []}'::"jsonb" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."lessons" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."module_bookmarks" (
    "user_id" "uuid" NOT NULL,
    "module_id" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."module_bookmarks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."module_difficulty_votes" (
    "user_id" "uuid" NOT NULL,
    "module_id" "text" NOT NULL,
    "vote" smallint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "module_difficulty_votes_vote_check" CHECK ((("vote" >= 1) AND ("vote" <= 3)))
);


ALTER TABLE "public"."module_difficulty_votes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."module_likes" (
    "user_id" "uuid" NOT NULL,
    "module_id" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."module_likes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."module_tickets" (
    "user_id" "uuid" NOT NULL,
    "module_id" "text" NOT NULL,
    "hints" integer DEFAULT 0 NOT NULL,
    "earned_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."module_tickets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "provider" "text" DEFAULT 'yookassa'::"text" NOT NULL,
    "provider_payment_id" "text",
    "amount" numeric(10,2) NOT NULL,
    "currency" "text" DEFAULT 'RUB'::"text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "raw" "jsonb"
);


ALTER TABLE "public"."payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."push_subscriptions" (
    "endpoint" "text" NOT NULL,
    "p256dh" "text" NOT NULL,
    "auth" "text" NOT NULL,
    "user_id" "uuid",
    "ua" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."push_subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."push_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" DEFAULT ''::"text" NOT NULL,
    "title" "text" DEFAULT ''::"text" NOT NULL,
    "body" "text" DEFAULT ''::"text" NOT NULL,
    "url" "text" DEFAULT '/'::"text" NOT NULL,
    "trigger_kind" "text" DEFAULT 'manual'::"text" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."push_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."push_trigger_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "trigger_kind" "text" NOT NULL,
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."push_trigger_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."race_entries" (
    "race_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "errors" integer DEFAULT 0 NOT NULL,
    "time_ms" bigint DEFAULT 0 NOT NULL,
    "finished_at" timestamp with time zone,
    "place" integer
);


ALTER TABLE "public"."race_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."race_ticket_spends" (
    "race_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "spent_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."race_ticket_spends" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."races" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" DEFAULT ''::"text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "race_lesson_id" "text",
    "prep_lesson_ids" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "starts_at" timestamp with time zone,
    "ends_at" timestamp with time zone,
    "results_published" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "prep_module_ids" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "race_module_id" "text"
);


ALTER TABLE "public"."races" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."streak_milestones" (
    "day_number" integer NOT NULL,
    "xp_reward" integer DEFAULT 0 NOT NULL,
    "ticket_reward" integer DEFAULT 0 NOT NULL,
    "special" boolean DEFAULT false NOT NULL,
    "label" "text" DEFAULT ''::"text" NOT NULL
);


ALTER TABLE "public"."streak_milestones" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_achievements" (
    "user_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "meta" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "unlocked_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_achievements_kind_check" CHECK (("kind" = ANY (ARRAY['level10'::"text", 'race_finisher'::"text", 'race_winner'::"text", 'clean_final'::"text"])))
);


ALTER TABLE "public"."user_achievements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_module_progress" (
    "user_id" "uuid" NOT NULL,
    "module_id" "text" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_module_progress" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_profiles" (
    "id" "uuid" NOT NULL,
    "energy" integer DEFAULT 5 NOT NULL,
    "energy_updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "has_subscription" boolean DEFAULT false NOT NULL,
    "subscription_expires" timestamp with time zone,
    "is_admin" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "xp" integer DEFAULT 0 NOT NULL,
    "nickname" "text" DEFAULT ''::"text" NOT NULL,
    "cosmetics" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "nickname_changed_at" timestamp with time zone,
    "nickname_changes" integer DEFAULT 0 NOT NULL,
    "subscription_until" timestamp with time zone,
    "tickets" integer DEFAULT 0 NOT NULL,
    "avatar_seed" "text",
    "current_streak" integer DEFAULT 0 NOT NULL,
    "longest_streak" integer DEFAULT 0 NOT NULL,
    "last_active_date" "date",
    "last_claimed_streak_day" integer DEFAULT 0 NOT NULL,
    "has_freeze_charge" boolean DEFAULT false NOT NULL,
    "auto_freeze_charges_left" integer DEFAULT 0 NOT NULL,
    "pro_weekday_forgiven_week" "text",
    "tz" "text" DEFAULT 'Europe/Moscow'::"text" NOT NULL,
    "last_streak_increment_at" timestamp with time zone,
    CONSTRAINT "user_profiles_energy_range" CHECK ((("energy" >= 0) AND ("energy" <= 5)))
);


ALTER TABLE "public"."user_profiles" OWNER TO "postgres";


ALTER TABLE ONLY "public"."client_errors"
    ADD CONSTRAINT "client_errors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."curricula"
    ADD CONSTRAINT "curricula_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."files"
    ADD CONSTRAINT "files_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."highlight_color_presets"
    ADD CONSTRAINT "highlight_color_presets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lesson_results"
    ADD CONSTRAINT "lesson_results_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lesson_sessions"
    ADD CONSTRAINT "lesson_sessions_pkey" PRIMARY KEY ("user_id", "lesson_id");



ALTER TABLE ONLY "public"."lessons"
    ADD CONSTRAINT "lessons_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."module_bookmarks"
    ADD CONSTRAINT "module_bookmarks_pkey" PRIMARY KEY ("user_id", "module_id");



ALTER TABLE ONLY "public"."module_difficulty_votes"
    ADD CONSTRAINT "module_difficulty_votes_pkey" PRIMARY KEY ("user_id", "module_id");



ALTER TABLE ONLY "public"."module_likes"
    ADD CONSTRAINT "module_likes_pkey" PRIMARY KEY ("user_id", "module_id");



ALTER TABLE ONLY "public"."module_tickets"
    ADD CONSTRAINT "module_tickets_pkey" PRIMARY KEY ("user_id", "module_id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_provider_payment_id_key" UNIQUE ("provider_payment_id");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("endpoint");



ALTER TABLE ONLY "public"."push_templates"
    ADD CONSTRAINT "push_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_trigger_log"
    ADD CONSTRAINT "push_trigger_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."race_entries"
    ADD CONSTRAINT "race_entries_pkey" PRIMARY KEY ("race_id", "user_id");



ALTER TABLE ONLY "public"."race_ticket_spends"
    ADD CONSTRAINT "race_ticket_spends_pkey" PRIMARY KEY ("race_id", "user_id");



ALTER TABLE ONLY "public"."races"
    ADD CONSTRAINT "races_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."streak_milestones"
    ADD CONSTRAINT "streak_milestones_pkey" PRIMARY KEY ("day_number");



ALTER TABLE ONLY "public"."user_achievements"
    ADD CONSTRAINT "user_achievements_pkey" PRIMARY KEY ("user_id", "kind");



ALTER TABLE ONLY "public"."user_module_progress"
    ADD CONSTRAINT "user_module_progress_pkey" PRIMARY KEY ("user_id", "module_id");



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id");



CREATE INDEX "client_errors_created_idx" ON "public"."client_errors" USING "btree" ("created_at" DESC);



CREATE UNIQUE INDEX "lesson_results_user_lesson_uniq" ON "public"."lesson_results" USING "btree" ("user_id", "lesson_id");



CREATE INDEX "push_trigger_log_user_kind" ON "public"."push_trigger_log" USING "btree" ("user_id", "trigger_kind", "sent_at" DESC);



CREATE OR REPLACE TRIGGER "curricula_updated_at" BEFORE UPDATE ON "public"."curricula" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "mdv_updated_at" BEFORE UPDATE ON "public"."module_difficulty_votes" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "module_difficulty_recalc" AFTER INSERT OR DELETE OR UPDATE ON "public"."module_difficulty_votes" FOR EACH ROW EXECUTE FUNCTION "public"."recalc_module_difficulty"();



ALTER TABLE ONLY "public"."client_errors"
    ADD CONSTRAINT "client_errors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lesson_results"
    ADD CONSTRAINT "lesson_results_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lesson_results"
    ADD CONSTRAINT "lesson_results_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lesson_sessions"
    ADD CONSTRAINT "lesson_sessions_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lesson_sessions"
    ADD CONSTRAINT "lesson_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."module_bookmarks"
    ADD CONSTRAINT "module_bookmarks_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "public"."curricula"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."module_bookmarks"
    ADD CONSTRAINT "module_bookmarks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."module_difficulty_votes"
    ADD CONSTRAINT "module_difficulty_votes_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "public"."curricula"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."module_difficulty_votes"
    ADD CONSTRAINT "module_difficulty_votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."module_likes"
    ADD CONSTRAINT "module_likes_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "public"."curricula"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."module_likes"
    ADD CONSTRAINT "module_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."module_tickets"
    ADD CONSTRAINT "module_tickets_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "public"."curricula"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."module_tickets"
    ADD CONSTRAINT "module_tickets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."race_entries"
    ADD CONSTRAINT "race_entries_race_id_fkey" FOREIGN KEY ("race_id") REFERENCES "public"."races"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."race_entries"
    ADD CONSTRAINT "race_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."race_ticket_spends"
    ADD CONSTRAINT "race_ticket_spends_race_id_fkey" FOREIGN KEY ("race_id") REFERENCES "public"."races"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."race_ticket_spends"
    ADD CONSTRAINT "race_ticket_spends_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."races"
    ADD CONSTRAINT "races_race_lesson_id_fkey" FOREIGN KEY ("race_lesson_id") REFERENCES "public"."lessons"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."races"
    ADD CONSTRAINT "races_race_module_id_fkey" FOREIGN KEY ("race_module_id") REFERENCES "public"."curricula"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_achievements"
    ADD CONSTRAINT "user_achievements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_module_progress"
    ADD CONSTRAINT "user_module_progress_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "public"."curricula"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_module_progress"
    ADD CONSTRAINT "user_module_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "ach_select_all" ON "public"."user_achievements" FOR SELECT USING (true);



ALTER TABLE "public"."client_errors" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "client_errors_insert_all" ON "public"."client_errors" FOR INSERT WITH CHECK (true);



CREATE POLICY "client_errors_select_admin" ON "public"."client_errors" FOR SELECT USING ("public"."is_admin"());



ALTER TABLE "public"."curricula" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "curricula_select_all" ON "public"."curricula" FOR SELECT USING (true);



CREATE POLICY "curricula_write_admin" ON "public"."curricula" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."files" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "files_select_all" ON "public"."files" FOR SELECT USING (true);



CREATE POLICY "files_write_admin" ON "public"."files" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "hcp_select_all" ON "public"."highlight_color_presets" FOR SELECT USING (true);



CREATE POLICY "hcp_write_admin" ON "public"."highlight_color_presets" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."highlight_color_presets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lesson_results" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lesson_sessions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "lesson_sessions_select_own" ON "public"."lesson_sessions" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."lessons" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "lessons_select_all" ON "public"."lessons" FOR SELECT USING (true);



CREATE POLICY "lessons_write_admin" ON "public"."lessons" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "mdv_select_all" ON "public"."module_difficulty_votes" FOR SELECT USING (true);



CREATE POLICY "mdv_write_own" ON "public"."module_difficulty_votes" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."module_bookmarks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "module_bookmarks_own" ON "public"."module_bookmarks" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."module_difficulty_votes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."module_likes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "module_likes_select_all" ON "public"."module_likes" FOR SELECT USING (true);



CREATE POLICY "module_likes_write_own" ON "public"."module_likes" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."module_tickets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "module_tickets_select_own" ON "public"."module_tickets" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payments_select_own" ON "public"."payments" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "profiles_select_own" ON "public"."user_profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "push_subs_delete" ON "public"."push_subscriptions" FOR DELETE TO "authenticated", "anon" USING (true);



CREATE POLICY "push_subs_insert" ON "public"."push_subscriptions" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "push_subs_update" ON "public"."push_subscriptions" FOR UPDATE TO "authenticated", "anon" USING (true) WITH CHECK (true);



ALTER TABLE "public"."push_subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."push_templates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "push_templates_admin" ON "public"."push_templates" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."push_trigger_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."race_entries" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "race_entries_select_own" ON "public"."race_entries" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."race_ticket_spends" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "race_ticket_spends_select_own" ON "public"."race_ticket_spends" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."races" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "races_select_all" ON "public"."races" FOR SELECT USING (true);



CREATE POLICY "races_write_admin" ON "public"."races" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "results_own" ON "public"."lesson_results" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."streak_milestones" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "streak_milestones_select_all" ON "public"."streak_milestones" FOR SELECT USING (true);



CREATE POLICY "streak_milestones_write_admin" ON "public"."streak_milestones" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."user_achievements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_module_progress" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_module_progress_own" ON "public"."user_module_progress" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."user_profiles" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."activate_subscription"("p_user" "uuid", "p_days" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."activate_subscription"("p_user" "uuid", "p_days" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."apply_energy_regen"("p_uid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."apply_energy_regen"("p_uid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_energy_regen"("p_uid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."award_module_ticket"("p_module_id" "text", "p_hints" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."award_module_ticket"("p_module_id" "text", "p_hints" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."award_module_ticket"("p_module_id" "text", "p_hints" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."buy_auto_freeze"() TO "anon";
GRANT ALL ON FUNCTION "public"."buy_auto_freeze"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."buy_auto_freeze"() TO "service_role";



GRANT ALL ON FUNCTION "public"."buy_streak_freeze"() TO "anon";
GRANT ALL ON FUNCTION "public"."buy_streak_freeze"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."buy_streak_freeze"() TO "service_role";



GRANT ALL ON FUNCTION "public"."claim_level_achievement"() TO "anon";
GRANT ALL ON FUNCTION "public"."claim_level_achievement"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."claim_level_achievement"() TO "service_role";



GRANT ALL ON FUNCTION "public"."claim_streak_reward"() TO "anon";
GRANT ALL ON FUNCTION "public"."claim_streak_reward"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."claim_streak_reward"() TO "service_role";



GRANT ALL ON FUNCTION "public"."claim_streak_rewards_all"() TO "anon";
GRANT ALL ON FUNCTION "public"."claim_streak_rewards_all"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."claim_streak_rewards_all"() TO "service_role";



GRANT ALL ON FUNCTION "public"."complete_lesson"("p_lesson_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."complete_lesson"("p_lesson_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."complete_lesson"("p_lesson_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."expire_subscription"("p_uid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."expire_subscription"("p_uid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."expire_subscription"("p_uid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."finalize_race"("p_race_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."finalize_race"("p_race_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."finalize_race"("p_race_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."finish_race"("p_race_id" "uuid", "p_errors" integer, "p_time_ms" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."finish_race"("p_race_id" "uuid", "p_errors" integer, "p_time_ms" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."finish_race"("p_race_id" "uuid", "p_errors" integer, "p_time_ms" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_leaderboard"("p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_leaderboard"("p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_leaderboard"("p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_my_race_rank"("p_race_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_race_rank"("p_race_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_race_rank"("p_race_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_my_rank"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_rank"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_rank"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_race_results"("p_race_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_race_results"("p_race_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_race_results"("p_race_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."push_audience_energy_full"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."push_audience_energy_full"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."push_audience_evening"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."push_audience_evening"() TO "service_role";



GRANT ALL ON FUNCTION "public"."recalc_module_difficulty"() TO "anon";
GRANT ALL ON FUNCTION "public"."recalc_module_difficulty"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."recalc_module_difficulty"() TO "service_role";



GRANT ALL ON FUNCTION "public"."reset_lesson_progress"("p_lesson_ids" "text"[], "p_clear_answers" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."reset_lesson_progress"("p_lesson_ids" "text"[], "p_clear_answers" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."reset_lesson_progress"("p_lesson_ids" "text"[], "p_clear_answers" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."save_lesson_stars"("p_lesson_id" "text", "p_stars" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."save_lesson_stars"("p_lesson_id" "text", "p_stars" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."save_lesson_stars"("p_lesson_id" "text", "p_stars" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_avatar"("p_seed" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."set_avatar"("p_seed" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_avatar"("p_seed" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_cosmetics"("p_cosmetics" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."set_cosmetics"("p_cosmetics" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_cosmetics"("p_cosmetics" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_nickname"("p_nick" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."set_nickname"("p_nick" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_nickname"("p_nick" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."spend_energy"() TO "anon";
GRANT ALL ON FUNCTION "public"."spend_energy"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."spend_energy"() TO "service_role";



GRANT ALL ON FUNCTION "public"."start_lesson"("p_lesson_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."start_lesson"("p_lesson_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."start_lesson"("p_lesson_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."start_race"("p_race_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."start_race"("p_race_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."start_race"("p_race_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_daily_login"("p_tz" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."touch_daily_login"("p_tz" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_daily_login"("p_tz" "text") TO "service_role";



GRANT ALL ON TABLE "public"."client_errors" TO "anon";
GRANT ALL ON TABLE "public"."client_errors" TO "authenticated";
GRANT ALL ON TABLE "public"."client_errors" TO "service_role";



GRANT ALL ON TABLE "public"."curricula" TO "anon";
GRANT ALL ON TABLE "public"."curricula" TO "authenticated";
GRANT ALL ON TABLE "public"."curricula" TO "service_role";



GRANT ALL ON TABLE "public"."files" TO "anon";
GRANT ALL ON TABLE "public"."files" TO "authenticated";
GRANT ALL ON TABLE "public"."files" TO "service_role";



GRANT ALL ON TABLE "public"."highlight_color_presets" TO "anon";
GRANT ALL ON TABLE "public"."highlight_color_presets" TO "authenticated";
GRANT ALL ON TABLE "public"."highlight_color_presets" TO "service_role";



GRANT ALL ON TABLE "public"."lesson_results" TO "anon";
GRANT ALL ON TABLE "public"."lesson_results" TO "authenticated";
GRANT ALL ON TABLE "public"."lesson_results" TO "service_role";



GRANT ALL ON TABLE "public"."lesson_sessions" TO "anon";
GRANT ALL ON TABLE "public"."lesson_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."lesson_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."lessons" TO "anon";
GRANT ALL ON TABLE "public"."lessons" TO "authenticated";
GRANT ALL ON TABLE "public"."lessons" TO "service_role";



GRANT ALL ON TABLE "public"."module_bookmarks" TO "anon";
GRANT ALL ON TABLE "public"."module_bookmarks" TO "authenticated";
GRANT ALL ON TABLE "public"."module_bookmarks" TO "service_role";



GRANT ALL ON TABLE "public"."module_difficulty_votes" TO "anon";
GRANT ALL ON TABLE "public"."module_difficulty_votes" TO "authenticated";
GRANT ALL ON TABLE "public"."module_difficulty_votes" TO "service_role";



GRANT ALL ON TABLE "public"."module_likes" TO "anon";
GRANT ALL ON TABLE "public"."module_likes" TO "authenticated";
GRANT ALL ON TABLE "public"."module_likes" TO "service_role";



GRANT ALL ON TABLE "public"."module_tickets" TO "anon";
GRANT ALL ON TABLE "public"."module_tickets" TO "authenticated";
GRANT ALL ON TABLE "public"."module_tickets" TO "service_role";



GRANT ALL ON TABLE "public"."payments" TO "anon";
GRANT ALL ON TABLE "public"."payments" TO "authenticated";
GRANT ALL ON TABLE "public"."payments" TO "service_role";



GRANT ALL ON TABLE "public"."push_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."push_templates" TO "anon";
GRANT ALL ON TABLE "public"."push_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."push_templates" TO "service_role";



GRANT ALL ON TABLE "public"."push_trigger_log" TO "anon";
GRANT ALL ON TABLE "public"."push_trigger_log" TO "authenticated";
GRANT ALL ON TABLE "public"."push_trigger_log" TO "service_role";



GRANT ALL ON TABLE "public"."race_entries" TO "anon";
GRANT ALL ON TABLE "public"."race_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."race_entries" TO "service_role";



GRANT ALL ON TABLE "public"."race_ticket_spends" TO "anon";
GRANT ALL ON TABLE "public"."race_ticket_spends" TO "authenticated";
GRANT ALL ON TABLE "public"."race_ticket_spends" TO "service_role";



GRANT ALL ON TABLE "public"."races" TO "anon";
GRANT ALL ON TABLE "public"."races" TO "authenticated";
GRANT ALL ON TABLE "public"."races" TO "service_role";



GRANT ALL ON TABLE "public"."streak_milestones" TO "anon";
GRANT ALL ON TABLE "public"."streak_milestones" TO "authenticated";
GRANT ALL ON TABLE "public"."streak_milestones" TO "service_role";



GRANT ALL ON TABLE "public"."user_achievements" TO "anon";
GRANT ALL ON TABLE "public"."user_achievements" TO "authenticated";
GRANT ALL ON TABLE "public"."user_achievements" TO "service_role";



GRANT ALL ON TABLE "public"."user_module_progress" TO "anon";
GRANT ALL ON TABLE "public"."user_module_progress" TO "authenticated";
GRANT ALL ON TABLE "public"."user_module_progress" TO "service_role";



GRANT ALL ON TABLE "public"."user_profiles" TO "anon";
GRANT ALL ON TABLE "public"."user_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_profiles" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







