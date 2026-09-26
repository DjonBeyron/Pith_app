-- Конец сессии повторения: серия + XP (этап 4 системы повторения, 2026-09-25).
-- Концепция: PROJECT.md → «Система повторения» → «Деньги, серия, XP, пуши».
--
-- Порядок на клиенте (src/features/review/): исход слова уходит в
-- memory_review_word сразу, как у слова кончились карточки сессии (брошенная
-- посреди сессия не теряет уже отвеченное); в самом конце — список слов
-- сессии сюда. Сервер проверяет, что у КАЖДОГО слова есть исход повторения,
-- записанный сегодня (в поясе пользователя), — одна открытая карточка
-- сессией не считается. Тогда:
--   * XP: 2 за каждый исход «по расписанию» (applied — слово созрело), ещё не
--     оплаченный; потолок 20 XP в день на все сессии. Повтор раньше срока
--     (applied = false) — 0 XP;
--   * день серии: та же bump_streak_on_lesson, что у урока (идемпотентна в
--     пределах суток), — если в сессии было хоть одно слово по расписанию.
-- Повторный вызов с тем же списком ничего не добавляет: события помечены
-- xp_awarded, день серии уже закрыт.

alter table public.review_events
  add column if not exists xp_awarded boolean not null default false;

alter table public.user_profiles
  add column if not exists review_xp_date date;
alter table public.user_profiles
  add column if not exists review_xp_today integer not null default 0;

comment on column public.user_profiles.review_xp_today is
  'XP за повторение, начисленный в день review_xp_date (пояс tz). Потолок — в memory_finish_session.';

create or replace function public.memory_finish_session(p_words text[]) returns jsonb
    language plpgsql security definer
    set search_path = public
    as $$
declare
  v_uid     uuid := auth.uid();
  v_cap     constant int := 20;
  v_per     constant int := 2;
  prof      public.user_profiles;
  v_tz      text;
  v_today   date;
  v_words   text[];
  v_missing text[];
  v_before  int;
  v_ids     bigint[];
  v_xp      int := 0;
  v_streak  jsonb := null;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'auth');
  end if;

  select array_agg(distinct k) into v_words
  from (select public.word_key(w) as k from unnest(coalesce(p_words, '{}'::text[])) as w) t
  where k is not null;
  if v_words is null or cardinality(v_words) > 50 then
    return jsonb_build_object('ok', false, 'reason', 'words');
  end if;

  -- Блокировка профиля: две вкладки, закончившие сессию одновременно, не
  -- проскочат потолок XP
  select * into prof from public.user_profiles where id = v_uid for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'profile');
  end if;
  v_tz    := coalesce(prof.tz, 'Europe/Moscow');
  v_today := (now() at time zone v_tz)::date;

  select array_agg(w) into v_missing
  from unnest(v_words) as w
  where not exists (
    select 1 from public.review_events e
    where e.user_id = v_uid and e.word = w and e.source = 'review'
      and (e.created_at at time zone v_tz)::date = v_today);
  if v_missing is not null then
    return jsonb_build_object('ok', false, 'reason', 'incomplete', 'missing', to_jsonb(v_missing));
  end if;

  v_before := case when prof.review_xp_date = v_today then prof.review_xp_today else 0 end;

  select array_agg(id) into v_ids
  from (
    select e.id from public.review_events e
    where e.user_id = v_uid and e.word = any(v_words) and e.source = 'review'
      and e.applied and not e.xp_awarded
      and (e.created_at at time zone v_tz)::date = v_today
    order by e.id
    limit greatest(0, v_cap - v_before) / v_per
  ) t;

  if v_ids is not null then
    v_xp := cardinality(v_ids) * v_per;
    update public.review_events set xp_awarded = true where id = any(v_ids);
    update public.user_profiles
    set xp = xp + v_xp,
        review_xp_date  = v_today,
        review_xp_today = v_before + v_xp
    where id = v_uid;
  end if;

  if exists (
    select 1 from public.review_events e
    where e.user_id = v_uid and e.word = any(v_words) and e.source = 'review' and e.applied
      and (e.created_at at time zone v_tz)::date = v_today
  ) then
    v_streak := public.bump_streak_on_lesson();
  end if;

  return jsonb_build_object(
    'ok', true, 'xp', v_xp, 'xp_today', v_before + v_xp, 'xp_cap', v_cap,
    'words', cardinality(v_words), 'streak', v_streak);
end;
$$;

revoke all on function public.memory_finish_session(text[]) from public, anon;
grant execute on function public.memory_finish_session(text[]) to authenticated;
