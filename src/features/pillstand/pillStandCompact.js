// Сжатие отчёта «📤 Отправить» стенда пилюль (v3.3.180, разбор присланного файла: в «Быстро» грамматика Vosk из 585 вариантов повторялась в каждом 'vosk-start' / 'grammar' и в журнале, уровень шёл
// каждые 43 мс, а журнал игры повторял трассу строками «[stand] …»). Здесь:
//  • compactGrammar — каждая РАЗНАЯ грамматика целиком один раз (grammars в JSON-блоке: #N, число вариантов, список), в событиях — ссылка { gref, gsize, gsame } («грамматика #N (585 вариантов, та же)»);
//  • thinTrace — для JSON «Всё»: уровень — все переходы порога голоса + раз в LEVEL_EVERY_MS в голосе / LEVEL_QUIET_MS в тишине (как в «Распознавании»), повторы черновика ('same') — только счётом,
//    заливка — смены цели, шаг экрана ≥ FILL_STEP, экран догнал цель; что выброшено — счётчики { level, same, fill };
//  • journalAll — журнал игры в «Всё»: без «[stand] …» (это трасса) и без строк, которые уже есть в трассе ('log'), «[perf]» — не чаще PERF_EVERY_MS. Чистые функции.
import { isVoice } from './pillStandVoice.js'
import { LEVEL_EVERY_MS, LEVEL_QUIET_MS, FILL_STEP } from './pillStandPacks.js'

export const PERF_EVERY_MS = 5000
const EPS = 0.012
const listOf = g => { if (Array.isArray(g)) return g; try { const v = JSON.parse(g); return Array.isArray(v) ? v : null } catch { return null } }
const hasGrammar = e => (e.k === 'vosk-start' || (e.k === 'wl' && e.kind === 'grammar')) && e.grammar != null

/** События → { events (грамматика заменена ссылкой), grammars: [{ n, size, t, list }] } */
export function compactGrammar(events) {
  const seen = new Map(), grammars = []
  const out = events.map(e => {
    if (!hasGrammar(e)) return e
    const list = listOf(e.grammar) ?? [String(e.grammar)]
    const key = JSON.stringify(list)
    let g = seen.get(key)
    const first = !g
    if (first) { g = { n: grammars.length + 1, size: list.length, t: e.t, list }; seen.set(key, g); grammars.push(g) }
    const { grammar: _g, ...rest } = e
    return { ...rest, gref: g.n, gsize: g.size, gsame: !first || e.k === 'wl' } // 'wl' grammar идёт сразу за своим 'vosk-start' — «та же»
  })
  return { events: out, grammars }
}

/** Грамматика события словами: «грамматика #2 (585 вариантов, та же)» */
export const grammarText = e => `грамматика #${e.gref} (${e.gsize} вариант${e.gsize % 10 === 1 && e.gsize % 100 !== 11 ? '' : e.gsize % 10 >= 2 && e.gsize % 10 <= 4 && (e.gsize % 100 < 12 || e.gsize % 100 > 14) ? 'а' : 'ов'}${e.gsame ? ', та же' : ''})`

/** JSON «Всё»: прореженная трасса → { events, dropped: { level, same, fill } } */
export function thinTrace(events) {
  let at = -Infinity, voice = null, goal = null, shown = null, reached = true
  const dropped = { level: 0, same: 0, fill: 0 }
  const out = []
  for (const e of events) {
    if (e.k === 'level') {
      const v = e.z ? 'z' : isVoice(e) // ровно 0 (оглох) — отдельное состояние: его начало и конец видны
      if (v === voice && e.t - at < (v === true ? LEVEL_EVERY_MS : LEVEL_QUIET_MS)) { dropped.level++; continue }
      at = e.t; voice = v
    } else if (e.k === 'same') { dropped.same++; continue }
    else if (e.k === 'fill') {
      const got = Math.abs(e.shown - e.goal) <= EPS
      const keep = goal == null || Math.abs(e.goal - goal) > 1e-4 || Math.abs(e.shown - shown) >= FILL_STEP || (got && !reached)
      reached = got
      if (!keep) { dropped.fill++; continue }
      goal = e.goal; shown = e.shown
    }
    out.push(e)
  }
  return { events: out, dropped }
}

/** Журнал игры для «Всё»: строки модулей игры без повторов трассы; traceLogs — тексты событий 'log' трассы */
export function journalAll(lines, traceLogs = new Set()) {
  let perfAt = -Infinity
  return lines.filter(l => {
    if (l.text.startsWith('[stand]') || traceLogs.has(l.text)) return false
    if (l.text.startsWith('[perf]')) { if (l.t - perfAt < PERF_EVERY_MS) return false; perfAt = l.t }
    return true
  })
}
