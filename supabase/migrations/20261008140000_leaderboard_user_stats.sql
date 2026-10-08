-- Попап пользователя в «Рейтинге» (2026-10-08): тап по строке рейтинга открывает
-- окно с подробностями — сколько слов у игрока на каждой ступени памяти и сколько
-- фраз он полностью выучил. Таблицы word_memory / phrase_memory закрыты RLS
-- (только «своё»), поэтому чужие агрегаты отдаёт SECURITY DEFINER-функция —
-- тот же подход, что у get_leaderboard (ник/XP/косметика, без email).
--
-- Отдаёт ТОЛЬКО счётчики, никаких слов, ников, email и приватных полей:
--   words_new    — «Новые»     (шаги 1–2, не в постоянной памяти)
--   words_known  — «Знакомые»  (шаги 3–4)
--   words_solid  — «Усвоенные» (шаг 5, ещё не прошли месячную проверку)
--   words_perm   — «Постоянная память» (word_memory.settled_on не null) —
--                  это и есть «сколько слов знает»
--   phrases      — выученные фразы: строки phrase_memory (все слова фразы
--                  были на шаге ≥ 3 и фразу собрали целиком — «золотые»)
--   longest_streak — рекорд дней подряд
-- Ступени считаются так же, как в приложении (features/learn/memoryLadder.js).
-- Нет такого игрока → { ok: false, reason: 'not_found' }.
-- Идемпотентно: create or replace + revoke/grant.

create or replace function public.leaderboard_user_stats(p_user uuid) returns jsonb
    language plpgsql stable security definer
    set search_path = public
    as $$
declare
  v_streak int;
  v_new    int;
  v_known  int;
  v_solid  int;
  v_perm   int;
  v_phr    int;
begin
  if p_user is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  select p.longest_streak into v_streak
  from public.user_profiles p
  where p.id = p_user;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  select
    count(*) filter (where m.settled_on is null and m.step < 3),
    count(*) filter (where m.settled_on is null and m.step in (3, 4)),
    count(*) filter (where m.settled_on is null and m.step >= 5),
    count(*) filter (where m.settled_on is not null)
  into v_new, v_known, v_solid, v_perm
  from public.word_memory m
  where m.user_id = p_user;

  select count(*) into v_phr
  from public.phrase_memory f
  where f.user_id = p_user;

  return jsonb_build_object(
    'ok', true,
    'words_new', coalesce(v_new, 0),
    'words_known', coalesce(v_known, 0),
    'words_solid', coalesce(v_solid, 0),
    'words_perm', coalesce(v_perm, 0),
    'phrases', coalesce(v_phr, 0),
    'longest_streak', coalesce(v_streak, 0)
  );
end;
$$;

revoke all on function public.leaderboard_user_stats(uuid) from public, anon;
grant execute on function public.leaderboard_user_stats(uuid) to authenticated;
grant execute on function public.leaderboard_user_stats(uuid) to service_role;
