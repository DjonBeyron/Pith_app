-- Шаг 2 из 2: закрываем прямую запись в lesson_results. Раньше политика results_own
-- (ALL) позволяла выставить себе stars/xp_awarded и этим занести слово в память.
-- Теперь клиент только читает свои строки; пишут SECURITY DEFINER RPC
-- (complete_lesson, save_lesson_stars, reset_lesson_progress, append_lesson_answers) и триггеры.
-- Применять ТОЛЬКО после выкладки клиента, который ходит через append_lesson_answers.

do $$
begin
  if to_regprocedure('public.append_lesson_answers(text,jsonb)') is null then
    raise exception 'Сначала примените 20261014100000_lesson_results_rpc.sql';
  end if;
end $$;

alter table public.lesson_results enable row level security;

drop policy if exists "results_own" on public.lesson_results;
drop policy if exists "results_select_own" on public.lesson_results;
create policy "results_select_own" on public.lesson_results
  for select to authenticated using (auth.uid() = user_id);

revoke all on table public.lesson_results from anon, authenticated;
grant select on table public.lesson_results to authenticated;
grant all on table public.lesson_results to service_role;

-- Страховка данных: звёзды только 0..3 (NOT VALID — не падаем на старых строках)
alter table public.lesson_results drop constraint if exists lesson_results_stars_check;
alter table public.lesson_results add constraint lesson_results_stars_check
  check (stars between 0 and 3) not valid;
