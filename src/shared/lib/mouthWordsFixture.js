// Подставной ответ ElevenLabs для тестов рта (mouthWords.test.js, wordLaneVisemes, рот Мии): посимвольная разметка текста со знаками. Настоящий сервис не вызывается.
// Модель (по устройству ответа /with-timestamps: символы идут встык, без дыр; пауза после знака числится за самим знаком): буква — LETTER_S, пробел — SPACE_S, знак — своя пауза из SIGN_S.
// Сверено ли распределение пауз с настоящим ответом — НЕТ (сервис из сессии недоступен): если паузу ElevenLabs отдаёт пробелу, а не знаку, прежняя сборка слов уже была верной, а новая даёт то же самое.
export const LETTER_S = 0.07
export const SPACE_S = 0.02
export const SIGN_S = { '…': 0.6, '.': 0.5, '!': 0.3, '?': 0.4, ',': 0.2, ':': 0.3 }
export const DEMO_TTS = 'Не получается… Коробка тяжёлая. Помоги её приподнять!'
export const DEMO_TEXT = 'Не получается, коробка тяжёлая, помоги её приподнять'

/** Текст → { characters, character_start_times_seconds, character_end_times_seconds }; lead — тишина в начале файла (с) */
export function fakeAlignment(text, { lead = 0 } = {}) {
  const characters = [...text], starts = [], ends = []
  let at = lead
  for (const ch of characters) { const d = /\s/.test(ch) ? SPACE_S : SIGN_S[ch] ?? LETTER_S; starts.push(Math.round(at * 1000) / 1000); at += d; ends.push(Math.round(at * 1000) / 1000) }
  return { characters, character_start_times_seconds: starts, character_end_times_seconds: ends }
}

/** Прежняя сборка слов edge-функции (до v3.3.372): слово кончается на последнем символе куска — вместе со знаком и его паузой. Только для сравнения в тестах */
export function oldWordsFromAlignment({ characters, character_start_times_seconds: starts, character_end_times_seconds: ends }) {
  const r = v => Math.round(v * 100) / 100, out = []
  let word = '', from = 0, to = 0
  for (let i = 0; i < characters.length; i++) {
    const ch = characters[i]
    if (/\s/.test(ch)) { if (word) { out.push({ w: word, t: r(from), e: r(to) }); word = '' } continue }
    if (!word) from = starts[i]
    to = ends?.[i] ?? starts[i]
    word += ch
  }
  if (word) out.push({ w: word, t: r(from), e: r(to) })
  return out
}

/** Голос в момент t (с) по подставной разметке: звучит буква или цифра (знак и пробел — тишина) */
export function voicedAt(alignment, t) {
  const i = alignment.character_start_times_seconds.findIndex((s, k) => t >= s && t < alignment.character_end_times_seconds[k])
  return i >= 0 && /[\p{L}\p{N}]/u.test(alignment.characters[i])
}
