import { supabase } from './supabase.js'
import { dbg } from '../lib/debug.js'
import { EMPTY_TEACHER } from '../lib/teacherResolve.js'

// Глобальные настройки приложения — таблица app_settings (ключ → jsonb).
// Ключи: учитель по умолчанию для всех уроков, провайдер генерации фото и
// его дневная выработка (см. ImageProviderSettings.jsx).
const TEACHER_KEY = 'teacher_default'
const IMAGE_PROVIDER_KEY = 'image_provider'
const IMAGE_GEN_USAGE_KEY = 'image_gen_usage'

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

// Какой провайдер сейчас реально генерирует фото (см. generate-image/index.ts
// — секрет IMAGE_PROVIDER остаётся дефолтом, если строки ещё нет в базе).
export async function getImageProvider() {
  const { data, error } = await supabase
    .from('app_settings').select('value').eq('key', IMAGE_PROVIDER_KEY).maybeSingle()
  if (error) { dbg('[DB ERROR] image_provider read', error.message); return null }
  return data?.value?.provider ?? null
}

// Пишет только админ (та же политика app_settings_write_admin).
export async function saveImageProvider(provider) {
  const { error } = await supabase
    .from('app_settings')
    .upsert({ key: IMAGE_PROVIDER_KEY, value: { provider }, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  if (error) { dbg('[DB ERROR] image_provider save', error.message); throw error }
}

// Счётчик генераций через Cloudflare за сегодня (UTC) — свой подсчёт, не
// официальная квота (Cloudflare не отдаёт точный остаток бюджета через API).
// Пишет сама edge function generate-image после каждой удачной генерации.
export async function getImageGenUsage() {
  const { data, error } = await supabase
    .from('app_settings').select('value').eq('key', IMAGE_GEN_USAGE_KEY).maybeSingle()
  if (error) { dbg('[DB ERROR] image_gen_usage read', error.message); return null }
  const today = new Date().toISOString().slice(0, 10)
  return data?.value?.date === today ? data.value.count ?? 0 : 0
}
