-- Игра «Встряхни память»: паузы сценария как настройки (CONCEPT_TIMELINE.md, «Шаг 2»). Строку app_settings с ключом
-- race_scene_pauses ({ v, pauses: { ключ: мс }, savedAt, by }) читает КЛИЕНТ КАЖДОГО ИГРОКА перед стартом игры
-- (src/shared/api/scenePausesApi.js) — ключ нужен в белом списке app_settings_public_keys. Без этой строки переопределения
-- видит только админ, остальные игроки получают «нет строки» и играют на значениях по умолчанию из кода.
-- Пишет по-прежнему только админ (политика app_settings_write_admin). Самой строки app_settings миграция не создаёт:
-- её запишет экран «Таймлайн игры», когда владелец применит первую настройку.
-- Идемпотентно: on conflict do nothing. Политика чтения — 20261014130000_app_settings_private_default.sql (app_settings_select_public).
insert into public.app_settings_public_keys (key, note) values
  ('race_scene_pauses', 'паузы сценария игры «Встряхни память» (настройки вместо констант), правит админ с экрана «Таймлайн игры»')
on conflict (key) do nothing;
