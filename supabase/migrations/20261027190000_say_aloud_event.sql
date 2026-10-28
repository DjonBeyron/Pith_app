-- Событие журнала say_aloud_round — раунд мини-игры «Скажи вслух» закончен (props: words — слов задано,
-- hits — названо верно, ms — длительность раунда в мс; текста ответов нет). Без имени в белом
-- списке log_events тихо отбросит событие. Идемпотентна: повторный запуск ничего не меняет.
insert into public.app_event_names (name, note)
values ('say_aloud_round', 'раунд «Скажи вслух» закончен (words — задано, hits — верно, ms — длительность)')
on conflict (name) do nothing;
