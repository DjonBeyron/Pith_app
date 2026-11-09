// Отрезок отчёта «📤 Отправить» стенда пилюль (CONCEPT_PILLSTAND.md, «Отправка по теме»): какую часть сессии отправить — вся сессия, текущая цель (та, на которой стоит «сейчас»: на живом
// экране — последняя цель, в плеере — цель кадра), отрезок A–B из плеера, последние N секунд (до «сейчас»: в плеере — до текущего кадра). Всё в мс сессии (шкала трассы pillStandTrace.js).
// Здесь же: события / кадры отрезка, разбор строк журнала игры (метка строки — performance.now страницы → мс сессии вычитанием старта трассы), место отрезка в звуке записи. Чистые функции.
export const SPANS = ['session', 'target', 'ab', 'last']
export const LAST_SECONDS = [10, 30, 60]
const sec = ms => (ms / 1000).toFixed(3).replace('.', ',')
const q = t => `«${t ?? ''}»`

/** Цель, на которой стоит момент at: последнее событие 'target' с t ≤ at (или первая цель) */
export function targetAt(events, at) {
  let got = null
  for (const e of events) { if (e.k !== 'target') continue; if (e.t <= at || !got) got = e; if (e.t > at) break }
  return got
}

/** → { kind, from, to, label } — kind: 'session' | 'target' | 'ab' | 'last'; at — «сейчас» (мс сессии); ab — [a, b] плеера; sec — для 'last' */
export function resolveSpan({ kind, events, at, ab = null, sec: n = 30 }) {
  const end = Math.max(at ?? 0, events.at(-1)?.t ?? 0)
  if (kind === 'ab' && ab && ab[1] > ab[0]) return { kind, from: ab[0], to: ab[1], label: `отрезок A–B из плеера ${sec(ab[0])}–${sec(ab[1])} с (${sec(ab[1] - ab[0])} с)` }
  if (kind === 'target') {
    const tg = targetAt(events, at ?? end)
    if (tg) {
      const next = events.find(e => e.k === 'target' && e.t > tg.t)
      const to = next ? next.t - 0.1 : end
      return { kind, from: tg.t, to, label: `текущая цель #${(tg.n ?? 0) + 1} ${q(tg.say)} ${sec(tg.t)}–${sec(to)} с` }
    }
  }
  if (kind === 'last') { const to = at ?? end, from = Math.max(0, to - n * 1000); return { kind, sec: n, from, to, label: `последние ${n} с ${sec(from)}–${sec(to)} с` } }
  const from = Math.min(0, events[0]?.t ?? 0)
  return { kind: 'session', from, to: end, label: `вся сессия ${sec(from)}–${sec(end)} с` }
}

/** События отрезка; цель, начатая до отрезка, — первой (контекст: хроника идёт «по целям») */
export function sliceEvents(events, { from, to }) {
  const inside = events.filter(e => e.t >= from && e.t <= to)
  const lead = targetAt(events.filter(e => e.t < from), from)
  return lead && lead.t < from && inside[0]?.k !== 'target' ? [lead, ...inside] : inside
}

/** Кадры записи в отрезке */
export const sliceFrames = (frames, { from, to }) => frames.filter(f => f.t >= from && f.t <= to)

const LINE = /^\s*(-?\d+(?:\.\d+)?) (\d\d:\d\d:\d\d\.\d{3}) ([\s\S]*)$/
/** Строки журнала игры (gameJournal.lines) → [{ t (мс сессии), day, text }]; t0abs — старт трассы (performance.now) */
export function parseJournal(lines, t0abs) {
  const out = []
  for (const l of lines) { const m = LINE.exec(l); if (m) out.push({ t: Math.round((Number(m[1]) - t0abs) * 10) / 10, day: m[2], text: m[3] }) }
  return out
}

/** Строки журнала в отрезке */
export const journalIn = (parsed, { from, to }) => parsed.filter(l => l.t >= from && l.t <= to)

/** Отрезок в звуке записи: [a, b] секунд от начала звукового файла (null — звука нет или отрезок мимо) */
export function inAudio(audio, { from, to }, durMs = null) {
  if (!audio || audio.startMs == null) return null
  const a = Math.max(0, from - audio.startMs), b = to - audio.startMs
  const end = durMs ?? Infinity
  if (b <= 0 || a >= end) return null
  return [Math.round(a) / 1000, Math.round(Math.min(b, end)) / 1000]
}
