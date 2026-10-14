-- Правила формирования урока: структурные поля для окна правил (название, группа, кто проверяет, серьёзность, примеры «нельзя / можно»).
-- Всё необязательное: старые строки остаются как есть (название берётся из начала текста правила).
-- Идемпотентно (add column if not exists + check через do-блок). Политик и функций не меняем.
alter table public.lesson_rules add column if not exists title text;
alter table public.lesson_rules add column if not exists rule_group text;
alter table public.lesson_rules add column if not exists checker text not null default 'manual';
alter table public.lesson_rules add column if not exists severity text not null default 'warn';
alter table public.lesson_rules add column if not exists bad_example text;
alter table public.lesson_rules add column if not exists good_example text;

do $m$
begin
  if not exists (select 1 from pg_constraint where conname = 'lesson_rules_checker_check') then
    alter table public.lesson_rules add constraint lesson_rules_checker_check check (checker in ('auto', 'judge', 'manual'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'lesson_rules_severity_check') then
    alter table public.lesson_rules add constraint lesson_rules_severity_check check (severity in ('error', 'warn'));
  end if;
end
$m$;
