-- Достижение «Начало пути» (journey_start) и тест-инструмент админа «выдать себе достижение» (2026-10-03).
--   1) вид journey_start разрешён в user_achievements;
--   2) handle_new_user выдаёт его при регистрации профиля;
--   3) уже существующие профили получают его задним числом (дата — дата создания профиля);
--   4) admin_set_achievement(kind, on, place) — админ ставит/снимает достижение СЕБЕ
--      (вкладка «Достижения» в админке; для race_winner place — место 1..3).
-- Идемпотентно: drop constraint if exists, create or replace, on conflict do nothing.

alter table public.user_achievements drop constraint if exists user_achievements_kind_check;
alter table public.user_achievements add constraint user_achievements_kind_check
  check (kind in ('level10', 'race_finisher', 'race_winner', 'clean_final', 'journey_start'));

create or replace function public.handle_new_user() returns trigger
    language plpgsql security definer
    set search_path = public
    as $$
begin
  insert into public.user_profiles (id, nickname)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data->>'name'), ''),
                  split_part(coalesce(new.email, ''), '@', 1)), 20)
  )
  on conflict (id) do nothing;
  insert into public.user_achievements (user_id, kind)
  values (new.id, 'journey_start')
  on conflict do nothing;
  return new;
end;
$$;

insert into public.user_achievements (user_id, kind, unlocked_at)
select id, 'journey_start', created_at from public.user_profiles
on conflict do nothing;

create or replace function public.admin_set_achievement(p_kind text, p_on boolean, p_place int default null) returns jsonb
    language plpgsql security definer
    set search_path = public
    as $$
declare
  v_uid uuid := auth.uid();
  v_key text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'auth');
  end if;
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;
  if p_kind is null or p_kind not in ('level10', 'race_finisher', 'race_winner', 'clean_final', 'journey_start') then
    return jsonb_build_object('ok', false, 'reason', 'kind');
  end if;

  if coalesce(p_on, false) then
    insert into public.user_achievements (user_id, kind, meta)
    values (v_uid, p_kind,
            case when p_kind = 'race_winner'
                 then jsonb_build_object('place', greatest(1, least(3, coalesce(p_place, 1))))
                 else '{}'::jsonb end)
    on conflict (user_id, kind) do update set meta = excluded.meta;
  else
    delete from public.user_achievements where user_id = v_uid and kind = p_kind;
    -- косметика, которую открывало достижение, снимается вместе с ним
    v_key := case p_kind when 'level10' then 'bg' when 'clean_final' then 'bg2'
                         when 'race_finisher' then 'frame' when 'race_winner' then 'medal' end;
    if v_key is not null then
      update public.user_profiles set cosmetics = cosmetics - v_key where id = v_uid;
    end if;
  end if;
  return jsonb_build_object('ok', true, 'kind', p_kind, 'on', coalesce(p_on, false));
end;
$$;

revoke all on function public.admin_set_achievement(text, boolean, int) from public, anon;
grant execute on function public.admin_set_achievement(text, boolean, int) to authenticated;
