-- Глобальные настройки звука для всех пользователей (таблица app_settings,
-- схема не меняется; читают все, пишет админ — RLS уже есть, см.
-- 20260725120000_app_settings_teacher.sql):
--   ui_sound_volume — громкость звуков интерфейса: { "message-in": 0.5, ... },
--                     значения 0..1, нет ключа = 1;
--   eq_sensitivity  — чувствительность свечения-эквалайзера: { "value": 1 }
--                     (0.3 … 3, по умолчанию 1).
-- Клиент работает и без этих строк (чтение без строки → значения по умолчанию,
-- админу upsert создаёт строку сам) — миграция лишь заводит заготовки.

insert into public.app_settings (key, value)
values
  ('ui_sound_volume', '{}'::jsonb),
  ('eq_sensitivity',  '{"value":1}'::jsonb)
on conflict (key) do nothing;
