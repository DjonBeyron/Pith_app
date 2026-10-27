-- События единой шторки вопросов Пита (PLAN_NEW_USER.md, этап A1; клиент — src/shared/lib/prompts/).
-- Белый список имён событий лежит в таблице app_event_names (миграция 20261014160000): имени нет в списке —
-- log_events тихо отбрасывает событие. Здесь добавляем три новых. Идемпотентно: повторный запуск ничего не меняет.
--   prompt_shown   { kind, id }                  — шторка выехала
--   prompt_answer  { kind, id, answer, ms }      — выбрал ответ
--   prompt_dismiss { kind, id, ms, later }       — закрыл/смахнул или «Спроси позже» (later = true)
insert into public.app_event_names (name, note) values
  ('prompt_shown',   'Вопросы Пита: шторка показана (kind, id)'),
  ('prompt_answer',  'Вопросы Пита: ответ на шторку (kind, id, answer, ms)'),
  ('prompt_dismiss', 'Вопросы Пита: закрыл/смахнул или «Спроси позже» (kind, id, ms, later)')
on conflict (name) do nothing;
