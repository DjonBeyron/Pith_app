-- Профиль уровня пользователя (A2, PLAN_NEW_USER.md): две оси — «ухо»
-- (понимание на слух) и «словарь», у каждой уровень 0..1 и неопределённость
-- sigma. Считает клиент (src/shared/lib/level/), сюда только сохраняем,
-- чтобы уровень переживал смену устройства. Гость хранит то же в
-- localStorage (pithy_level_v1). Идемпотентно.

alter table public.user_profiles
  add column if not exists ear_level real,
  add column if not exists ear_sigma real,
  add column if not exists vocab_level real,
  add column if not exists vocab_sigma real;

-- Запись только в свою строку; значения зажимаются в 0..1, мусор (null) не пишется
create or replace function public.set_level_profile(
  p_ear real, p_ear_sigma real, p_vocab real, p_vocab_sigma real
) returns void
language sql
security definer
set search_path = public
as $$
  update public.user_profiles
     set ear_level = case when p_ear is null then ear_level else greatest(0, least(1, p_ear)) end,
         ear_sigma = case when p_ear_sigma is null then ear_sigma else greatest(0, least(1, p_ear_sigma)) end,
         vocab_level = case when p_vocab is null then vocab_level else greatest(0, least(1, p_vocab)) end,
         vocab_sigma = case when p_vocab_sigma is null then vocab_sigma else greatest(0, least(1, p_vocab_sigma)) end
   where id = auth.uid();
$$;

alter function public.set_level_profile(real, real, real, real) owner to postgres;

revoke all on function public.set_level_profile(real, real, real, real) from public, anon;
grant execute on function public.set_level_profile(real, real, real, real) to authenticated;
