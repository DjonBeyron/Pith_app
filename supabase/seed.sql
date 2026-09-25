-- ═══════════════════════════════════════════════════════════════════════
-- СИД ЛОКАЛЬНОГО СТЕКА (только `supabase start` / `supabase db reset`).
-- На боевой проект НЕ применяется: `supabase db push` сиды не трогает.
--
-- Что создаёт:
--   • три тест-аккаунта: e2e-user@pithy.local, e2e-admin@pithy.local
--     (is_admin = true) и e2e-guest@pithy.local (пустой — в него
--     guest-memory.spec.js переносит память гостя при входе). Пароль у всех —
--     e2e-local-password. Это не секрет: аккаунты живут только в локальной
--     базе в контейнере/CI.
--   • тест-модуль «E2E-ТЕСТ» (тот же id, что в e2e/config.js):
--     Старт (текст) → Урок (текст + «выбери слово»: верно✓ | неверно) → Финал.
--   • черновой модуль «I'm trying to cook · E2E-КОЛОДЫ» для колод повтора:
--     слова trying (без колоды) и cook (1 карточка); cook — в памяти
--     повторения e2e-админа (созрело сегодня)
--   • модуль «Keep going · E2E-ОБУЧЕНИЕ» (опубликован): слово keep — в памяти
--     повторения e2e-user (вкладка «Моё обучение»)
--   • модуль «E2E-МЕДИА»: Старт с голосовым, фото и «выбери фото» — файлы
--     со статики dev-сервера (http://localhost:5299/...)
-- ═══════════════════════════════════════════════════════════════════════

-- ── Тест-аккаунты ───────────────────────────────────────────────────────
-- Профили создаёт триггер on_auth_user_created (миграция 20260925120000)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated',
       u.email, extensions.crypt('e2e-local-password', extensions.gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}', jsonb_build_object('name', u.name),
       now(), now(), '', '', '', ''
from (values
  ('e2e00000-0000-4000-8000-000000000001'::uuid, 'e2e-user@pithy.local',  'e2e-user'),
  ('e2e00000-0000-4000-8000-000000000002'::uuid, 'e2e-admin@pithy.local', 'e2e-admin'),
  ('e2e00000-0000-4000-8000-000000000003'::uuid, 'e2e-guest@pithy.local', 'e2e-guest')
) as u(id, email, name)
on conflict (id) do nothing;

insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text, 'email',
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       now(), now(), now()
from auth.users u
where u.email in ('e2e-user@pithy.local', 'e2e-admin@pithy.local', 'e2e-guest@pithy.local')
on conflict do nothing;

update public.user_profiles set is_admin = true
where id = 'e2e00000-0000-4000-8000-000000000002';

-- ── Тест-модуль «E2E-ТЕСТ» ──────────────────────────────────────────────
insert into public.lessons (id, title, published, sort_order, script) values
('e2e0a000-0000-4000-8000-00000000000a', 'Старт', true, 0, $json${"nodes": [
  {"id": "e2e-s1", "seq": 1, "x": 0, "y": 0, "size": "max", "type": "text",
   "typeData": {"text": {"content": "Привет! Это тестовый Старт.", "hardWrap": false}},
   "triggers": [{"id": "e2e-s1t", "if": "timer", "ms": 2000, "then": null}]}
]}$json$),
('e2e0a000-0000-4000-8000-00000000000b', 'Урок', true, 1, $json${"nodes": [
  {"id": "e2e-l1", "seq": 1, "x": 0, "y": 0, "size": "max", "type": "text",
   "typeData": {"text": {"content": "Выбери правильный вариант.", "hardWrap": false}},
   "triggers": [{"id": "e2e-l1t", "if": "timer", "ms": 2000, "then": "e2e-l2"}]},
  {"id": "e2e-l2", "seq": 2, "x": 370, "y": 0, "size": "max", "type": "word_choice",
   "typeData": {"word_choice": {
     "options": [{"id": "e2e-opt-ok", "text": "верно", "isCorrect": true},
                 {"id": "e2e-opt-bad", "text": "неверно"}],
     "responseCorrect": "", "responseWrong": ""}},
   "triggers": [{"id": "e2e-l2ok", "if": "word_correct", "then": "e2e-l3"},
                {"id": "e2e-l2bad", "if": "word_wrong", "then": null}]},
  {"id": "e2e-l3", "seq": 3, "x": 740, "y": 0, "size": "max", "type": "text",
   "typeData": {"text": {"content": "Отлично!", "hardWrap": false}},
   "triggers": [{"id": "e2e-l3t", "if": "timer", "ms": 2000, "then": null}]}
]}$json$),
('e2e0a000-0000-4000-8000-00000000000c', 'Финал', true, 2, $json${"nodes": [
  {"id": "e2e-f1", "seq": 1, "x": 0, "y": 0, "size": "max", "type": "text",
   "typeData": {"text": {"content": "Тестовый Финал.", "hardWrap": false}},
   "triggers": [{"id": "e2e-f1t", "if": "timer", "ms": 2000, "then": null}]}
]}$json$)
on conflict (id) do nothing;

insert into public.curricula (id, title, published, lesson_ids) values
('0f906879-117a-43e7-8c1d-d4e0f2ee1012', 'E2E-ТЕСТ', true,
 '["e2e0a000-0000-4000-8000-00000000000a", "e2e0a000-0000-4000-8000-00000000000b", "e2e0a000-0000-4000-8000-00000000000c"]')
on conflict (id) do nothing;

-- ── Модуль «E2E-КОЛОДЫ» (черновик — в ленту не попадает) ───────────────
-- Для админ-теста колод повтора: слово trying без колоды, cook — с одной
-- карточкой (меньше минимума 3): фото (файл «E2E-МЕДИА» ниже, ссылка прямо в
-- ноде — как после injectR2Urls) → «выбери слово». Названия латиницей —
-- иначе урок не слово
insert into public.lessons (id, title, published, sort_order, script) values
('e2e0b000-0000-4000-8000-00000000000a', 'Старт', true, 0, '{"nodes": []}'),
('e2e0b000-0000-4000-8000-00000000000b', 'trying', true, 1, $json${"nodes": [
  {"id": "e2e-t1", "seq": 1, "x": 0, "y": 0, "size": "max", "type": "text",
   "typeData": {"text": {"content": "I'm ... to cook", "hardWrap": false}},
   "triggers": [{"id": "e2e-t1t", "if": "timer", "ms": 2000, "then": "e2e-t2"}]},
  {"id": "e2e-t2", "seq": 2, "x": 370, "y": 0, "size": "max", "type": "word_choice",
   "typeData": {"word_choice": {
     "options": [{"id": "e2e-t-ok", "text": "trying", "isCorrect": true}, {"id": "e2e-t-bad", "text": "try"}],
     "responseCorrect": "", "responseWrong": ""}},
   "triggers": [{"id": "e2e-t2ok", "if": "word_correct", "then": null},
                {"id": "e2e-t2bad", "if": "word_wrong", "then": null}]}
]}$json$),
('e2e0b000-0000-4000-8000-00000000000c', 'cook', true, 2, $json${"nodes": [], "reviewCards": [
  {"id": "e2e-card-cook-1", "nodes": [
    {"id": "e2e-c0", "seq": 1, "x": 0, "y": 0, "size": "max", "type": "photo",
     "typeData": {"photo": {"caption": "Что он делает?", "file_id": "e2e0f000-0000-4000-8000-000000000003",
                            "r2Url": "http://localhost:5299/icons/icon-512.png"}},
     "triggers": [{"id": "e2e-c0t", "if": "timer", "ms": 800, "then": "e2e-c1"}]},
    {"id": "e2e-c1", "seq": 2, "x": 370, "y": 0, "size": "max", "type": "word_choice",
     "typeData": {"word_choice": {
       "options": [{"id": "e2e-c-ok", "text": "cook", "isCorrect": true}, {"id": "e2e-c-bad", "text": "cake"}],
       "responseCorrect": "", "responseWrong": ""}},
     "triggers": [{"id": "e2e-c1ok", "if": "word_correct", "then": null},
                  {"id": "e2e-c1bad", "if": "word_wrong", "then": null}]}
  ]}
]}$json$),
('e2e0b000-0000-4000-8000-00000000000d', 'Финал', true, 3, '{"nodes": []}')
on conflict (id) do nothing;

insert into public.curricula (id, title, published, lesson_ids) values
('e2e0b000-0000-4000-8000-0000000000ff', 'I''m trying to cook · E2E-КОЛОДЫ', false,
 '["e2e0b000-0000-4000-8000-00000000000a", "e2e0b000-0000-4000-8000-00000000000b", "e2e0b000-0000-4000-8000-00000000000c", "e2e0b000-0000-4000-8000-00000000000d"]')
on conflict (id) do nothing;

-- Память повторения e2e-админа: слово cook созрело (e2e/admin-review.spec.js).
-- Фраза спойлер-заголовка — название модуля выше, в нём есть cook. Урок cook
-- зачтён (как будто пройден) — мостик «Продолжить фразу» в итоге покажет
-- модуль пройденным на 25 %. Память — ДО зачёта: иначе триггер занесения
-- поставил бы cook на завтра
insert into public.word_memory (user_id, word, step, due_on)
values ('e2e00000-0000-4000-8000-000000000002', 'cook', 1, current_date)
on conflict (user_id, word) do nothing;
insert into public.lesson_results (user_id, lesson_id, xp_awarded)
values ('e2e00000-0000-4000-8000-000000000002', 'e2e0b000-0000-4000-8000-00000000000c', true)
on conflict (user_id, lesson_id) do nothing;

-- ── Модуль «Keep going · E2E-ОБУЧЕНИЕ» (опубликован) ────────────────────
-- Вкладка «Моё обучение» ОБЫЧНОГО пользователя (e2e/user.spec.js): слово keep
-- в его памяти (созрело сегодня, урок зачтён), у keep колода из одной
-- карточки, у going колоды нет. Отдельно от cook админа: e2e-файлы идут
-- параллельно, общая память давала бы гонку
insert into public.lessons (id, title, published, sort_order, script) values
('e2e0d000-0000-4000-8000-00000000000a', 'Старт', true, 0, '{"nodes": []}'),
('e2e0d000-0000-4000-8000-00000000000b', 'keep', true, 1, $json${"nodes": [
  {"id": "e2e-kl1", "seq": 1, "x": 0, "y": 0, "size": "max", "type": "word_choice",
   "typeData": {"word_choice": {
     "options": [{"id": "e2e-kl-ok", "text": "keep", "isCorrect": true}, {"id": "e2e-kl-bad", "text": "kept"}],
     "responseCorrect": "", "responseWrong": ""}},
   "triggers": [{"id": "e2e-kl1ok", "if": "word_correct", "then": null},
                {"id": "e2e-kl1bad", "if": "word_wrong", "then": null}]}
], "reviewCards": [
  {"id": "e2e-card-keep-1", "nodes": [
    {"id": "e2e-k1", "seq": 1, "x": 0, "y": 0, "size": "max", "type": "word_choice",
     "typeData": {"word_choice": {
       "options": [{"id": "e2e-k-ok", "text": "keep", "isCorrect": true}, {"id": "e2e-k-bad", "text": "kept"}],
       "responseCorrect": "", "responseWrong": ""}},
     "triggers": [{"id": "e2e-k1ok", "if": "word_correct", "then": null},
                  {"id": "e2e-k1bad", "if": "word_wrong", "then": null}]}
  ]}
]}$json$),
('e2e0d000-0000-4000-8000-00000000000c', 'going', true, 2, '{"nodes": []}'),
('e2e0d000-0000-4000-8000-00000000000d', 'Финал', true, 3, '{"nodes": []}')
on conflict (id) do nothing;

insert into public.curricula (id, title, published, lesson_ids) values
('e2e0d000-0000-4000-8000-0000000000ff', 'Keep going · E2E-ОБУЧЕНИЕ', true,
 '["e2e0d000-0000-4000-8000-00000000000a", "e2e0d000-0000-4000-8000-00000000000b", "e2e0d000-0000-4000-8000-00000000000c", "e2e0d000-0000-4000-8000-00000000000d"]')
on conflict (id) do nothing;

insert into public.word_memory (user_id, word, step, due_on)
values ('e2e00000-0000-4000-8000-000000000001', 'keep', 1, current_date)
on conflict (user_id, word) do nothing;
insert into public.lesson_results (user_id, lesson_id, xp_awarded)
values ('e2e00000-0000-4000-8000-000000000001', 'e2e0d000-0000-4000-8000-00000000000b', true)
on conflict (user_id, lesson_id) do nothing;

-- ── Модуль «E2E-МЕДИА» (опубликован) ───────────────────────────────────
-- Старт с медиа — гоняет прогрев (скачивание и разбор голосового, фото),
-- «мгновенные» ноды и ответ «выбери фото». Файлы — статика самого
-- dev-сервера локального прогона (scripts/e2e-local.sh → порт 5299), R2 не нужен
insert into public.files (id, file_name, size_bytes, content_type, r2_url) values
('e2e0f000-0000-4000-8000-000000000001', 'message-in.mp3', 9405,  'audio/mpeg', 'http://localhost:5299/sounds/message-in.mp3'),
('e2e0f000-0000-4000-8000-000000000002', 'icon-192.png',   7025,  'image/png',  'http://localhost:5299/icons/icon-192.png'),
('e2e0f000-0000-4000-8000-000000000003', 'icon-512.png',   19151, 'image/png',  'http://localhost:5299/icons/icon-512.png')
on conflict (id) do nothing;

insert into public.lessons (id, title, published, sort_order, script) values
('e2e0c000-0000-4000-8000-00000000000a', 'Старт', true, 0, $json${"nodes": [
  {"id": "e2e-m1", "seq": 1, "x": 0, "y": 0, "size": "max", "type": "text",
   "typeData": {"text": {"content": "Медиа-тест", "hardWrap": false}},
   "triggers": [{"id": "e2e-m1t", "if": "timer", "ms": 1000, "then": "e2e-m2"}]},
  {"id": "e2e-m2", "seq": 2, "x": 370, "y": 0, "size": "max", "type": "audio",
   "typeData": {"audio": {"text": "Hello", "file_id": "e2e0f000-0000-4000-8000-000000000001"}},
   "triggers": [{"id": "e2e-m2t", "if": "timer", "ms": 1500, "then": "e2e-m3"}]},
  {"id": "e2e-m3", "seq": 3, "x": 740, "y": 0, "size": "max", "type": "photo",
   "typeData": {"photo": {"caption": "Картинка", "file_id": "e2e0f000-0000-4000-8000-000000000002"}},
   "triggers": [{"id": "e2e-m3t", "if": "timer", "ms": 1000, "then": "e2e-m4"}]},
  {"id": "e2e-m4", "seq": 4, "x": 1110, "y": 0, "size": "max", "type": "photo_choice",
   "typeData": {"photo_choice": {
     "photos": [{"id": "e2e-ph-ok", "fileId": "e2e0f000-0000-4000-8000-000000000002", "label": "верно"},
                {"id": "e2e-ph-bad", "fileId": "e2e0f000-0000-4000-8000-000000000003", "label": "неверно"}],
     "correctIndexes": [0], "responseCorrect": "", "responseWrong": ""}},
   "triggers": [{"id": "e2e-m4ok", "if": "photo_correct", "then": "e2e-m5"},
                {"id": "e2e-m4bad", "if": "photo_wrong", "then": null}]},
  {"id": "e2e-m5", "seq": 5, "x": 1480, "y": 0, "size": "max", "type": "text",
   "typeData": {"text": {"content": "Готово", "hardWrap": false}},
   "triggers": [{"id": "e2e-m5t", "if": "timer", "ms": 1000, "then": null}]}
]}$json$),
('e2e0c000-0000-4000-8000-00000000000b', 'Урок', true, 1, '{"nodes": []}'),
('e2e0c000-0000-4000-8000-00000000000c', 'Финал', true, 2, '{"nodes": []}')
on conflict (id) do nothing;

insert into public.curricula (id, title, published, lesson_ids) values
('e2e0c000-0000-4000-8000-0000000000ff', 'E2E-МЕДИА', true,
 '["e2e0c000-0000-4000-8000-00000000000a", "e2e0c000-0000-4000-8000-00000000000b", "e2e0c000-0000-4000-8000-00000000000c"]')
on conflict (id) do nothing;
