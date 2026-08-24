-- Дедупликация загружаемых файлов: хэш содержимого (SHA-256, считается в
-- браузере перед загрузкой) позволяет узнать, что такой файл уже лежит в
-- R2, и переиспользовать существующий r2_url вместо повторной загрузки байт.
-- Колонка nullable — у старых файлов хэша нет, дедуп для них просто не
-- сработает (это не ошибка, а плавная деградация).
alter table public.files add column if not exists content_hash text;

create index if not exists files_content_hash_idx on public.files (content_hash);
