// «Дубль и зеркало»: раскладка слов по кускам фразы. Слово из записи (Vosk) или из озвучки диктора относится к куску, в который входит. Чистые функции, без DOM.
// Слова — { word, start, end }; внутри модуля везде миллисекунды (секунды Vosk переводит toMs). Сравнение слов — speechMatch.tokenize: «i'm» из Vosk и «i am» из словаря — одно и то же.
import { tokenize } from '../../../shared/lib/speech/speechMatch.js'

/** Слова текста в сравнимом виде (как в «Сказать фразу»: регистр, знаки, числа словами, сокращения раскрыты: «I'm» → ['i', 'am'], «I’m» то же) */
export const chunkTokens = text => tokenize(text)

/** Слова Vosk (секунды, от старта записи) → { word, start, end } в мс. unit: 's' (по умолчанию, как отдаёт Vosk) | 'ms' (уже в миллисекундах) */
export function toMs(words, unit = 's') {
  const k = unit === 'ms' ? 1 : 1000
  return (Array.isArray(words) ? words : [])
    .filter(w => w && Number.isFinite(Number(w.start)) && Number.isFinite(Number(w.end)))
    .map(w => ({ word: String(w.word ?? ''), start: Math.round(Number(w.start) * k), end: Math.round(Number(w.end) * k) }))
}

/**
 * Разложить слова (мс) по кускам. Слово занимает первый ещё не занятый такой же токен: сначала впереди текущей позиции (по порядку фразы), потом где угодно (тогда порядок нарушен).
 * Слово Vosk «[unk]» (звук был, слово не разобрано) не считается ни найденным, ни лишним. Возвращает
 * { byChunk: [слова куска], matched: [сколько токенов куска найдено], present: [кусок произнесён: найдена хотя бы половина токенов], extra: [лишние слова] }
 */
export function assignWords(words, chunks) {
  const slots = []
  chunks.forEach((c, ci) => chunkTokens(c).forEach(tok => slots.push({ ci, tok, used: false })))
  const byChunk = chunks.map(() => [])
  const matched = chunks.map(() => 0)
  const extra = []
  let ptr = 0
  for (const w of words) {
    if (/^\[unk\]$/i.test(String(w.word).trim())) continue
    const toks = chunkTokens(w.word)
    if (!toks.length) continue
    let home = -1
    for (const tok of toks) { // слово может раскрываться в несколько токенов («i'm» → i, am)
      let at = slots.findIndex((s, i) => i >= ptr && !s.used && s.tok === tok)
      if (at < 0) at = slots.findIndex(s => !s.used && s.tok === tok)
      if (at < 0) continue
      slots[at].used = true
      ptr = at + 1
      matched[slots[at].ci] += 1
      if (home < 0) home = slots[at].ci
    }
    if (home < 0) extra.push(String(w.word))
    else byChunk[home].push(w)
  }
  const present = chunks.map((c, i) => matched[i] >= Math.max(1, Math.ceil(chunkTokens(c).length / 2)))
  return { byChunk, matched, present, extra }
}

/** Где звучит кусок: { start, end } (мс) по найденным словам или null */
export function chunkSpan(ws) {
  if (!ws?.length) return null
  return { start: Math.min(...ws.map(w => w.start)), end: Math.max(...ws.map(w => w.end)) }
}
