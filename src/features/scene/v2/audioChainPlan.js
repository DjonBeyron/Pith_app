import { validTimings, syntheticTimings, timingsEnd } from './mouthRhythm.js'
import { fallbackMs } from './linePlayback.js'
import { hasLetters } from './sceneVarsSegments.js'

// План цепочки озвучки реплики-шаблона (чистая логика, без аудио). Реплика с segments играется цепочкой
// «часть → слово → часть», если у КАЖДОЙ озвучиваемой части есть audioUrl (части без букв — «?», «.» — пропускаются).
// Нет файла хотя бы у одной (слово не озвучено в библиотеке) — plan.ok=false, реплика целиком уходит на запасной синтез.
//
// Раскладка во времени: у каждой части обрезаем тишину по wordTimings — начинаем за LEAD_PAD до первого слова и
// передаём эстафету через TAIL_PAD после последнего (части ElevenLabs имеют 50–200 мс тишины по краям). Части без
// таймингов и слова библиотеки (flag word, их тайминги равномерные 0…duration) не обрезаем: играют до конца файла.
// Общая длительность = сумма отрезков; общие тайминги слов — со смещением на накопленное время (рот, печать).

export const LEAD_PAD = 0.03
export const TAIL_PAD = 0.03

export function planSegmentChain(line) {
  const segs = Array.isArray(line?.segments) ? line.segments : null
  if (!segs?.length) return { ok: false, reason: 'no-segments', parts: [] }
  const parts = []
  for (const s of segs) {
    if (!s || typeof s !== 'object' || s.var !== undefined) return { ok: false, reason: 'unfilled-var', parts: [] }
    const text = typeof s.text === 'string' ? s.text.trim() : ''
    if (!hasLetters(text)) continue
    if (!s.audioUrl || typeof s.audioUrl !== 'string') return { ok: false, reason: s.word ? 'word-no-audio' : 'part-no-audio', missing: text, parts: [] }
    const ms = s.audioMeta?.durationMs
    parts.push({
      text, audioUrl: s.audioUrl, word: !!s.word,
      timings: validTimings(s.wordTimings) ? s.wordTimings : null,
      durationSec: Number.isFinite(ms) && ms > 0 ? ms / 1000 : null,
    })
  }
  return parts.length ? { ok: true, parts } : { ok: false, reason: 'empty', parts: [] }
}

// parts → { items: [{ ...part, lead, end, span, offset }], timings, totalSec }
//   lead — с какой секунды файла начинаем; end — когда передаём эстафету (null — играем до конца файла);
//   span — сколько секунд занимает часть в общей шкале; offset — начало части в общей шкале; timings — общие [{word,start,end}]
export function chainLayout(parts) {
  let offset = 0
  const timings = []
  const items = parts.map(p => {
    const t = p.timings
    const known = p.durationSec ?? (t ? timingsEnd(t) : null)
    let lead = 0
    let end = null
    if (t && !p.word) {
      lead = Math.max(0, t[0].start - LEAD_PAD)
      end = t[t.length - 1].end + TAIL_PAD
      if (p.durationSec) end = Math.min(end, p.durationSec)
    }
    const span = Math.max(0.05, (end ?? known ?? fallbackMs(p.text) / 1000) - lead)
    const own = t ?? syntheticTimings(p.text, span)
    for (const w of own) timings.push({ word: w.word, start: Math.max(offset, offset + w.start - lead), end: Math.max(offset, offset + w.end - lead) })
    const item = { ...p, lead, end, span, offset }
    offset += span
    return item
  })
  return { items, timings, totalSec: offset }
}
