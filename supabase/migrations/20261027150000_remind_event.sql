-- Событие журнала remind_time_set — пользователь ответил на «Когда тебе удобно учиться?»
-- (props: preset — '9' | '14' | '20' | 'custom' | 'none'; push — ветка уведомлений:
-- 'ask' | 'add_home' | 'granted' | 'denied' | 'guest'). Без имени в белом списке log_events
-- тихо отбросит событие. Идемпотентна: повторный запуск ничего не меняет.
insert into public.app_event_names (name, note)
values ('remind_time_set', 'выбор времени напоминания «Когда удобно учиться?» (preset, push)')
on conflict (name) do nothing;
