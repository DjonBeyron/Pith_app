-- Закрепление фразы (этап 7 системы повторения, 2026-09-25). PROJECT.md →
-- «Вкладки»: все слова фразы на шаге ≥ 3 → в повторение приходит сама фраза
-- (видео + «собери фразу») → собрал — фраза закреплена, золотая в карте;
-- «Знаю N слов · M фраз закреплено» в профиле считает именно их.
--
-- Фраза = модуль (curricula), её слова — уроки-слова модуля (как у триггера
-- памяти: is_word_lesson + word_key). Сервер проверяет готовность (все слова
-- в памяти на шаге ≥ 3), саму сборку фразы — клиент.

create table if not exists public.phrase_memory (
  user_id         uuid not null references auth.users(id) on delete cascade,
  module_id       text not null references public.curricula(id) on delete cascade,
  consolidated_at timestamptz not null default now(),
  primary key (user_id, module_id)
);

comment on table public.phrase_memory is
  'Закреплённые фразы: пользователь собрал фразу модуля, когда все её слова были на шаге ≥ 3. Пишет только memory_consolidate_phrase.';

alter table public.phrase_memory enable row level security;
drop policy if exists phrase_memory_select_own on public.phrase_memory;
create policy phrase_memory_select_own on public.phrase_memory
  for select to authenticated using (user_id = auth.uid());
revoke all on table public.phrase_memory from anon, authenticated;
grant select on table public.phrase_memory to authenticated;
grant all on table public.phrase_memory to service_role;

create or replace function public.memory_consolidate_phrase(p_module_id text) returns jsonb
    language plpgsql security definer
    set search_path = public
    as $$
declare
  v_uid   uuid := auth.uid();
  v_ids   jsonb;
  v_words text[];
  v_weak  int;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'auth');
  end if;
  select lesson_ids into v_ids from public.curricula where id = p_module_id;
  if v_ids is null or jsonb_typeof(v_ids) <> 'array' or jsonb_array_length(v_ids) <= 2 then
    return jsonb_build_object('ok', false, 'reason', 'module');
  end if;

  select array_agg(distinct public.word_key(l.title)) into v_words
  from jsonb_array_elements_text(v_ids) with ordinality as x(id, n)
  join public.lessons l on l.id = x.id
  where x.n > 1 and x.n < jsonb_array_length(v_ids) and public.word_key(l.title) is not null;
  if v_words is null then
    return jsonb_build_object('ok', false, 'reason', 'no_words');
  end if;

  select count(*) into v_weak
  from unnest(v_words) w
  where not exists (
    select 1 from public.word_memory m where m.user_id = v_uid and m.word = w and m.step >= 3);
  if v_weak > 0 then
    return jsonb_build_object('ok', false, 'reason', 'not_ready', 'weak', v_weak);
  end if;

  insert into public.phrase_memory (user_id, module_id) values (v_uid, p_module_id)
  on conflict (user_id, module_id) do nothing;
  return jsonb_build_object('ok', true, 'module_id', p_module_id, 'words', cardinality(v_words));
end;
$$;

revoke all on function public.memory_consolidate_phrase(text) from public, anon;
grant execute on function public.memory_consolidate_phrase(text) to authenticated;
