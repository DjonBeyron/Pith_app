-- Шаблоны таблиц конструктора — заготовки сетки, которые админ сохраняет
-- один раз и применяет в ЛЮБОМ уроке. Раньше жили в localStorage браузера:
-- шаблон был виден только на той машине, где его сохранили, и пропадал
-- вместе с чисткой кэша. Теперь общие для всех админов и всех уроков.
--
-- data — та же структура, что и table в ноде урока:
--   { rowCount, colCount, columns[], rows[], cells[{id,row,col,rowspan,colspan,
--     value, fontSize?, isHeader?, options?}] }
-- В частности сюда входит options — наполнение выпадающего меню ячейки,
-- поэтому оно переезжает вместе с шаблоном в другой урок.

create table if not exists public.table_templates (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null,
  data       jsonb       not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists table_templates_created_at_idx
  on public.table_templates (created_at);

alter table public.table_templates enable row level security;

-- Конструктор таблиц — админский инструмент: и читает, и пишет только админ
-- (та же проверка, что у app_settings/races/push_templates).
drop policy if exists table_templates_admin_all on public.table_templates;
create policy table_templates_admin_all
  on public.table_templates
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
