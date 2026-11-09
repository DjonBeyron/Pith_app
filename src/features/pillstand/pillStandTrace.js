// Трасса стенда пилюль (CONCEPT_PILLSTAND.md, «Тотальное логирование»): каждое событие сессии — объект { t, k, ...данные } в массиве, t — мс от старта сессии (performance.now, точность 0,1 мс).
// То же событие уходит в журнал игры строкой «[stand] k {данные}» (gameJournal через pLog) — кроме частых: уровень микрофона в журнал не чаще LEVEL_LOG_MS, кадры заливки и повторные черновики — только в трассу
// (журнал игры держит 3000 строк). Подписчики (панель «что слышит Vosk», сводка) получают события сразу. Потолок MAX_EVENTS: дальше старые вытесняются пачкой (dropped считает). Чистый модуль.
import { pLog } from '../../shared/lib/debug.js'

export const MAX_EVENTS = 120000
export const EVICT = 5000
export const LEVEL_LOG_MS = 100
export const QUIET_KINDS = new Set(['fill', 'level', 'same', 'frame']) // только в трассу (уровень — в журнал реже)
const JSON_MAX = 600

const short = data => { let s = ''; try { s = JSON.stringify(data) ?? '' } catch { s = String(data) } return s.length > JSON_MAX ? `${s.slice(0, JSON_MAX)}…` : s }

export function createStandTrace({ now = () => performance.now(), log = pLog, max = MAX_EVENTS, evict = EVICT } = {}) {
  let t0 = now(), events = [], dropped = 0, levelAt = -Infinity
  const subs = new Set()
  const rel = () => Math.round((now() - t0) * 10) / 10
  const api = {
    /** Новое событие kind с данными data → само событие */
    push(kind, data = {}) {
      const ev = { t: rel(), k: kind, ...data }
      events.push(ev)
      if (events.length > max) { const cut = Math.min(events.length, events.length - max + evict); events.splice(0, cut); dropped += cut }
      if (!QUIET_KINDS.has(kind)) log(`[stand] ${kind} ${short(data)}`)
      else if (kind === 'level' && ev.t - levelAt >= LEVEL_LOG_MS) { levelAt = ev.t; log(`[stand] level ${short(data)}`) }
      subs.forEach(f => { try { f(ev) } catch { /* подписчик не ломает трассу */ } })
      return ev
    },
    /** Строка журнала модулей игры ([phrase-ear], [gate], [fill], …) — в трассу как 'log' (в журнал её уже написал сам модуль) */
    line(text) {
      const ev = { t: rel(), k: 'log', text: String(text) }
      events.push(ev); subs.forEach(f => { try { f(ev) } catch { /* подписчик не ломает трассу */ } })
      return ev
    },
    /** мс от старта сессии сейчас */
    now: rel,
    /** Абсолютное время (performance.now) → мс сессии */
    rel: abs => Math.round((abs - t0) * 10) / 10,
    events: () => events,
    dropped: () => dropped,
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn) },
    /** Новая сессия: отсчёт с нуля, события стёрты */
    reset() { t0 = now(); events = []; dropped = 0; levelAt = -Infinity },
    started: () => t0,
  }
  return api
}
