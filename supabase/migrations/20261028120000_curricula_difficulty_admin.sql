-- Сложность фразы, заданная админом вручную (1 легко / 2 средне / 3 сложно; null — не задана).
-- Нужна, пока у фразы меньше 5 голосов сложности (curricula.difficulty — медиана голосов, до порога
-- лента показывает «легко»): по ней строится «лесенка» второго визита (features/feed/ladder) и значок
-- сложности. Когда голосов 5 и больше, приложение берёт медиану голосов, а эта колонка не мешает.
-- Пишет админ по существующей политике на curricula. Идемпотентна.
alter table public.curricula
  add column if not exists difficulty_admin smallint check (difficulty_admin between 1 and 3);

comment on column public.curricula.difficulty_admin is
  'Сложность фразы от админа: 1 легко, 2 средне, 3 сложно; null — не задана. Действует, пока голосов сложности меньше 5 (при 5+ важнее медиана голосов curricula.difficulty).';
