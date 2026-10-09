// Журнал попыток распознавания в localStorage ЭТОГО устройства (на сервер не уходит, звук и текст не хранятся).
import { MODE_LABEL, PERM_LABEL } from './speechSupport.js'
import { fmtCapture, fmtConf } from './speechCapture.js'
import { MAX_ATTEMPTS } from './speechPolicy.js'

export const LOG_KEY = 'pithy_admin_voice_probe_v1'
export const LOG_KEEP = 50  // сколько записей хранить
export const LOG_SHOW = 20  // сколько показывать
const SLOW_AUDIO_MS = 1200  // без permissions API: audiostart позже этого после start — возможно показали диалог

export function readLog(store = globalThis.localStorage) {
  try {
    const arr = JSON.parse(store.getItem(LOG_KEY))
    return Array.isArray(arr) ? arr.filter(e => e && typeof e === 'object') : []
  } catch { return [] }
}

export function appendLog(entry, store = globalThis.localStorage) {
  const next = [entry, ...readLog(store)].slice(0, LOG_KEEP) // новые сверху
  try { store.setItem(LOG_KEY, JSON.stringify(next)) } catch { /* приватный режим — журнал только в памяти страницы */ }
  return next
}

export function clearLog(store = globalThis.localStorage) {
  try { store.removeItem(LOG_KEY) } catch { /* ничего */ }
  return []
}

/**
 * Эвристика «показывали ли диалог разрешения»: напрямую это узнать нельзя.
 * 'yes'   — до старта было prompt, и звук/результат пошёл (значит, пользователь разрешил в диалоге)
 * 'maybe' — состояние неизвестно, но audiostart пришёл заметно позже start (ждали ответа в диалоге)
 * 'no'    — разрешение уже было granted и звук пошёл без диалога
 * 'unknown' — звука не было (ошибка/отказ) или данных мало
 */
export function dialogGuess({ permBefore, msStart, msAudio, msResult }) {
  const got = msAudio != null || msResult != null
  if (!got) return 'unknown'
  if (permBefore === 'prompt') return 'yes'
  if (permBefore === 'granted') return 'no'
  if (permBefore === 'unavailable' && msAudio != null && msStart != null && msAudio - msStart > SLOW_AUDIO_MS) return 'maybe'
  return 'unknown'
}

export const DIALOG_LABEL = { yes: 'да', maybe: 'возможно', no: 'нет', unknown: '?' }

/** Сколько раз за сеанс (с открытия страницы) диалог, судя по эвристике, показывали: [точно, возможно] */
export function dialogCount(log, since) {
  const s = log.filter(e => e.t >= since)
  return [s.filter(e => e.dialog === 'yes').length, s.filter(e => e.dialog === 'maybe').length]
}

export const fmtMs = v => (v == null ? '—' : String(v))

/** «№3 · 2/3» — номер нажатия «Сказать» и номер попытки внутри него (старые записи без полей → «—») */
export const fmtAttempt = e => (e.run != null ? `№${e.run} · ${(e.retry ?? 0) + 1}/${MAX_ATTEMPTS}${e.last ? ' итог' : ''}` : '—')

export function logReportLines(log) {
  return log.slice(0, LOG_SHOW).map(e => {
    const t = new Date(e.t).toLocaleString('ru-RU')
    const perm = `${PERM_LABEL[e.permBefore] ? e.permBefore : '?'}→${e.permAfter || '?'}`
    return `${t} | попытка ${fmtAttempt(e)} | ${MODE_LABEL[e.mode] || e.mode} | разрешение ${perm} | start ${fmtMs(e.msStart)} / audio ${fmtMs(e.msAudio)} / result ${fmtMs(e.msResult)} мс | уверенность ${fmtConf(e.conf)} | захват ${fmtCapture(e)} | ошибка: ${e.error || '—'} | исход: ${e.outcome || '—'} | диалог: ${DIALOG_LABEL[e.dialog] || '?'}`
  })
}
