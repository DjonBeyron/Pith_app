-- ═══════════════════════════════════════════════════════════════════════
-- СИД ЛОКАЛЬНОГО СТЕКА (только `supabase start` / `supabase db reset`).
-- На боевой проект НЕ применяется: `supabase db push` сиды не трогает.
--
-- Что создаёт:
--   • два тест-аккаунта: e2e-user@pithy.local и e2e-admin@pithy.local
--     (is_admin = true). Пароль у обоих — e2e-local-password. Это не
--     секрет: аккаунты живут только в локальной базе в контейнере/CI.
--   • тест-модуль «E2E-ТЕСТ» (тот же id, что в e2e/config.js):
--     Старт (текст) → Урок (текст + «выбери слово»: верно✓ | неверно) → Финал.
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
  ('e2e00000-0000-4000-8000-000000000002'::uuid, 'e2e-admin@pithy.local', 'e2e-admin')
) as u(id, email, name)
on conflict (id) do nothing;

insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text, 'email',
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       now(), now(), now()
from auth.users u
where u.email in ('e2e-user@pithy.local', 'e2e-admin@pithy.local')
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
