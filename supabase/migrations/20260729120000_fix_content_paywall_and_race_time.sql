-- Security fixes (security-review 2026-07-29):
-- 1) curricula/lessons SELECT было открыто всем (USING (true)) без проверки
--    published/is_pro — платный и неопубликованный контент читался напрямую
--    через Supabase REST в обход paywall.
-- 2) finish_race доверял клиентскому p_time_ms — можно было заявить любое
--    время (например 1мс) и гарантировать себе 1 место. Теперь время гонки
--    считается сервером от race_ticket_spends.spent_at (эта метка уже
--    ставится сервером в start_race при входе в гонку, до этой миграции
--    просто не использовалась для проверки).

CREATE OR REPLACE FUNCTION "public"."has_pro_access"() RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
declare
  prof public.user_profiles;
begin
  select * into prof from public.user_profiles where id = auth.uid();
  if not found then return false; end if;
  return coalesce(prof.has_subscription, false) or coalesce(prof.is_admin, false);
end;
$$;

ALTER FUNCTION "public"."has_pro_access"() OWNER TO "postgres";

GRANT ALL ON FUNCTION "public"."has_pro_access"() TO "anon";
GRANT ALL ON FUNCTION "public"."has_pro_access"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_pro_access"() TO "service_role";

DROP POLICY IF EXISTS "curricula_select_all" ON "public"."curricula";
CREATE POLICY "curricula_select_all" ON "public"."curricula" FOR SELECT
USING (
  "public"."is_admin"()
  OR (
    "published" = true
    AND (COALESCE("is_pro", false) = false OR "public"."has_pro_access"())
  )
);

DROP POLICY IF EXISTS "lessons_select_all" ON "public"."lessons";
CREATE POLICY "lessons_select_all" ON "public"."lessons" FOR SELECT
USING (
  "public"."is_admin"()
  OR (
    "published" = true
    AND (
      "public"."has_pro_access"()
      OR NOT EXISTS (
        SELECT 1 FROM "public"."curricula" c
        WHERE COALESCE(c."is_pro", false) = true
          AND c."lesson_ids" @> to_jsonb("lessons"."id")
      )
    )
  )
);

CREATE OR REPLACE FUNCTION "public"."finish_race"("p_race_id" "uuid", "p_errors" integer, "p_time_ms" bigint) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  r          public.races;
  v_spent_at timestamp with time zone;
  v_time_ms  bigint;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'reason', 'not_logged_in'); end if;
  select * into r from public.races where id = p_race_id;
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_race'); end if;
  if r.starts_at is null or now() < r.starts_at or now() > r.ends_at + interval '10 minutes' then
    return jsonb_build_object('ok', false, 'reason', 'closed');
  end if;

  select spent_at into v_spent_at
  from public.race_ticket_spends
  where race_id = p_race_id and user_id = auth.uid();

  -- Каноничное время — от серверной метки входа в гонку, а не из клиента.
  if v_spent_at is not null then
    v_time_ms := greatest(0, floor(extract(epoch from (now() - v_spent_at)) * 1000));
  else
    v_time_ms := greatest(0, coalesce(p_time_ms, 0));
  end if;

  insert into public.race_entries (race_id, user_id, errors, time_ms, finished_at)
  values (p_race_id, auth.uid(),
          greatest(0, coalesce(p_errors, 0)), v_time_ms, now())
  on conflict (race_id, user_id) do nothing;
  if not found then return jsonb_build_object('ok', false, 'reason', 'already'); end if;
  -- Достижение «Участник гонки» — за финиш.
  insert into public.user_achievements (user_id, kind)
  values (auth.uid(), 'race_finisher')
  on conflict do nothing;
  return jsonb_build_object('ok', true);
end;
$$;
