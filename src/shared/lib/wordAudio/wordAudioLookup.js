import { wordKey } from './wordKey.js'

// Синхронный поиск озвучки слова для подстановки в сцены (sceneWordSegments.js) — без сети и без supabase,
// чтобы чистая логика сцен и её тесты не тянули клиент базы. Источник (кэш word_audio) регистрирует
// wordAudioEnsure.js через setWordAudioSource; в тестах и «просто показать» передают карту прямо в опциях.
//
// Лукап принимает: функцию key → строка | null, Map key → строка, объект { key: строка }; строка — запись word_audio
// ({ url, duration, voice_id… }) либо просто url.

let source = null

export function setWordAudioSource(fn) { source = typeof fn === 'function' ? fn : null }
export const hasWordAudioSource = () => source !== null

// Любой допустимый вид → функция key → запись | null; undefined — «источник по умолчанию»; null — «без озвучки»
export function toLookup(wordAudio) {
  if (wordAudio === undefined) return source
  if (!wordAudio) return null
  if (typeof wordAudio === 'function') return wordAudio
  if (wordAudio instanceof Map) return key => wordAudio.get(key) ?? null
  if (typeof wordAudio === 'object') return key => wordAudio[key] ?? null
  return null
}

// Запись озвучки слова ({ url, duration? }) или null: ключ — wordKey(text), кириллица и прочее без озвучки
export function lookupWordAudio(text, wordAudio) {
  const look = toLookup(wordAudio)
  const key = wordKey(text)
  if (!look || !key) return null
  const row = look(key)
  const url = typeof row === 'string' ? row : row?.url
  if (typeof url !== 'string' || !url) return null
  const duration = typeof row === 'object' && Number.isFinite(row.duration) && row.duration > 0 ? row.duration : null
  return { url, duration, voiceId: typeof row === 'object' ? row.voice_id ?? null : null }
}
