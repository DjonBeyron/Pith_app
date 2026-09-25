-- ═══════════════════════════════════════════════════════════════════════
-- Триггер «новый пользователь → строка в user_profiles»
-- Baseline снят дампом только схемы public, а сам триггер висит на
-- auth.users — поэтому в миграции он не попал. На боевом проекте он есть
-- (создан ещё из supabase_schema.sql), а чистая база, собранная из
-- миграций (локальный стек `supabase start`, e2e), без него не создаёт
-- профиль при регистрации — ломается всё, что читает user_profiles.
--
-- Идемпотентно: на проде пересоздаёт тот же триггер (функция
-- handle_new_user уже в baseline, вставка с on conflict do nothing —
-- повторный вызов безвреден).
-- ═══════════════════════════════════════════════════════════════════════

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
