-- Третий статус модуля: «превью» — виден в ленте (как опубликованный),
-- но без кнопки «Изучить фразу» (учить пока нельзя, только тизер).
-- published остаётся тем же флагом «виден в ленте»; preview_only имеет
-- смысл только когда published = true.
alter table if exists public.curricula
  add column if not exists preview_only boolean not null default false;
