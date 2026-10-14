-- Конструктор сцен, этап 2: таблица scenes — библиотека сцен «два кота говорят»
-- (формат v2, src/features/scene/v2/sceneSchemaV2.js). Пишет только админ из
-- сборщика (admin/scenes); читают: админ — всё, гость и пользователь — только
-- опубликованные (status = 'published') — их позже подхватят лента и нода урока.
-- Ограничения: JSON сцены ≤ 64 КБ, внутри version = 2 (число), статус из двух
-- значений. updated_at обновляет общий триггер set_updated_at() из baseline.

create table if not exists public.scenes (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  scene      jsonb not null,
  status     text not null default 'draft',
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.scenes is
  'Сцены конструктора «два кота говорят» (формат v2). draft — видит админ; published — видят все клиенты.';

-- Ограничения добавляем идемпотентно (у alter table нет "if not exists" для constraint)
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'scenes_status_check') then
    alter table public.scenes add constraint scenes_status_check
      check (status in ('draft', 'published'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'scenes_title_check') then
    alter table public.scenes add constraint scenes_title_check
      check (length(btrim(title)) between 1 and 80);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'scenes_scene_size_check') then
    alter table public.scenes add constraint scenes_scene_size_check
      check (pg_column_size(scene) <= 65536);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'scenes_scene_version_check') then
    -- version должна быть JSON-числом 2 (строка "2", другое число или отсутствие поля не пройдут;
    -- coalesce — иначе NULL от отсутствующего поля прошёл бы CHECK)
    alter table public.scenes add constraint scenes_scene_version_check
      check (jsonb_typeof(scene) = 'object' and coalesce(scene->'version' = '2'::jsonb, false));
  end if;
end $$;

create index if not exists scenes_status_updated_idx on public.scenes (status, updated_at desc);

-- updated_at при update — общий триггер из baseline (set_updated_at)
create or replace function public.set_updated_at() returns trigger
  language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists scenes_updated_at on public.scenes;
create trigger scenes_updated_at before update on public.scenes
  for each row execute function public.set_updated_at();

alter table public.scenes enable row level security;

drop policy if exists scenes_select_published_or_admin on public.scenes;
create policy scenes_select_published_or_admin
  on public.scenes for select
  using (status = 'published' or public.is_admin());

drop policy if exists scenes_insert_admin on public.scenes;
create policy scenes_insert_admin
  on public.scenes for insert to authenticated
  with check (public.is_admin());

drop policy if exists scenes_update_admin on public.scenes;
create policy scenes_update_admin
  on public.scenes for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists scenes_delete_admin on public.scenes;
create policy scenes_delete_admin
  on public.scenes for delete to authenticated
  using (public.is_admin());

-- Гранты явно, не полагаясь на default privileges: читать могут все (RLS режет
-- черновики), писать — только authenticated (RLS → админ), гостю запись отозвана
revoke all on table public.scenes from anon, authenticated;
grant select on table public.scenes to anon, authenticated;
grant insert, update, delete on table public.scenes to authenticated;
grant all on table public.scenes to service_role;
