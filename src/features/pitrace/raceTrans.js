// Голос русских переводов «Разгона» (CONCEPT_RACE.md, «Разгон»): перед выездом каждой пилюли Пит говорит перевод слова (русское слово, которое едет в пилюле), пилюля выезжает, когда он договорил.
// Озвучка — та же библиотека слов (таблица word_audio, lang en), но ключ записи особый: `ru:` + перевод (строчными, без пунктуации по краям). Латинский wordKey кириллицу не принимает (так решено), а сервер
// озвучивает русский тем же голосом Пита: tts-elevenlabs берёт модель eleven_multilingual_v2, язык определяется по тексту. Чистые функции без React.
import { cachedWordAudio } from '../../shared/lib/wordAudio/wordAudioApi.js'
import { cleanWordText } from '../../shared/lib/wordAudio/wordKey.js'
import { sprintWords, extrasOf } from './raceWords.js'
import { phraseMeanings } from './racePhraseData.js'

export const TRANS_PREFIX = 'ru:'

/** Ключ озвучки перевода в word_audio: `ru:перевод`; пусто — null */
export function transKey(text) {
  const clean = cleanWordText(text).toLowerCase()
  return clean ? `${TRANS_PREFIX}${clean}` : null
}

const uniqTexts = list => {
  const seen = new Set()
  return list.map(t => cleanWordText(t)).filter(t => { const k = transKey(t); if (!k || seen.has(k)) return false; seen.add(k); return true })
}

/** Все переводы плана: слова плана и extraWords (то, что может поехать в «Разгоне») и смыслы фраз этапа 2 (Пит говорит их по-русски, racePhraseData.js); для озвучки в админке */
export const transTexts = plan => uniqTexts([...[...(plan.words ?? []), ...extrasOf(plan)].map(w => w.translation).filter(Boolean), ...phraseMeanings(plan)])

/** Переводы слов «Разгона» по порядку выезда и смыслы фраз этапа 2 — их готовит прогрев игры к старту */
export const sprintTransTexts = plan => uniqTexts([...sprintWords(plan).map(w => w.translation).filter(Boolean), ...phraseMeanings(plan)])

/** Строка библиотеки с озвучкой перевода: { key, row } или null (нет озвучки / библиотека не загружена) */
export function transRow(text, cache = cachedWordAudio()) {
  const key = transKey(text)
  const row = key ? cache?.get(key) : null
  return row?.url ? { key, row } : null
}

/** Файлы озвучки переводов для прогрева: [{ key, url }] без повторов */
export function transItems(texts, cache = cachedWordAudio()) {
  const seen = new Set()
  return (texts ?? []).flatMap(t => { const r = transRow(t, cache); if (!r || seen.has(r.key)) return []; seen.add(r.key); return [{ key: r.key, url: r.row.url }] })
}

/** Строки для озвучки в админке (voiceMissingTexts): { text, key, has } по каждому переводу */
export const transRows = (texts, lib) => texts.map(text => { const key = transKey(text); return { text, key, has: !!lib?.get(key)?.url } })
