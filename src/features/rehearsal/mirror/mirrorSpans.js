// «Дубль и зеркало»: когда звучит каждый кусок — у диктора и в записи человека. Чистые функции, без DOM. По этим отрезкам useMirrorPlayback зажигает кусок на дорожках, пока он звучит (litSchedule).
// Отрезок куска — { i, at, until } в мс ИСХОДНОГО времени звука: у диктора — от начала его голоса (play() + leadMs), у человека — от старта записи (тайминги слов Vosk уже отсчитаны от неё).
// Кусок, которого человек не сказал (пропуск), отрезка не имеет — гореть ему нечему. Где кусок стоит на дорожках и как залит — mirrorCompare.js.
import { toMs, assignWords, chunkSpan } from './mirrorAlign.js'

/** Отрезки кусков по словам (мс): [{ i, at, until }] только для произнесённых кусков, по порядку фразы */
function spansOf(words, chunks) {
  const a = assignWords(words, chunks)
  const out = []
  a.byChunk.forEach((ws, i) => {
    const s = a.present[i] ? chunkSpan(ws) : null
    if (s) out.push({ i, at: s.start, until: s.end })
  })
  return out
}

/**
 * Отрезки обеих записей. dictor: { words (мс) }, student: { words (Vosk, секунды; unit: 'ms' — уже мс) } | null (записи нет), chunks — куски фразы.
 * Возвращает { dictor: [{ i, at, until }], student: [{ i, at, until }] | null }.
 */
export function playSpans({ dictor, student, chunks }) {
  return {
    dictor: spansOf(dictor?.words ?? [], chunks),
    student: student ? spansOf(toMs(student.words, student.unit), chunks) : null,
  }
}

/**
 * Расписание подсветки по ходу звука: [{ at (мс от начала звука), i, on }] по возрастанию времени. Диктор: время слов — от начала его голоса, offsetMs = dictor.leadMs (сколько мс после play()
 * голос молчит). Запись человека: тайминги слов Vosk уже отсчитаны от старта записи, offsetMs = 0
 */
export function litSchedule(spans, offsetMs = 0) {
  const ev = []
  for (const p of spans ?? []) {
    if (p.at == null) continue
    ev.push({ at: Math.max(0, p.at + offsetMs), i: p.i, on: true }, { at: Math.max(0, p.until + offsetMs), i: p.i, on: false })
  }
  return ev.sort((a, b) => a.at - b.at || Number(a.on) - Number(b.on))
}
