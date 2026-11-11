// Отрезок отчёта «📤 Отправить» стенда пилюль (CONCEPT_PILLSTAND.md, «Отправка по теме»): какую часть сессии отправить — вся сессия, текущая цель (та, на которой стоит «сейчас»: на живом
// экране — последняя цель, в плеере — цель кадра; v3.3.180: + прошлая цель, если в текущей ещё ничего не было, или выбранная из последних 5; всегда с 1 с до появления), отрезок A–B из плеера, последние N секунд (до «сейчас»: в плеере — до текущего кадра). Всё в мс сессии (шкала трассы pillStandTrace.js).
// Здесь же: события / кадры отрезка, разбор строк журнала игры (метка строки — performance.now страницы → мс сессии вычитанием старта трассы), место отрезка в звуке записи. Чистые функции.
import { isVoice } from './pillStandVoice.js'

export const SPANS = ['session', 'target', 'ab', 'last']
export const LAST_SECONDS = [10, 30, 60]
const sec = ms => (ms / 1000).toFixed(3).replace('.', ',')
const q = t => `«${t ?? ''}»`


export const TARGET_LEAD_MS = 1000 // отрезок цели начинается за столько до её появления (что было прямо перед ней)
export const RECENT_N = 5

/** Цель, на которой стоит момент at: последнее событие 'target' с t ≤ at (или первая цель) */
export function targetAt(events, at) {
  let got = null
  for (const e of events) { if (e.k !== 'target') continue; if (e.t <= at || !got) got = e; if (e.t > at) break }
  return got
}

const sameTarget = (a, b) => a && b && a.n === b.n && a.say === b.say && a.gen === b.gen

/** Последние n целей до at, новая первой: [{ e (событие 'target'), t, to, n, say, mark ✓ / ✗ / —, voiced (голос или Vosk что-то услышал) }]; двойное появление (StrictMode) — одна цель */
export function recentTargets(events, at = Infinity, n = RECENT_N) {
  const tgs = []
  for (const e of events) {
    if (e.t > at) break
    if (e.k === 'target') { const last = tgs.at(-1); if (sameTarget(last?.e, e) && !last.voiced && last.mark === '—') tgs.pop(); tgs.push({ e, t: e.t, n: e.n ?? 0, say: e.say ?? '', mark: '—', voiced: false }); continue }
    const cur = tgs.at(-1)
    if (!cur) continue
    if (e.k === 'result') cur.mark = e.ok ? '✓' : '✗'
    else if ((e.k === 'level' && isVoice(e)) || (e.k === 'vosk-partial' && e.raw?.partial) || (e.k === 'vosk-final' && e.raw?.text)) cur.voiced = true
  }
  tgs.forEach((g, i) => { g.to = tgs[i + 1]?.t ?? null })
  return tgs.slice(-n).reverse()
}

const tLabel = g => `#${g.n + 1} ${q(g.say)}`

/** Отрезок «цель»: pick — t выбранной цели (лист «Отправить»); без выбора — текущая, а если в ней ещё ни голоса, ни исхода — вместе с прошлой, где они были (её строки не теряются при «авто») */
function targetSpan(events, at, end, pick) {
  const list = recentTargets(events, at, Infinity)
  const chosen = pick != null ? list.find(g => g.t === pick) : null
  if (chosen) {
    const to = chosen.to != null ? chosen.to - 0.1 : end
    return { kind: 'target', pick, from: chosen.t - TARGET_LEAD_MS, to, label: `цель ${tLabel(chosen)} ${chosen.mark} (выбрана) ${sec(chosen.t - TARGET_LEAD_MS)}–${sec(to)} с` }
  }
  const [cur, prev] = list
  if (!cur) return null
  const both = prev && !cur.voiced && cur.mark === '—' && (prev.voiced || prev.mark !== '—')
  const from = (both ? prev : cur).t - TARGET_LEAD_MS
  const next = events.find(e => e.k === 'target' && e.t > cur.t && !sameTarget(e, cur.e)) // в плеере «сейчас» — кадр: цель до следующей
  const to = next ? next.t - 0.1 : end
  return { kind: 'target', from, to, label: both ? `цели ${tLabel(prev)} ${prev.mark} (последняя с голосом) + ${tLabel(cur)} (текущая) ${sec(from)}–${sec(to)} с` : `текущая цель ${tLabel(cur)} ${sec(from)}–${sec(to)} с` }
}

/** → { kind, from, to, label } — kind: 'session' | 'target' | 'ab' | 'last'; at — «сейчас» (мс сессии); ab — [a, b] плеера; sec — для 'last'; pick — t выбранной цели для 'target' */
export function resolveSpan({ kind, events, at, ab = null, sec: n = 30, pick = null }) {
  const end = Math.max(at ?? 0, events.at(-1)?.t ?? 0)
  if (kind === 'ab' && ab && ab[1] > ab[0]) return { kind, from: ab[0], to: ab[1], label: `отрезок A–B из плеера ${sec(ab[0])}–${sec(ab[1])} с (${sec(ab[1] - ab[0])} с)` }
  if (kind === 'target') { const got = targetSpan(events, at ?? end, end, pick); if (got) return got }
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
