import { supabase } from '../../api/supabase.js'
import { dbg } from '../debug.js'
import { cachedWordAudio, subscribeWordAudio } from './wordAudioApi.js'
import { wordKey } from './wordKey.js'
import { setWordAudioSource } from './wordAudioLookup.js'

// Прогрев библиотеки озвучки слов перед показом сцены-шаблона: ensureWordAudio(texts) одним запросом `in (…)`
// подтягивает только нужные ключи (а не весь список, как listWordAudio() в админке) и кладёт их в отдельный кэш
// на сессию. Подстановка слов в сцене (sceneWordSegments → wordAudioLookup) читает его СИНХРОННО через wordAudioRow:
// сначала полный кэш админки (wordAudioApi), потом этот. Слова, которых в базе нет, повторно спрашиваем не чаще
// раза в MISS_TTL_MS (озвучили в админке — подтянется). Ошибка сети/RLS не бросает: слово остаётся без аудио
// (реплика уйдёт на синтез устройства). Импорт модуля регистрирует кэш как источник по умолчанию.

export const MISS_TTL_MS = 30_000
const LANG = 'en'

const partial = new Map() // key → строка word_audio
const missed = new Map()  // key → время, когда базы не оказалось слова

export function wordAudioRow(key) {
  return cachedWordAudio()?.get(key) ?? partial.get(key) ?? null
}
setWordAudioSource(wordAudioRow)
subscribeWordAudio(() => { missed.clear() }) // админ записал/удалил слово — спрашиваем заново

export const resetWordAudioEnsure = () => { partial.clear(); missed.clear() }

// texts — слова/фразы ('cheese', 'ice cream'); → true, если в кэше появилась озвучка, которой не было. Без сети — false
export async function ensureWordAudio(texts, { client = supabase, now = Date.now } = {}) {
  const keys = [...new Set((texts ?? []).map(wordKey).filter(Boolean))]
  const need = keys.filter(k => !wordAudioRow(k) && !(missed.has(k) && now() - missed.get(k) < MISS_TTL_MS))
  if (!need.length) return false
  try {
    const { data, error } = await client.from('word_audio').select('*').eq('lang', LANG).in('key', need)
    if (error) { dbg('[DB ERROR] word_audio ensure', error.message); return false }
    const got = new Set()
    for (const r of data ?? []) { partial.set(r.key, r); got.add(r.key) }
    for (const k of need) if (!got.has(k)) missed.set(k, now())
    return got.size > 0
  } catch (e) {
    dbg('[DB ERROR] word_audio ensure', e?.message)
    return false
  }
}
