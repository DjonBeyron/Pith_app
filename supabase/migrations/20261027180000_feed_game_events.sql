-- События журнала игр ленты (B4, «Выбери слово»): feed_game_shown — игра открылась
-- (props: game, word), feed_game_answer — ответ в игре (props: game, word, ok, ms).
-- Без имён в белом списке log_events тихо отбросит события. Идемпотентна: повторный запуск ничего не меняет.
insert into public.app_event_names (name, note)
values
  ('feed_game_shown', 'игра ленты открылась (game, word)'),
  ('feed_game_answer', 'ответ в игре ленты (game, word, ok, ms)')
on conflict (name) do nothing;
