import { supabase } from './supabase.js'
import { dbg } from '../lib/debug.js'
import { normalizeConfig } from '../lib/ranking/feedConfig.js'

// Конфиг движка ленты в app_settings (jsonb):
//   feed_signals         — текущий конфиг (в белом списке app_settings_public_keys —
//                          клиент читает; пишет только админ, RLS app_settings_write_admin)
//   feed_signals_history — последние HISTORY_MAX конфигов (ПРИВАТНЫЙ ключ: читает/пишет
//                          только админ — клиенту история не нужна)
// Кэш/зеркало в localStorage и хук — в shared/lib/ranking/feedSignalsStore.js.
export const FEED_SIGNALS_KEY = 'feed_signals'
export const FEED_SIGNALS_HISTORY_KEY = 'feed_signals_history'
export const HISTORY_MAX = 20

// Сырой jsonb ключа: undefined — ошибка сети/RLS, null — строки нет
async function readRow(key) {
  dbg('[DB READ] app_settings', key)
  const { data, error } = await supabase.from('app_settings').select('value').eq('key', key).maybeSingle()
  if (error) { dbg(`[DB ERROR] ${key} read`, error.message); return undefined }
  return data?.value ?? null
}

// upsert с .select(): UPDATE, отсечённый RLS, иначе выглядел бы как успех
async function writeRow(key, value) {
  dbg('[DB WRITE] app_settings', key)
  const { data, error } = await supabase.from('app_settings')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    .select('key')
  if (error) { dbg(`[DB ERROR] ${key} save`, error.message); throw error }
  if (!data?.length) throw new Error('Сохранение не применилось: сервер не подтвердил запись')
}

// Нормализованный конфиг с сервера; null — не удалось прочитать (кэш не трогать);
// строки нет — DEFAULT (legacy)
export async function loadFeedSignals() {
  const raw = await readRow(FEED_SIGNALS_KEY)
  return raw === undefined ? null : normalizeConfig(raw)
}

export async function loadFeedSignalsHistory() {
  const raw = await readRow(FEED_SIGNALS_HISTORY_KEY)
  return Array.isArray(raw) ? raw.map(normalizeConfig) : []
}

// Только админ. Клиент штампует updatedAt/updatedBy; предыдущая версия уходит в историю
export async function saveFeedSignals(config, { updatedBy = null, note } = {}) {
  const next = normalizeConfig({ ...normalizeConfig(config), updatedAt: new Date().toISOString(), updatedBy, note: note ?? config?.note })
  const prev = await readRow(FEED_SIGNALS_KEY)
  await writeRow(FEED_SIGNALS_KEY, next)
  try {
    const history = await loadFeedSignalsHistory()
    const entry = prev ? normalizeConfig(prev) : null
    const list = [...(entry ? [entry] : []), ...history].slice(0, HISTORY_MAX)
    if (entry) await writeRow(FEED_SIGNALS_HISTORY_KEY, list)
  } catch (e) {
    dbg('[DB WARN] feed_signals_history не записана', e.message) // конфиг уже сохранён — не падаем
  }
  return next
}

// Откат: версия из истории по updatedAt сохраняется как новая (текущая уходит в историю)
export async function rollbackFeedSignals(updatedAt, { updatedBy = null } = {}) {
  const history = await loadFeedSignalsHistory()
  const entry = history.find(h => h.updatedAt === updatedAt)
  if (!entry) throw new Error('Версия не найдена в истории')
  return saveFeedSignals(entry, { updatedBy, note: `откат к версии ${updatedAt}` })
}
