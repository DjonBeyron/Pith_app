import { supabase } from '../../shared/api/supabase.js'
import { dbg } from '../../shared/lib/debug.js'
import { generateSpeech } from '../../shared/lib/ttsApi.js'
import { uploadToR2 } from '../../shared/lib/r2.js'
import { probeAudioDuration } from '../../shared/lib/audioUtils.js'
import { normText } from '../player/modules/rotate-phone/wordLaneRecipe.js'

// Озвучка ЦЕЛОЙ фразы «Мини-игры 2.0» с таймингами слов. Путь тот же, что у реплик Пита (rehearsalVoice.js): ElevenLabs (edge-функция tts-elevenlabs) → файл в R2 → запись в настройки приложения.
// Хранилище — своя строка app_settings «game2_phrases» { [rh2_phrase:<normText фразы>]: { text, url, duration, words } }, а не rotate_cat_lines: запись реплик (saveCatLines) перезаписывает ту строку целиком
// и отбрасывает чужие ключи, озвучка фразы пропадала бы при каждом «Озвучить реплики». Читают все (RLS app_settings), пишет админ. Формат words — как у реплик: [{ w, t, e }] в секундах.
const KEY = 'game2_phrases'

/** Ключ фразы в хранилище: rh2_phrase:<слова без знаков в нижнем регистре> */
export const phraseKey = text => `rh2_phrase:${normText(text)}`

let cache = null
/** Сырое значение настройки (карта фраз) или {} (нет строки / ошибка чтения — стенд работает на оценке таймингов) */
export async function getPhrases(force = false) {
  if (cache && !force) return cache
  dbg('[DB READ] app_settings', KEY)
  const { data, error } = await supabase.from('app_settings').select('value').eq('key', KEY).maybeSingle()
  if (error) { dbg('[DB ERROR] game2_phrases read', error.message); return {} }
  cache = data?.value && typeof data.value === 'object' ? data.value : {}
  return cache
}

/** Записать карту фраз целиком (только админ; .select() — чтобы отсечённый политикой UPDATE не выглядел успехом) */
export async function savePhrases(value) {
  dbg('[DB WRITE] app_settings', KEY)
  const { data, error } = await supabase.from('app_settings').upsert({ key: KEY, value, updated_at: new Date().toISOString() }, { onConflict: 'key' }).select('key')
  if (error) throw error
  if (!data?.length) throw new Error('Сохранение не применилось: сервер не подтвердил запись (нужны права админа)')
  cache = value
  return value
}

/** Запись фразы → то, что читает игра: { url, duration, words } или null (нет файла) */
export function phraseEntry(map, text) {
  const e = map?.[phraseKey(text)]
  if (!e || typeof e.url !== 'string' || !e.url) return null
  return { url: e.url, duration: Number(e.duration) > 0 ? Number(e.duration) : null, words: Array.isArray(e.words) ? e.words : [] }
}

/** Что качать при прогреве: озвучка фразы в формате [{ key, url }] (адреса фразы нет в каталоге реплик, wordsPlan её не знает) */
export const phraseItem = phrase => (phrase?.url ? [{ key: 'rh2_phrase', url: phrase.url }] : [])

/** Озвучить фразу и записать в хранилище. Зависимости подставляются в тестах. → запись { url, duration, words } */
export async function voicePhrase(text, { speak = generateSpeech, upload = uploadToR2, probe = probeAudioDuration, load = getPhrases, save = savePhrases } = {}) {
  const { file, wordTimings } = await speak(text)
  const blob = URL.createObjectURL(file)
  const [url, duration] = await Promise.all([upload(file), probe(blob)]).finally(() => URL.revokeObjectURL(blob))
  const words = wordTimings?.length ? wordTimings : []
  const map = { ...(await load(true)), [phraseKey(text)]: { text, url, duration, words } }
  await save(map)
  return { url, duration, words }
}
