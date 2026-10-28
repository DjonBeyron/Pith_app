import { supabase } from './supabase.js'
import { dbg } from '../lib/debug.js'

// Реплики кота-диктора игры «Повтори за диктором» (универсальные, для всех нод типа rotate_phone) — настройка app_settings, ключ rotate_cat_lines: { lines: { [id]: { text, url, duration, words } } }
// (формат и каталог — features/player/modules/rotate-phone/wordLaneCatLines.js). Читают все (RLS app_settings), пишет только админ. Новой таблицы и миграции не нужно.
const KEY = 'rotate_cat_lines'

let cache = null // raw-значение, прочитанное в этой сессии (null — не читали / нет строки)
let inflight = null

export function getCachedCatLines() { return cache }

/** Сырые настройки или null (нет строки / ошибка чтения — плеер тогда играет с текстами по умолчанию) */
export async function getCatLines() {
  if (cache) return cache
  if (inflight) return inflight
  dbg('[DB READ] app_settings', KEY)
  inflight = supabase.from('app_settings').select('value').eq('key', KEY).maybeSingle()
    .then(({ data, error }) => {
      if (error) { dbg('[DB ERROR] rotate_cat_lines read', error.message); return null }
      cache = data?.value ?? null
      return cache
    })
    .finally(() => { inflight = null })
  return inflight
}

// Пишет только админ (RLS app_settings_write_admin). .select() обязателен: без него UPDATE, отсечённый политикой, выглядел бы как успех.
export async function saveCatLines(value) {
  dbg('[DB WRITE] app_settings', KEY)
  const { data, error } = await supabase
    .from('app_settings')
    .upsert({ key: KEY, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    .select('key')
  if (error) { dbg('[DB ERROR] rotate_cat_lines save', error.message); throw error }
  if (!data?.length) {
    dbg('[DB WARN] rotate_cat_lines save matched 0 rows — RLS или нет прав админа')
    throw new Error('Сохранение не применилось: сервер не подтвердил запись')
  }
  cache = value
  return value
}
