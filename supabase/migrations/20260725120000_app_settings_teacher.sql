-- Глобальные настройки приложения (ключ → jsonb).
-- Первый потребитель — «учитель по умолчанию» (ключ teacher_default):
-- имя + аватар, общие для всех уроков. Урок может переопределить их
-- своими (script.teacherMode = 'custom'), см. src/shared/lib/teacherResolve.js.

create table if not exists public.app_settings (
  key        text primary key,
  value      jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

-- Читают все, включая гостей: учитель показывается в шапке плеера,
-- а уроки доступны без входа.
drop policy if exists app_settings_select_all on public.app_settings;
create policy app_settings_select_all
  on public.app_settings
  for select
  using (true);

-- Пишет только админ (та же проверка, что у races/push_templates).
drop policy if exists app_settings_write_admin on public.app_settings;
create policy app_settings_write_admin
  on public.app_settings
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Пустая заготовка, чтобы админка сразу показывала форму, а не «нет строки».
-- value: { "name": "Анна", "logo": "https://.../logo.png", "crop": {"x":0,"y":0,"scale":1} }
insert into public.app_settings (key, value)
values ('teacher_default', '{"name": "", "logo": null, "crop": null}'::jsonb)
on conflict (key) do nothing;
