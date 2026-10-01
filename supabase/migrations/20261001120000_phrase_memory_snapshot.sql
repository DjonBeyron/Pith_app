-- Закреплённые фразы: снимок названия и слов (2026-10-01). Раздел «Фразы» во
-- вкладке «Память» показывает фразу и её слова, даже если сам урок-фраза
-- (модуль) потом убрали, скрыли или переделали, а закрепление осталось: без
-- снимка у такой записи было бы только id модуля. Снимок снимается в момент
-- закрепления (memory_consolidate_phrase) и для уже закреплённых фраз —
-- одноразово ниже. Запись о закреплении сама не удаляется и не меняется от
-- правок модуля: прогресс ученика — его.
-- Идемпотентно: колонки if not exists, функции or replace, заливка — только
-- пустых снимков.

alter table public.phrase_memory add column if not exists phrase_title text;
alter table public.phrase_memory add column if not exists phrase_words text[];

comment on column public.phrase_memory.phrase_title is
  'Снимок названия фразы (curricula.title) на момент закрепления — чтобы показать её, если модуль убрали';
comment on column public.phrase_memory.phrase_words is
  'Снимок слов фразы (ключи word_key, по порядку уроков-слов) на момент закрепления';

-- Слова модуля по порядку: ключи word_key уроков-слов между Стартом и Финалом,
-- без повторов. Пусто, если модуля или его уроков нет
create or replace function public.phrase_word_keys(p_module_id text) returns text[]
    language sql stable security definer
    set search_path = public
    as $$
  select coalesce(array_agg(w order by n), '{}'::text[])
  from (
    select distinct on (w) w, n
    from (
      select public.word_key(l.title) as w, x.n
      from public.curricula c
      cross join lateral jsonb_array_elements_text(
        case when jsonb_typeof(c.lesson_ids) = 'array' then c.lesson_ids else '[]'::jsonb end
      ) with ordinality as x(id, n)
      join public.lessons l on l.id = x.id
      where c.id = p_module_id
        and x.n > 1 and x.n < jsonb_array_length(c.lesson_ids)
    ) q
    where w is not null
    order by w, n
  ) u;
$$;

revoke all on function public.phrase_word_keys(text) from public, anon, authenticated;
grant execute on function public.phrase_word_keys(text) to service_role;

-- Уже закреплённые фразы: снимок из текущего модуля (пустые — только если модуль ещё есть)
update public.phrase_memory p
set phrase_title = c.title,
    phrase_words = public.phrase_word_keys(p.module_id)
from public.curricula c
where c.id = p.module_id and p.phrase_title is null;

-- То же, что в 20260925190000, плюс снимок при закреплении
create or replace function public.memory_consolidate_phrase(p_module_id text) returns jsonb
    language plpgsql security definer
    set search_path = public
    as $$
declare
  v_uid   uuid := auth.uid();
  v_ids   jsonb;
  v_title text;
  v_words text[];
  v_weak  int;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'auth');
  end if;
  select lesson_ids, title into v_ids, v_title from public.curricula where id = p_module_id;
  if v_ids is null or jsonb_typeof(v_ids) <> 'array' or jsonb_array_length(v_ids) <= 2 then
    return jsonb_build_object('ok', false, 'reason', 'module');
  end if;

  v_words := public.phrase_word_keys(p_module_id);
  if cardinality(v_words) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'no_words');
  end if;

  select count(*) into v_weak
  from unnest(v_words) w
  where not exists (
    select 1 from public.word_memory m where m.user_id = v_uid and m.word = w and m.step >= 3);
  if v_weak > 0 then
    return jsonb_build_object('ok', false, 'reason', 'not_ready', 'weak', v_weak);
  end if;

  insert into public.phrase_memory (user_id, module_id, phrase_title, phrase_words)
  values (v_uid, p_module_id, v_title, v_words)
  on conflict (user_id, module_id) do update
    set phrase_title = coalesce(public.phrase_memory.phrase_title, excluded.phrase_title),
        phrase_words = coalesce(public.phrase_memory.phrase_words, excluded.phrase_words);
  return jsonb_build_object('ok', true, 'module_id', p_module_id, 'words', cardinality(v_words));
end;
$$;

revoke all on function public.memory_consolidate_phrase(text) from public, anon;
grant execute on function public.memory_consolidate_phrase(text) to authenticated;
