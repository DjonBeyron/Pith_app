-- Библиотека озвучки слов (PROJECT.md, «Озвучка слов»): одно английское слово
-- (или короткая фраза-чип) — один mp3 в R2. Живёт ОТДЕЛЬНО от файлов уроков
-- (files/lesson_files): уроки ничего о ней не знают, модули плеера в момент
-- тапа лишь спрашивают «есть ли слово», а канвас показывает, каких слов из
-- уроков в базе ещё нет. Ключ — нормализованное слово (wordKey.js:
-- нижний регистр, без знаков препинания по краям, только латиница).
create table if not exists public.word_audio (
  id         uuid primary key default gen_random_uuid(),
  lang       text not null default 'en',
  key        text not null,
  text       text not null,               -- как показывать в меню (первое написание из урока)
  url        text not null,               -- публичный URL mp3 в R2
  duration   real,                        -- секунды, для прогресс-индикации
  source     text not null default 'tts', -- 'tts' (ElevenLabs) | 'upload' (файл админа)
  voice_id   text,                        -- голос TTS на момент генерации
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lang, key)
);

alter table public.word_audio enable row level security;

-- Читают все (в т.ч. гость — урок озвучивает слова без входа), пишет админ
drop policy if exists word_audio_select_all on public.word_audio;
create policy word_audio_select_all on public.word_audio for select using (true);

drop policy if exists word_audio_write_admin on public.word_audio;
create policy word_audio_write_admin on public.word_audio to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant all on table public.word_audio to anon;
grant all on table public.word_audio to authenticated;
grant all on table public.word_audio to service_role;
