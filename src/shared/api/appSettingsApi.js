import { supabase } from './supabase.js'
import { dbg } from '../lib/debug.js'
import { EMPTY_TEACHER } from '../lib/teacherResolve.js'

// Глобальные настройки приложения — таблица app_settings (ключ → jsonb).
// Пока используется один ключ: учитель по умолчанию для всех уроков.
const TEACHER_KEY = 'teacher_default'

let cache    = null // последнее прочитанное значение (живёт до перезагрузки)
let inflight = null // текущий запрос, чтобы три вызова не сделали три запроса

export function getCachedDefaultTeacher() {
  return cache
}

// { name, logo, crop }. Ошибку не бросает: без учителя плеер просто
// покажет заглушку «Учитель», урок из-за этого падать не должен.
export async function getDefaultTeacher() {
  if (cache) return cache
  if (inflight) return inflight
  dbg('[DB READ] app_settings', TEACHER_KEY)
  inflight = supabase
    .from('app_settings')
    .select('value')
    .eq('key', TEACHER_KEY)
    .maybeSingle()
    .then(({ data, error }) => {
      if (error) {
        dbg('[DB ERROR] app_settings read', error.message)
        return EMPTY_TEACHER
      }
      cache = { ...EMPTY_TEACHER, ...(data?.value ?? {}) }
      dbg('[DB OK] default teacher', cache.name || '(без имени)', cache.logo ? 'с лого' : 'без лого')
      return cache
    })
  const result = await inflight
  inflight = null
  return result
}

// Пишет только админ (RLS app_settings_write_admin). .select() обязателен:
// без него UPDATE, отсечённый политикой, выглядел бы как успех.
export async function saveDefaultTeacher({ name, logo, crop }) {
  const value = { name: name ?? '', logo: logo ?? null, crop: crop ?? null }
  dbg('[DB WRITE] app_settings', TEACHER_KEY, value.name)
  const { data, error } = await supabase
    .from('app_settings')
    .upsert({ key: TEACHER_KEY, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    .select('key')
  if (error) { dbg('[DB ERROR] app_settings save', error.message); throw error }
  if (!data?.length) {
    dbg('[DB WARN] app_settings save matched 0 rows — RLS или нет прав админа')
    throw new Error('Сохранение не применилось: сервер не подтвердил запись')
  }
  cache = value
  return value
}
