// «Дубль и зеркало»: что можно честно измерить в дубле — пропуск и лишнее слово, порядок кусков, темп, паузы между кусками, громкость. Качество звуков не оцениваем (Vosk этого не умеет).
// Чистые функции, без DOM: время слов диктора — миллисекунды, слов человека — секунды Vosk (stats.words, от старта записи; unit: 'ms', если уже в мс).
import { toMs, assignWords, chunkSpan } from './mirrorAlign.js'

export { dictorWordsFromChunks, dictorPlan } from './mirrorDictor.js'

export const TEMPO_DELTA = 0.25   // темп отличается от диктора на столько (доля длительности речи) — заметка про темп
export const PAUSE_MIN_MS = 400   // пауза между кусками длиннее, чем у диктора, на столько мс — заметка про паузу
export const LOUD_MIN = 0.6       // громкость человека меньше этой доли диктора (тише на 40 %) — заметка про громкость

const num = v => (Number.isFinite(Number(v)) ? Number(v) : null)

/** Слова одной записи → { words (мс), assign }: разложены по кускам фразы */
function side(src, chunks, unit) {
  const words = toMs(src?.words, unit)
  return { words, ...assignWords(words, chunks) }
}

/** Первое нарушение порядка: кусок, прозвучавший раньше, чем стоящий в фразе перед ним — { early, late } (тексты кусков) или null */
function orderBreak(spans, chunks) {
  const seq = spans.map((s, i) => (s ? { i, at: s.start } : null)).filter(Boolean).sort((a, b) => a.at - b.at)
  for (let k = 0; k + 1 < seq.length; k++) if (seq[k].i > seq[k + 1].i) return { early: chunks[seq[k].i], late: chunks[seq[k + 1].i] }
  return null
}

/**
 * Измерения дубля. dictor: { words: [{ word, start, end }] мс, durationMs, rms? }; student: { words (Vosk: секунды), durationMs, rms, unit? }; chunks: куски фразы по порядку.
 * Возвращает { tempo (длительность речи человека / диктора по произнесённым кускам — без пауз между ними и не по длине файла; null — нечего сравнивать), missing: [куски], extra: [слова], orderOk, order: { early, late } | null,
 * pauses: [{ before, studentMs, dictorMs }] (только паузы длиннее диктора на PAUSE_MIN_MS и больше), gaps: [{ before, studentMs, dictorMs }] (все промежутки между соседними кусками — для экрана),
 * loud (rms человека / rms диктора или null), clean }.
 */
export function measureTake({ dictor, student, chunks }) {
  const d = side(dictor, chunks, 'ms')
  const s = side(student, chunks, student?.unit)
  const ds = d.byChunk.map(chunkSpan)
  const ss = s.byChunk.map(chunkSpan)
  const missing = chunks.filter((c, i) => !s.present[i])
  const brk = orderBreak(ss.map((x, i) => (s.present[i] ? x : null)), chunks)

  // Темп: чистая скорость речи — сумма длин сказанных кусков человека против диктора на ТЕХ ЖЕ кусках; паузы между кусками сюда не входят (их меряет «пауза»), длина файла тоже
  const same = chunks.map((c, i) => i).filter(i => s.present[i] && ds[i] && ss[i])
  const sumMs = list => same.reduce((sum, i) => sum + (list[i].end - list[i].start), 0)
  const sMs = sumMs(ss)
  const dMs = sumMs(ds)
  const tempo = same.length && dMs > 0 && sMs > 0 ? Math.round((sMs / dMs) * 100) / 100 : null

  // Паузы: промежутки между соседними по фразе кусками, оба сказаны
  const gaps = []
  for (let i = 1; i < chunks.length; i++) {
    if (!(s.present[i - 1] && s.present[i] && ds[i - 1] && ds[i])) continue
    gaps.push({ before: chunks[i], studentMs: Math.max(0, ss[i].start - ss[i - 1].end), dictorMs: Math.max(0, ds[i].start - ds[i - 1].end) })
  }
  const pauses = gaps.filter(g => g.studentMs - g.dictorMs >= PAUSE_MIN_MS).sort((a, b) => b.studentMs - b.dictorMs - (a.studentMs - a.dictorMs))

  const sr = num(student?.rms)
  const dr = num(dictor?.rms)
  const loud = sr != null && dr != null && dr > 0 ? Math.round((sr / dr) * 100) / 100 : null

  const tempoOk = tempo == null || (tempo > 1 - TEMPO_DELTA && tempo < 1 + TEMPO_DELTA)
  const clean = !missing.length && !s.extra.length && !brk && tempoOk && !pauses.length && (loud == null || loud > LOUD_MIN)
  return { tempo, missing, extra: s.extra, orderOk: !brk, order: brk, pauses, gaps, loud, clean }
}
