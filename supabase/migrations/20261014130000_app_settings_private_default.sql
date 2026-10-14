-- app_settings: чтение «по умолчанию приватно». Раньше select был открыт всем (включая
-- гостей) для ВСЕХ ключей — служебные (image_provider, image_gen_usage) и любые будущие
-- (feed_signals и т.п.) утекали любому посетителю. Теперь гость/пользователь видит только
-- ключи из таблицы app_settings_public_keys (админ пополняет её без миграции), админ — всё.
-- Edge function generate-image ходит с JWT админа → is_admin() = true, не затронута.

create table if not exists public.app_settings_public_keys (
  key        text primary key,
  note       text,
  created_at timestamptz not null default now()
);

comment on table public.app_settings_public_keys is
  'Белый список ключей app_settings, которые читает обычный клиент (гость и пользователь). Ключа нет здесь = видит только админ.';

alter table public.app_settings_public_keys enable row level security;

drop policy if exists app_settings_public_keys_select_all on public.app_settings_public_keys;
create policy app_settings_public_keys_select_all
  on public.app_settings_public_keys for select using (true);

drop policy if exists app_settings_public_keys_insert_admin on public.app_settings_public_keys;
create policy app_settings_public_keys_insert_admin
  on public.app_settings_public_keys for insert to authenticated with check (public.is_admin());

drop policy if exists app_settings_public_keys_update_admin on public.app_settings_public_keys;
create policy app_settings_public_keys_update_admin
  on public.app_settings_public_keys for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists app_settings_public_keys_delete_admin on public.app_settings_public_keys;
create policy app_settings_public_keys_delete_admin
  on public.app_settings_public_keys for delete to authenticated using (public.is_admin());

revoke all on table public.app_settings_public_keys from anon, authenticated;
grant select on table public.app_settings_public_keys to anon, authenticated;
grant insert, update, delete on table public.app_settings_public_keys to authenticated;
grant all on table public.app_settings_public_keys to service_role;

-- Ключи, которые сейчас читает обычный клиент (сверено с src/shared/api/appSettingsApi.js,
-- audioSettingsApi.js, globalBoolSetting.js, prefetch в ShellV2.jsx) + будущий feed_signals.
insert into public.app_settings_public_keys (key, note) values
  ('teacher_default',       'учитель по умолчанию — шапка плеера, гость тоже'),
  ('player_debug_ui',       'флаг «лог и версия в шапке урока» для не-админов'),
  ('audio_static_waveform', 'заморозка спектра голосовых'),
  ('ui_sound_volume',       'громкость звуков интерфейса'),
  ('eq_sensitivity',        'чувствительность свечения эквалайзера'),
  ('word_choice_voice',     'озвучка верного ответа в «Выбери слово»'),
  ('feed_signals',          'веса сигналов ленты (будущий ключ, клиент читает)')
on conflict (key) do nothing;

-- Политика чтения: админ — всё, остальные — только публичные ключи.
drop policy if exists app_settings_select_all on public.app_settings;
drop policy if exists app_settings_select_public on public.app_settings;
create policy app_settings_select_public
  on public.app_settings for select
  using (
    exists (select 1 from public.app_settings_public_keys k where k.key = app_settings.key)
    or public.is_admin()
  );

-- Политика записи не меняется (app_settings_write_admin). Гранты на таблицу — явно,
-- чтобы не зависеть от default privileges: читать могут все (RLS режет), писать
-- authenticated (RLS → админ); у гостя запись отзываем совсем.
revoke insert, update, delete on table public.app_settings from anon;
grant select on table public.app_settings to anon, authenticated;
grant insert, update, delete on table public.app_settings to authenticated;
grant all on table public.app_settings to service_role;
