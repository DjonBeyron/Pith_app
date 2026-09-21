import { supabase } from '../../api/supabase.js'
import { dbg } from '../debug.js'
import { uploadToR2, deleteFromR2 } from '../r2.js'

// Библиотека озвучки слов — таблица word_audio (миграция
// 20260920120000_word_audio.sql). Читают все (гость тоже — урок озвучивает
// слова без входа), пишет админ. Ключ записи — wordKey(text), см. wordKey.js.
//
// Кэш на сессию: список маленький (сотни строк) и нужен синхронно — бейдж
// «не озвучено» в канвасе и проверка «есть ли слово» при тапе в уроке не
// должны ждать сеть. Подписчики (subscribeWordAudio) перерисовываются после
// каждой записи/удаления.

const LANG = 'en'

let cache = null           // Map key → row | null — ещё не спрашивали
let pending = null         // текущий запрос списка — не дублируем
const listeners = new Set()

function notify() { listeners.forEach(fn => fn(cache)) }

export function subscribeWordAudio(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function cachedWordAudio() {
  return cache
}

export async function listWordAudio(force = false) {
  if (cache && !force) return cache
  if (pending) return pending
  pending = supabase.from('word_audio').select('*').eq('lang', LANG)
    .then(({ data, error }) => {
      pending = null
      if (error) { dbg('[DB ERROR] word_audio list', error.message); return cache ?? new Map() }
      cache = new Map((data ?? []).map(r => [r.key, r]))
      notify()
      return cache
    })
  return pending
}

// Есть ли озвучка слова — по кэшу, синхронно (null-кэш = «не знаем» → false)
export function hasWordAudio(key) {
  return !!cache?.get(key)
}

// Записать/заменить озвучку: blob (mp3 из TTS или файл админа) → R2 → строка
// в базе (upsert по lang+key). Старый файл замещённой записи удаляется из R2
export async function saveWordAudio({ key, text, blob, duration = null, source = 'tts', voiceId = null }) {
  const prev = cache?.get(key) ?? null
  const file = new File([blob], `word-${key.replace(/[^a-z0-9]+/g, '_')}.mp3`, { type: blob.type || 'audio/mpeg' })
  const url = await uploadToR2(file)
  const { data: { session } } = await supabase.auth.getSession()
  const row = {
    lang: LANG, key, text, url, duration, source, voice_id: voiceId,
    created_by: session?.user?.id ?? null, updated_at: new Date().toISOString(),
  }
  const { data, error } = await supabase.from('word_audio')
    .upsert(row, { onConflict: 'lang,key' }).select().single()
  if (error) {
    dbg('[DB ERROR] word_audio upsert', key, error.message)
    deleteFromR2(url).catch(() => {})
    throw new Error(error.message)
  }
  if (prev?.url && prev.url !== url) deleteFromR2(prev.url).catch(e => dbg('[R2] old word audio not deleted', e.message))
  cache = new Map(cache ?? [])
  cache.set(key, data)
  notify()
  return data
}

export async function deleteWordAudio(key) {
  const prev = cache?.get(key) ?? null
  const { error } = await supabase.from('word_audio').delete().eq('lang', LANG).eq('key', key)
  if (error) { dbg('[DB ERROR] word_audio delete', key, error.message); throw new Error(error.message) }
  if (prev?.url) deleteFromR2(prev.url).catch(e => dbg('[R2] word audio not deleted', e.message))
  if (cache) { cache = new Map(cache); cache.delete(key); notify() }
}

// Каких ключей из wanted (Map key → text, см. collectLessonWords) в базе нет
export function missingWordAudio(wanted, lib = cache) {
  const out = new Map()
  for (const [key, text] of wanted) if (!lib?.get(key)) out.set(key, text)
  return out
}
