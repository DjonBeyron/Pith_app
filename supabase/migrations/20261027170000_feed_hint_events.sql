-- Событие журнала feed_word_tap — тап по слову фразы в ленте (props: module_id).
-- По нему подсказки ленты по поведению (features/feed/hints) понимают, что человек
-- уже пользуется переводом слов. Без имени в белом списке log_events тихо отбросит
-- событие. Идемпотентна: повторный запуск ничего не меняет.
insert into public.app_event_names (name, note)
values ('feed_word_tap', 'тап по слову фразы в ленте (module_id)')
on conflict (name) do nothing;
