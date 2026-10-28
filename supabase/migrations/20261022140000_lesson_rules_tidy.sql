-- Порядок в правилах (PROJECT.md, 2026-10-22, шаг C): 179 правил слиты в ~95 принципов + 8 пунктов чек-листа + 9 справок по модулям.
-- Сами тексты в базу кладёт кнопка «Синхронизировать со стандартом» в окне правил (по названиям, см. rulesSync.js) — здесь только то,
-- что нужно для этого в схеме:
-- 1) category 'reference' — справка, как устроен модуль (судье не идёт, в бюджет правил не входит);
-- 2) lesson_rules_history — снимок всего набора перед каждой синхронизацией (откат руками / сравнение), только админ.
-- Идемпотентно.

alter table public.lesson_rules drop constraint if exists lesson_rules_category_check;
alter table public.lesson_rules add constraint lesson_rules_category_check check (category in ('principle', 'checklist', 'reference'));

create table if not exists public.lesson_rules_history (
  id         uuid        primary key default gen_random_uuid(),
  reason     text        not null default '',
  count      integer     not null default 0,
  rules      jsonb       not null default '[]'::jsonb,
  created_by uuid        default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.lesson_rules_history enable row level security;
drop policy if exists lesson_rules_history_admin_all on public.lesson_rules_history;
create policy lesson_rules_history_admin_all
  on public.lesson_rules_history
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
