-- Игра «Встряхни память»: ключи app_settings, которые читает КЛИЕНТ игрока (не только админ), — в белый список app_settings_public_keys.
-- Без этого не-админ получает {} и слышит только черновики из кода: правки смыслов/ситуаций в админке, озвучка целых фраз и реплик Пита до него не доходят.
-- Идемпотентно: on conflict do nothing. Политика чтения — 20261014130000_app_settings_private_default.sql (app_settings_select_public).
insert into public.app_settings_public_keys (key, note) values
  ('race_phrase_ru',    'смысл фраз игры «Встряхни память» (круг 2 «Скажи»), правит админ'),
  ('race_phrase_scene', 'ситуация фраз игры «Встряхни память» (круг 1 «Пойми»), правит админ'),
  ('game2_phrases',     'озвучка целых фраз игры (word_audio phrase:<normText>)'),
  ('rotate_cat_lines',  'реплики Пита: текст и озвучка (таблица «Озвучка Пита»)')
on conflict (key) do nothing;
