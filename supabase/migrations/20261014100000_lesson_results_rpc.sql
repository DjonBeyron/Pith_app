-- Шаг 1 из 2 (закрытие lesson_results): RPC append_lesson_answers — единственный
-- путь дописать события анализа в answers своей строки. Клиент ходит через неё
-- вместо прямого update; само ужесточение прав — в 20261014110000_lesson_results_lockdown.sql.

create or replace function public.append_lesson_answers(p_lesson_id text, p_events jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_id    uuid;
  v_prev  jsonb;
  v_all   jsonb;
  v_total integer;
begin
  if v_uid is null then return -1; end if;
  if p_lesson_id is null or p_events is null or jsonb_typeof(p_events) <> 'array' then
    raise exception 'append_lesson_answers: ожидается массив событий';
  end if;
  if jsonb_array_length(p_events) = 0 then return 0; end if;
  if jsonb_array_length(p_events) > 2000 or octet_length(p_events::text) > 262144 then
    raise exception 'append_lesson_answers: слишком много данных';
  end if;
  if exists (select 1 from jsonb_array_elements(p_events) e where jsonb_typeof(e) <> 'object') then
    raise exception 'append_lesson_answers: событие должно быть объектом';
  end if;

  select id, case when jsonb_typeof(answers) = 'array' then answers else '[]'::jsonb end
    into v_id, v_prev
  from public.lesson_results
  where user_id = v_uid and lesson_id = p_lesson_id
  for update;
  if v_id is null then return -1; end if; -- строки нет: урок не зачтён

  -- последние 2000 событий, порядок сохраняется
  select coalesce(jsonb_agg(t.e order by t.ord), '[]'::jsonb) into v_all
  from (
    select e, ord from jsonb_array_elements(v_prev || p_events) with ordinality as x(e, ord)
    order by ord desc limit 2000
  ) t;

  if octet_length(v_all::text) > 262144 then
    raise exception 'append_lesson_answers: answers больше 256 КБ';
  end if;

  update public.lesson_results set answers = v_all where id = v_id;
  v_total := jsonb_array_length(v_all);
  return v_total;
end;
$$;

revoke all on function public.append_lesson_answers(text, jsonb) from public, anon;
grant execute on function public.append_lesson_answers(text, jsonb) to authenticated;
