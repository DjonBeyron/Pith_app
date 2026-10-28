-- «Разбор» как цикл оценки (PROJECT.md, 2026-10-22), шаги A и B.
-- A. lesson_review_marks — пометки админа прямо из плеера на телефоне (долгое нажатие по сообщению → тег + комментарий):
--    окно «Разбор» на ПК показывает их на нодах, искать заново не нужно.
-- B. lesson_examples — золотой набор: пары «до → после» и образцы «плохо» / «хорошо» из разбора и пометок; из него
--    потом собираются примеры для промпта автора и калибровка судьи, а не только прозаические правила.
-- Обе таблицы — админский инструмент: читает и пишет только админ (public.is_admin(), как lesson_rules). Идемпотентно.

create table if not exists public.lesson_review_marks (
  id         uuid        primary key default gen_random_uuid(),
  lesson_id  uuid,
  node_id    text        not null,
  node_seq   integer,
  node_type  text        not null default '',
  node_text  text        not null default '',
  tag        text        not null check (tag in ('robotic', 'boring', 'unclear', 'great')),
  comment    text        not null default '',
  device     text        not null default '',
  created_by uuid        default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists lesson_review_marks_lesson_idx on public.lesson_review_marks (lesson_id, created_at);
alter table public.lesson_review_marks enable row level security;
drop policy if exists lesson_review_marks_admin_all on public.lesson_review_marks;
create policy lesson_review_marks_admin_all
  on public.lesson_review_marks
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create table if not exists public.lesson_examples (
  id           uuid        primary key default gen_random_uuid(),
  lesson_id    uuid,
  lesson_title text        not null default '',
  node_ref     text        not null default '',
  node_seq     integer,
  node_type    text        not null default '',
  branch       text        not null default 'основная',
  kind         text        not null check (kind in ('pair', 'good', 'bad')),
  before_text  text        not null default '',
  after_text   text        not null default '',
  comments     jsonb       not null default '[]'::jsonb,
  tags         text[]      not null default '{}',
  rule_title   text        not null default '',
  source       text        not null default 'review',
  created_by   uuid        default auth.uid(),
  created_at   timestamptz not null default now()
);
create index if not exists lesson_examples_created_idx on public.lesson_examples (created_at);
alter table public.lesson_examples enable row level security;
drop policy if exists lesson_examples_admin_all on public.lesson_examples;
create policy lesson_examples_admin_all
  on public.lesson_examples
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
