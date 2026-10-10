// Поля ноды «Сказать фразу» (say_phrase): чтение и нормализация в одном месте — плеер, редактор, линтер и сборщик
// слов для озвучки видят одни и те же значения по умолчанию (в т.ч. подсказки в чат: hintsOn, hintSilence, hintMismatch, hintPartial). Старое поле showPhrase (фраза пузырём в чате) убрано: в данных
// ноды оно может встретиться — его просто никто не читает. Чистые функции, без React.
import { tokenize } from './speechMatch.js'
import { HINT_DEFAULTS } from './sayTexts.js'

export const THRESHOLD_MIN = 50
export const THRESHOLD_MAX = 100
export const THRESHOLD_DEFAULT = 70
export const SAY_LANGS = ['en-US', 'en-GB']
export const LANG_DEFAULT = 'en-US'
export const MAX_KEYWORDS = 8

/** «through, please» → ['through','please']; запятая, точка с запятой, перенос строки; без пустых и повторов */
export function parseKeywords(value) {
  const list = Array.isArray(value) ? value : String(value ?? '').split(/[,;\n]/)
  const out = []
  for (const raw of list) {
    const k = String(raw ?? '').trim()
    if (k && !out.some(o => o.toLowerCase() === k.toLowerCase())) out.push(k)
  }
  return out.slice(0, MAX_KEYWORDS)
}

/** Порог в процентах → число 50..100 (мусор и пустое → 70) */
export function clampThreshold(value) {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n) || value === '' || value == null) return THRESHOLD_DEFAULT
  return Math.min(THRESHOLD_MAX, Math.max(THRESHOLD_MIN, n))
}

/** Ключевые слова, которых нет среди слов эталона: распознать их нельзя, проверка их молча пропустит — автору полезно знать */
export function keywordsMissingInPhrase(phrase, keywords) {
  const words = new Set(tokenize(phrase))
  return parseKeywords(keywords).filter(k => { const t = tokenize(k); return !t.length || t.some(w => !words.has(w)) })
}

/** Текст подсказки из ноды: пустое/нет поля → стандартный текст (sayTexts.js) */
const hintText = (value, kind) => (typeof value === 'string' && value.trim() ? value.trim() : HINT_DEFAULTS[kind])

/** data = node.typeData.say_phrase (в плеере/редакторе) или data ноды в обменном JSON — то же самое */
export function readSayData(data) {
  const d = data ?? {}
  const strict = d.strict === true // «Строго»: все слова, ни одной опечатки, консенсус interim+final; у новых нод включено в редакторе, отсутствие поля = выключено
  const threshold = strict ? THRESHOLD_MAX : clampThreshold(d.threshold)
  return {
    phrase: String(d.phrase ?? '').trim(),
    translation: String(d.translation ?? '').trim(),
    keywords: parseKeywords(d.keywords),
    threshold,
    passRatio: threshold / 100,
    lang: SAY_LANGS.includes(d.lang) ? d.lang : LANG_DEFAULT,
    listenAudio: d.listenAudio !== false, // по умолчанию включено; false — отключить
    strict,
    voiceReply: d.voiceReply === true, // «голосовое с текстом»: реплика ученика в чате ещё и голосовым (если речь распознаёт Vosk); нет поля = только текст
    // Подсказки в чат после неудачной попытки: hintsOn отсутствует = включены; пустой текст = стандартный (sayHints.js)
    hintsOn: d.hintsOn !== false,
    hintSilence: hintText(d.hintSilence, 'silence'),
    hintMismatch: hintText(d.hintMismatch, 'mismatch'),
    hintPartial: hintText(d.hintPartial, 'partial'),
  }
}
