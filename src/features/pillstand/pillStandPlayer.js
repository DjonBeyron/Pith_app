// Плеер записи стенда пилюль (CONCEPT_PILLSTAND.md): чистые функции времени и кадров — какой кадр в момент t, шаг ◀ ▶, луп отрезка [a, b], скорость, события кадра и окна ±EVENT_WIN_MS.
// Сам рендер — из снимков (pillStandSnap.applySnap), а не из логики игры.
export const EVENT_WIN_MS = 200
export const SPEEDS = [1, 0.5, 0.25]

/** Номер кадра в момент t: последний кадр с f.t ≤ t (до первого — 0); кадров нет — -1 */
export function frameAt(frames, t) {
  if (!frames.length) return -1
  let lo = 0, hi = frames.length - 1
  if (t <= frames[0].t) return 0
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (frames[mid].t <= t) lo = mid; else hi = mid - 1 }
  return lo
}

/** Шаг на dir кадров (−1 / +1) с упором в края */
export const stepFrame = (i, dir, n) => (n ? Math.min(n - 1, Math.max(0, i + dir)) : -1)

/** Отрезок лупа: [a, b] в мс записи; не задан или пустой — вся запись */
export function loopRange(frames, loop = null) {
  if (!frames.length) return [0, 0]
  const all = [frames[0].t, frames.at(-1).t]
  if (!loop || !(loop[1] > loop[0])) return all
  return [Math.max(all[0], loop[0]), Math.min(all[1], loop[1])]
}

/** Время вперёд на dtMs реального времени со скоростью speed: { t, wrap (луп начался заново), end (дошли до конца без лупа) } */
export function advance(t, dtMs, speed, [a, b], loop) {
  const next = t + dtMs * speed
  if (next <= b) return { t: Math.max(a, next), wrap: false, end: false }
  if (loop) return { t: a + ((next - b) % Math.max(1, b - a)), wrap: true, end: false }
  return { t: b, wrap: false, end: true }
}

/** События кадра i: от прошлого кадра (не включая) до этого (включая) */
export function frameEvents(events, frames, i) {
  if (i < 0 || !frames[i]) return []
  const to = frames[i].t, from = i > 0 ? frames[i - 1].t : -Infinity
  return events.filter(e => e.t > from && e.t <= to)
}

/** События окна ±win мс вокруг t (без кадров заливки и уровня — они видны на кадре) */
export const eventsAround = (events, t, win = EVENT_WIN_MS, skip = new Set(['fill', 'level', 'same'])) => events.filter(e => Math.abs(e.t - t) <= win && !skip.has(e.k))

/** Короткая строка события для плеера */
export function eventLine(e, t0 = 0) {
  const at = `${e.t - t0 >= 0 ? '+' : ''}${Math.round(e.t - t0)}`
  const body = e.k === 'vosk-partial' ? `черновик «${e.raw?.partial ?? ''}»` : e.k === 'vosk-final' ? `итог «${e.raw?.text ?? ''}» (${e.stopBy ?? '?'})` : e.k === 'gate' ? `затвор ${e.open ? 'открыт' : 'закрыт'} rms ${e.rms}`
    : e.k === 'word' ? `слово ${e.index + 1} «${e.text}»${e.gone ? ' откат' : e.draft ? ' черн.' : ''}` : e.k === 'log' ? e.text : e.k === 'pill' ? `пилюля: ${e.type}` : e.k === 'result' ? `зачёт ${e.ok ? '✓' : '✗'} ratio ${e.ratio}` : `${e.k} ${JSON.stringify({ ...e, t: undefined, k: undefined }).slice(0, 120)}`
  return `${at} ${body}`
}
