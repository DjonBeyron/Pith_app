-- «Рейтинг» (2026-10-09): в строке игрока показываем, сколько слов он знает
-- (постоянная память), а в попапе игрока — сколько у него достижений.
--
-- 1) get_leaderboard теперь отдаёт ещё words_perm — число слов в постоянной
--    памяти (word_memory.settled_on is not null). У функции returns table,
--    поэтому набор колонок меняется только через DROP + CREATE (в этой же
--    миграции, идемпотентно). Все прежние колонки и порядок сохранены; права —
--    как были (anon / authenticated / service_role). Заодно закреплён
--    search_path = public (у старой версии его не было) и добавлен stable.
--    Счёт слов — одним lateral-join ТОЛЬКО по строкам топа (limit внутри CTE),
--    а не по всем профилям; по индексу ниже это index-only scan.
-- 2) Частичный индекс по постоянной памяти — под этот подсчёт.
-- 3) leaderboard_user_stats: добавлено поле achievements (число строк в
--    user_achievements у игрока — тот же источник, что у «Кастомизации» в
--    Профиле). words_new / words_known / words_solid остаются в ответе для
--    совместимости, клиент их больше не показывает.

create index if not exists word_memory_user_settled_idx
  on public.word_memory (user_id) where settled_on is not null;

drop function if exists public.get_leaderboard(integer);

create function public.get_leaderboard(p_limit integer default 100)
returns table (
  user_id        uuid,
  nickname       text,
  xp             integer,
  cosmetics      jsonb,
  medal_place    integer,
  is_pro         boolean,
  avatar_seed    text,
  current_streak integer,
  words_perm     integer
)
language sql stable security definer
set search_path = public
as $$
  with top as (
    select p.id, p.nickname, p.xp, p.cosmetics,
           (a.meta->>'place')::int as place,
           (p.has_subscription or p.is_admin) as pro,
           p.avatar_seed, p.current_streak, p.created_at
    from public.user_profiles p
    left join public.user_achievements a on a.user_id = p.id and a.kind = 'race_winner'
    order by p.xp desc, p.created_at asc
    limit least(greatest(coalesce(p_limit, 100), 1), 200)
  )
  select t.id, t.nickname, t.xp, t.cosmetics, t.place, t.pro,
         t.avatar_seed, t.current_streak, coalesce(w.cnt, 0)::int
  from top t
  left join lateral (
    select count(*) as cnt
    from public.word_memory m
    where m.user_id = t.id and m.settled_on is not null
  ) w on true
  order by t.xp desc, t.created_at asc;
$$;

revoke all on function public.get_leaderboard(integer) from public;
grant execute on function public.get_leaderboard(integer) to anon, authenticated, service_role;

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
  v_ach    int;
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

  select count(*) into v_ach
  from public.user_achievements a
  where a.user_id = p_user;

  return jsonb_build_object(
    'ok', true,
    'words_new', coalesce(v_new, 0),
    'words_known', coalesce(v_known, 0),
    'words_solid', coalesce(v_solid, 0),
    'words_perm', coalesce(v_perm, 0),
    'phrases', coalesce(v_phr, 0),
    'longest_streak', coalesce(v_streak, 0),
    'achievements', coalesce(v_ach, 0)
  );
end;
$$;

revoke all on function public.leaderboard_user_stats(uuid) from public, anon;
grant execute on function public.leaderboard_user_stats(uuid) to authenticated;
grant execute on function public.leaderboard_user_stats(uuid) to service_role;

notify pgrst, 'reload schema';
