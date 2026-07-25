-- Перевод названия модуля: полный перевод фразы + перевод каждого слова.
--
-- title_translation — полный перевод названия (в ленте раскрывается по
--   «раскрыть перевод ▾» под фразой).
-- word_translations — массив [{ "w": "слово", "t": "перевод" }, ...] в том же
--   порядке, в каком слова идут в названии (разбиение — splitTitleTokens в
--   src/shared/lib/titleWords.js, знаки препинания игнорируются). Клиент
--   сверяет слово по индексу, а если название поменяли — ищет по самому слову.
--
-- Идемпотентно: можно применять повторно.

alter table public.curricula
  add column if not exists title_translation text,
  add column if not exists word_translations jsonb not null default '[]'::jsonb;

comment on column public.curricula.title_translation is
  'Полный перевод названия модуля (раскрывается в ленте)';
comment on column public.curricula.word_translations is
  'Пословный перевод названия: [{"w":"слово","t":"перевод"}] в порядке слов';
