import { supabase } from './supabase.js'
import { dbg } from '../lib/debug.js'

// Глобальные настройки звука для ВСЕХ пользователей — таблица app_settings
// (ключ → jsonb), см. audioSettings.js:
//  - ui_sound_volume: { "message-in": 0.5, ... } — громкость звуков интерфейса
//    0..1 (нет ключа = 1);
//  - eq_sensitivity: { "value": 1 } — чувствительность свечения-эквалайзера.
export const UI_SOUND_VOLUME_KEY = 'ui_sound_volume'
export const EQ_SENSITIVITY_KEY = 'eq_sensitivity'

// Один запрос на оба ключа. { volumes, eq } — null у ключа без строки (тогда
// действуют значения по умолчанию); весь результат null — запрос не удался
// (зеркало в localStorage при этом не трогаем)
export async function getAudioSettingsRows() {
  dbg('[DB READ] app_settings', UI_SOUND_VOLUME_KEY, EQ_SENSITIVITY_KEY)
  const { data, error } = await supabase
    .from('app_settings')
    .select('key, value')
    .in('key', [UI_SOUND_VOLUME_KEY, EQ_SENSITIVITY_KEY])
  if (error) { dbg('[DB ERROR] audio settings read', error.message); return null }
  const byKey = Object.fromEntries((data ?? []).map(r => [r.key, r.value]))
  return { volumes: byKey[UI_SOUND_VOLUME_KEY] ?? null, eq: byKey[EQ_SENSITIVITY_KEY] ?? null }
}

// Пишет только админ (RLS app_settings_write_admin). .select() обязателен:
// без него UPDATE, отсечённый политикой, выглядел бы как успех.
export async function saveAudioSettingRow(key, value) {
  dbg('[DB WRITE] app_settings', key)
  const { data, error } = await supabase
    .from('app_settings')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    .select('key')
  if (error) { dbg('[DB ERROR] app_settings save', key, error.message); throw error }
  if (!data?.length) {
    dbg('[DB WARN] app_settings save matched 0 rows — RLS или нет прав админа', key)
    throw new Error('Сохранение не применилось: сервер не подтвердил запись')
  }
}
