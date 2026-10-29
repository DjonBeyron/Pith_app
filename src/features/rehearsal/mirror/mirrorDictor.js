// «Дубль и зеркало»: диктор из кусков библиотеки слов. У каждого куска — отдельный файл: известна длина голоса ms и тишина до голоса lead (wordLaneLib.makeLib). Целого файла фразы
// с таймингами слов пока нет (появится как phrase_audio) — тайминги синтезируются: куски идут один за другим через gapMs, слова внутри куска делят его длину по числу букв.
import { chunkTokens } from './mirrorAlign.js'

export const DEFAULT_GAP_MS = 80
// Кусок, которого нет в библиотеке (голос системы), и кусок без измеренной длины: оценка по буквам
const guessMs = chunk => 140 + 65 * chunkTokens(chunk).join('').length

/**
 * План диктора: { words: [{ word, start, end }], durationMs, leadMs, plays: [{ chunk, at }] }. Время слов — от начала ГОЛОСА первого куска (первое слово начинается в 0).
 * plays — когда включать файл куска (мс от включения первого файла): голос куска i должен начаться вовремя, поэтому файл включается на lead_i раньше. leadMs — через сколько мс после
 * включения первого файла зазвучит голос (на столько позже начала play() подсвечиваются слова).
 */
export function dictorPlan(chunks, chunkMs = [], gapMs = DEFAULT_GAP_MS) {
  const words = []
  const plays = []
  const lead0 = Math.max(0, Number(chunkMs[0]?.lead) || 0)
  let cursor = 0
  chunks.forEach((chunk, i) => {
    const ms = Number(chunkMs[i]?.ms) > 0 ? Math.round(Number(chunkMs[i].ms)) : guessMs(chunk)
    const lead = Math.max(0, Number(chunkMs[i]?.lead) || 0)
    plays.push({ chunk, at: Math.max(0, cursor + lead0 - lead) })
    const toks = String(chunk).split(/\s+/).filter(Boolean)
    const total = toks.reduce((s, t) => s + Math.max(1, t.length), 0)
    let t = cursor
    for (const tok of toks) {
      const part = Math.round((ms * Math.max(1, tok.length)) / total)
      words.push({ word: tok, start: t, end: t + part })
      t += part
    }
    if (toks.length) words[words.length - 1].end = cursor + ms // округление не должно сдвигать конец куска
    cursor += ms + gapMs
  })
  const durationMs = words.length ? words[words.length - 1].end : 0
  return { words, durationMs, leadMs: lead0, plays }
}

/** Слова диктора с таймингами (мс, от начала голоса) — только список слов из dictorPlan */
export const dictorWordsFromChunks = (chunks, chunkMs = [], gapMs = DEFAULT_GAP_MS) => dictorPlan(chunks, chunkMs, gapMs).words
