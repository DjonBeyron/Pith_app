-- Контрольная группа без «умных» вопросов Пита (PLAN_NEW_USER.md, решение 23; этап A1, часть 2).
-- Группа считается на клиенте (хеш anon_id, src/shared/lib/prompts/promptGroup.js) и запоминается в localStorage.
-- Вошедшему она записывается в профиль один раз: с другого устройства человек остаётся в той же группе.
-- Идемпотентно: повторный запуск ничего не меняет.
--
--   user_profiles.prompt_group    — 'control' (без вопросов) | 'prompts' (с вопросами) | null (ещё не записана)
--   set_prompt_group(p_group)     — записать группу, если в профиле её ещё нет; вернуть актуальную группу профиля
--   app_settings 'prompt_control' — { "share": 0..50 } доля контрольной группы, %; 0 = группы нет. Клиент читает
--                                   ключ без входа (белый список app_settings_public_keys), пишет только админ

alter table public.user_profiles
  add column if not exists prompt_group text;

comment on column public.user_profiles.prompt_group is
  'Группа эксперимента «вопросы Пита»: control — без умных вопросов, prompts — с ними; null — не записана. Пишет set_prompt_group один раз.';

create or replace function public.set_prompt_group(p_group text) returns text
    language plpgsql security definer
    set search_path = public
    as $$
declare
  v_uid   uuid := auth.uid();
  v_group text;
begin
  if v_uid is null then
    raise exception 'set_prompt_group: auth required';
  end if;
  if p_group is null or p_group not in ('control', 'prompts') then
    raise exception 'set_prompt_group: group must be control or prompts';
  end if;

  select prompt_group into v_group from public.user_profiles where id = v_uid for update;
  if not found then
    return null; -- профиля ещё нет: клиент повторит при следующем входе
  end if;
  if v_group is not null then
    return v_group; -- уже записана: не перезаписываем (человек не «перескакивает» между группами)
  end if;

  update public.user_profiles set prompt_group = p_group where id = v_uid;
  return p_group;
end;
$$;

revoke all on function public.set_prompt_group(text) from public, anon;
grant execute on function public.set_prompt_group(text) to authenticated;

-- Клиент (в том числе гость) читает долю при старте
insert into public.app_settings_public_keys (key, note) values
  ('prompt_control', 'доля контрольной группы без вопросов Пита, { share: 0..50 }')
on conflict (key) do nothing;

-- Значение по умолчанию: 10% новых устройств в контрольной группе
insert into public.app_settings (key, value)
values ('prompt_control', '{"share": 10}'::jsonb)
on conflict (key) do nothing;
