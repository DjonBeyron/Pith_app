// «Дубль и зеркало»: модель экрана сравнения — две полосы (диктор / человек) на ОБЩЕЙ шкале, пилюли кусков по таймингам. Чистые функции, без DOM: раскладка в процентах ширины полосы.
// Время каждой полосы отсчитывается от начала первой речи (реакция на «три, два, один» не занимает места). Пропущенный человеком кусок — «призрак»: пустое место шириной в длину куска у диктора,
// вставленное туда, где он должен был звучать (всё, что звучит дальше, сдвигается вправо), — пунктирный контур. Пауза длиннее диктора (measure.pauses) — подсвеченный зазор между пилюлями.
import { toMs, assignWords, chunkSpan } from './mirrorAlign.js'

export const GHOST_GAP_MS = 80
const MIN_GHOST_MS = 250
const pct = (ms, scale) => Math.round((ms / scale) * 10000) / 100

/** Куски со звучанием: [{ i, start, end }] в мс от начала первой речи полосы; base — начало первой речи (мс исходного времени) */
function spansOf(words, chunks) {
  const a = assignWords(words, chunks)
  const raw = a.byChunk.map((ws, i) => (a.present[i] ? chunkSpan(ws) : null))
  const base = Math.min(...raw.filter(Boolean).map(s => s.start))
  return { raw, base: Number.isFinite(base) ? base : 0, present: a.present }
}

/**
 * Модель экрана. dictor: { words (мс), durationMs }, student: { words (Vosk, секунды; unit: 'ms'), durationMs } | null (записи нет), chunks, measure (необязательно, паузы подсвечиваются по measure.pauses).
 * Возвращает { scaleMs, dictor: { pills, durationMs, whole }, student: { pills, gaps, durationMs } | null }. Пилюля: { i, text, left, width (% полосы), at, until (мс звука: когда загорается/гаснет; у призрака нет), ghost }.
 */
export function buildMirrorView({ dictor, student, chunks, measure }) {
  const d = spansOf(dictor?.words ?? [], chunks)
  const dictorPills = []
  chunks.forEach((text, i) => {
    const s = d.raw[i]
    if (s) dictorPills.push({ i, text, startMs: s.start - d.base, endMs: s.end - d.base, at: s.start, until: s.end })
  })
  const dictorEnd = dictorPills.length ? Math.max(...dictorPills.map(p => p.endMs)) : Number(dictor?.durationMs) || 0

  let studentPills = null
  let studentEnd = 0
  const hot = []
  if (student) {
    const sw = toMs(student.words, student.unit)
    const s = spansOf(sw, chunks)
    const ghosts = []
    chunks.forEach((text, i) => {
      if (s.present[i]) return
      const dw = d.raw[i] ? d.raw[i].end - d.raw[i].start : 0
      let prev = -1
      for (let j = i - 1; j >= 0; j--) if (s.present[j]) { prev = j; break }
      ghosts.push({ i, text, anchor: prev >= 0 ? s.raw[prev].end - s.base : 0, w: Math.max(MIN_GHOST_MS, dw) })
    })
    // сдвиг от призраков: всё, что начинается не раньше точки их вставки, едет вправо на длину пустого места
    const shiftFor = (t, before = ghosts.length) => ghosts.slice(0, before).filter(g => g.anchor <= t).reduce((sum, g) => sum + g.w + GHOST_GAP_MS, 0)
    studentPills = []
    chunks.forEach((text, i) => {
      if (!s.present[i]) return
      const st = s.raw[i].start - s.base
      const sh = shiftFor(st)
      studentPills.push({ i, text, startMs: st + sh, endMs: s.raw[i].end - s.base + sh, at: s.raw[i].start, until: s.raw[i].end })
    })
    ghosts.forEach((g, k) => { const st = g.anchor + shiftFor(g.anchor, k) + GHOST_GAP_MS; studentPills.push({ i: g.i, text: g.text, startMs: st, endMs: st + g.w, ghost: true }) })
    studentPills.sort((a, b) => a.i - b.i)
    studentEnd = Math.max(0, ...studentPills.map(p => p.endMs))
    for (const p of measure?.pauses ?? []) {
      const k = chunks.indexOf(p.before)
      const a = studentPills.find(x => x.i === k - 1 && !x.ghost)
      const b = studentPills.find(x => x.i === k && !x.ghost)
      if (a && b && b.startMs > a.endMs) hot.push({ startMs: a.endMs, endMs: b.startMs })
    }
  }

  const scaleMs = Math.max(1, dictorEnd, studentEnd)
  const place = p => ({ ...p, left: pct(p.startMs, scaleMs), width: pct(p.endMs - p.startMs, scaleMs) })
  return {
    scaleMs,
    dictor: { pills: dictorPills.map(place), durationMs: dictorEnd, whole: !dictorPills.length },
    student: studentPills ? { pills: studentPills.map(place), gaps: hot.map(g => ({ left: pct(g.startMs, scaleMs), width: pct(g.endMs - g.startMs, scaleMs) })), durationMs: studentEnd } : null,
  }
}

/**
 * Расписание подсветки по ходу звука: [{ at (мс от начала звука), i, on }] по возрастанию времени. Диктор: время слов — от начала его голоса, offsetMs = dictor.leadMs (сколько мс после play()
 * голос молчит). Запись человека: тайминги слов Vosk уже отсчитаны от старта записи, offsetMs = 0
 */
export function litSchedule(pills, offsetMs = 0) {
  const ev = []
  for (const p of pills) {
    if (p.ghost || p.at == null) continue
    ev.push({ at: Math.max(0, p.at + offsetMs), i: p.i, on: true }, { at: Math.max(0, p.until + offsetMs), i: p.i, on: false })
  }
  return ev.sort((a, b) => a.at - b.at || Number(a.on) - Number(b.on))
}
