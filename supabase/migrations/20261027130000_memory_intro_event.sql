-- Событие журнала memory_intro_open — первое открытие вкладки «Память»: Пит рассказывает,
-- что здесь живёт (props: voice — была ли озвучка, иначе только субтитры). Без имени в белом
-- списке log_events тихо отбросит событие. Идемпотентна: повторный запуск ничего не меняет.
insert into public.app_event_names (name, note)
values ('memory_intro_open', 'первое открытие «Памяти»: рассказ Пита (voice — была ли озвучка)')
on conflict (name) do nothing;
