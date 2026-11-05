// «Мини-игра 2.0», этап 1: лента времени (CONCEPT_GAME2.md). План ленты — чистая функция: слова фразы + тайминги озвучки → пилюли с моментами (мс по часам ленты).
// Часы ленты: 0 — момент запуска режима; первое слово звучит через LEAD_IN_MS (подводка), пилюля доезжает до линии «сейчас» ровно в начале своего слова и проходит её, пока слово звучит (startMs…endMs).
// Тайминги — озвучка фразы (ElevenLabs: [{ w, t, e }] в секундах от начала файла); нет озвучки или слова не сошлись — оценка по длинам слов (estimated: true), лента всё равно работает.
import { wordsOfChunk } from '../rehearsal/rehearsalPlan.js'
import { isStopWord } from '../rehearsal/rehearsalStopWords.js'
import { normText } from '../player/modules/rotate-phone/wordLaneRecipe.js'

export const LEAD_IN_MS = 1500 // подводка: от запуска ленты до первого слова
export const WORD_BASE_S = 0.13 // оценка длины слова: основа + за каждую букву
export const WORD_LETTER_S = 0.06
export const WORD_GAP_S = 0.07
export const LEAD_FILE_S = 0.08 // оценка: тишина в начале файла

const LETTER = /\p{L}|\p{N}/u

/** Слова фразы плана по порядку (куски «I'm | trying | to learn» → ["I'm", 'trying', 'to', 'learn']) */
export const phraseWords = plan => (plan?.chunks ?? []).flatMap(wordsOfChunk)

/** Текст фразы для озвучки и подписи: куски через пробел */
export const phraseText = plan => phraseWords(plan).join(' ')

/** Для каждого слова фразы: «к повтору» ли оно (слово плана с due; сравнение по normText) */
export function dueFlags(words, plan) {
  const due = new Set((plan?.words ?? []).filter(w => w.due).map(w => normText(w.text)))
  return words.map(w => due.has(normText(w)))
}

/** Оценка таймингов по длинам слов: [{ w, t, e }] в секундах; total — длина файла (с): оценка растягивается на неё, иначе берётся как есть */
export function estimateTimings(words, total = null) {
  let at = LEAD_FILE_S
  const raw = words.map(w => {
    const t = at
    const e = t + WORD_BASE_S + WORD_LETTER_S * String(w).replace(/[^\p{L}\p{N}]/gu, '').length
    at = e + WORD_GAP_S
    return { w, t, e }
  })
  const span = raw.at(-1)?.e ?? 0
  const k = total > 0 && span > LEAD_FILE_S ? Math.max(0.2, (total - 0.1 - LEAD_FILE_S) / (span - LEAD_FILE_S)) : 1
  return raw.map(x => ({ w: x.w, t: LEAD_FILE_S + (x.t - LEAD_FILE_S) * k, e: LEAD_FILE_S + (x.e - LEAD_FILE_S) * k }))
}

/** Тайминги озвучки → по слову фразы, если слов столько же (знаки без букв отбрасываются) и времена — числа; иначе null. Времена приводятся к порядку: t не убывает, e ≥ t */
export function usableTimings(voiceWords, words) {
  const ws = (Array.isArray(voiceWords) ? voiceWords : []).filter(x => LETTER.test(String(x?.w ?? 'a')))
  if (!words.length || ws.length !== words.length || !ws.every(x => Number.isFinite(Number(x.t)))) return null
  let prev = 0
  return ws.map((x, i) => {
    const t = Math.max(prev, Number(x.t))
    const e = Number.isFinite(Number(x.e)) && Number(x.e) > t ? Number(x.e) : t + 0.3
    prev = t
    return { w: words[i], t, e }
  })
}

/** Фраза + озвучка (phrase: { url, duration, words } или null) → { timings, estimated, durationS }: настоящие тайминги, а нет их — оценка (с длиной файла, если озвучка есть) */
export function timingsOf(words, phrase) {
  const real = phrase?.url ? usableTimings(phrase.words, words) : null
  if (real) return { timings: real, estimated: false, durationS: Number(phrase.duration) > 0 ? Number(phrase.duration) : real.at(-1).e + 0.3 }
  const total = phrase?.url && Number(phrase.duration) > 0 ? Number(phrase.duration) : null
  const timings = estimateTimings(words, total)
  return { timings, estimated: true, durationS: total ?? (timings.at(-1)?.e ?? 0) + 0.3 }
}

/**
 * План ленты: { pills, voiceAtMs, voiceMs, endMs }. pills[i] = { i, text, startMs, endMs, due, small } — моменты от запуска ленты; small — служебное слово (рисуется мельче).
 * rate — скорость режима «Скорость» (×1,2: тайминги сжимаются, голос играется с playbackRate = rate). voiceAtMs — когда включать озвучку (первое слово файла встаёт на LEAD_IN_MS), voiceMs — её длина при rate.
 */
export function buildTimeline({ words, due = [], timings, durationS = 0, rate = 1, lead = LEAD_IN_MS }) {
  const k = 1000 / (rate > 0 ? rate : 1)
  const t0 = (timings[0]?.t ?? 0) * k
  const start = Math.max(lead, t0) // голос не может начаться раньше нуля ленты: подводка растёт, если в файле длинная тишина
  const pills = words.map((text, i) => {
    const t = timings[i] ?? { t: 0, e: 0.3 }
    return { i, text, startMs: Math.round(start + t.t * k - t0), endMs: Math.round(start + t.e * k - t0), due: !!due[i], small: isStopWord(text) }
  })
  return { pills, voiceAtMs: Math.round(start - t0), voiceMs: Math.round(durationS * k), endMs: pills.at(-1)?.endMs ?? start }
}

/** Какие пилюли показывает режим: all — все, due — только «к повтору» (остальные — пустые промежутки), none — лента пустая */
export function visiblePills(timeline, show) {
  if (show === 'none') return []
  return show === 'due' ? timeline.pills.filter(p => p.due) : timeline.pills
}
