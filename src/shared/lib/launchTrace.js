import { pLog } from './debug.js'

// Трассировка карточки запуска урока: кольцевой буфер событий с временем (мс от загрузки страницы) + дубль в debug-лог плеера.
// Нужна, потому что при «кнопка не открывается / тап ничего не делает» раньше не оставалось следа. Буфер попадает в «Скачать лог загрузки»
// (LaunchDebugPanel), а живое состояние условий готовности видно на экране у админа.
const MAX = 300
const buf = []
const T0 = typeof performance !== 'undefined' ? performance.now() : 0
const now = () => Math.round((typeof performance !== 'undefined' ? performance.now() : 0) - T0)

export function traceLaunch(msg) {
  buf.push({ t: now(), msg: String(msg) })
  if (buf.length > MAX) buf.shift()
  try { pLog(`[launch] ${msg}`) } catch { /* лог недоступен — трасса остаётся в буфере */ }
}
export const getLaunchTrace = () => buf.slice()
export const resetLaunchTrace = () => { buf.length = 0 }

/** Подпись состояния: меняется только при реальном переходе (список «не готово», флаги), чтобы не писать одно и то же каждый рендер */
export const stateSignature = state => JSON.stringify(state)

// Ошибки страницы пишем в трассу всегда, пока загружен модуль (и после ухода с карточки: падение плеера на старте иначе не оставляло следа)
let installed = false
export function installGlobalErrorTrace() {
  if (installed || typeof window === 'undefined') return
  installed = true
  window.addEventListener('error', e => traceLaunch(`window.error: ${e?.message ?? e}${e?.filename ? ` (${String(e.filename).split('/').pop()}:${e.lineno})` : ''}${e?.error?.stack ? ` | ${String(e.error.stack).split('\n').slice(0, 3).join(' ← ')}` : ''}`))
  window.addEventListener('unhandledrejection', e => traceLaunch(`unhandledrejection: ${e?.reason?.message ?? e?.reason ?? e}${e?.reason?.stack ? ` | ${String(e.reason.stack).split('\n').slice(0, 3).join(' ← ')}` : ''}`))
}
installGlobalErrorTrace()
