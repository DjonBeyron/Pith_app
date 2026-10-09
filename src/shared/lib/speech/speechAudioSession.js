// Audio Session API (Safari 16.4+, navigator.audioSession) для распознавания речи на iPhone. Гипотеза «глухих» запусков: любое воспроизведение страницей
// (звуки интерфейса, озвучка, беззвучный wav «разблокировки») переводит аудиосессию WebKit в playback/ambient, и следующая запись микрофона слышит тишину.
// Лечение: на время записи ставим type = 'play-and-record' СИНХРОННО до recognition.start() (в том же тапе), после end/ошибки/стопа/смены попытки
// возвращаем 'auto' (побочный эффект play-and-record — вывод звука на ресивер, поэтому держим только на время записи). Всё в try/catch и по feature-detect:
// нет navigator.audioSession — стратегия S6/S7 деградирует до S3 (паузы), ничего не падает. Чистая логика: navigator и таймеры передаются снаружи.
import { STRATEGIES } from './speechRestart.js'

export const SESSION_PLAY_REC = 'play-and-record'
export const SESSION_RESET_MS = 150 // сброс: 'auto' → столько мс → 'play-and-record'

/** Обёртка над navigator.audioSession: supported() — есть ли API; current() — type или null; set(type) → удалось ли */
export function createAudioSession({ nav = globalThis.navigator } = {}) {
  const api = () => { try { const s = nav?.audioSession; return s && typeof s === 'object' && 'type' in s ? s : null } catch { return null } }
  return {
    supported: () => !!api(),
    current: () => { try { return api()?.type ?? null } catch { return null } },
    set(type) { const s = api(); if (!s) return false; try { s.type = type; return true } catch { return false } },
  }
}

/** Стратегия с audioSession без поддержки API деградирует до S3 (новый экземпляр + пауза 900 мс после end); id сохраняется, degraded=true */
export function degradeStrategy(strat, supported) {
  if (!strat.audioSession || supported) return strat
  return { ...strat, ...STRATEGIES.S3, audioSession: null, audioReset: false, degraded: true }
}

/**
 * Перед recognition.start(): выставить тип сессии и вызвать start. Пишет в попытку a: sessionInfo (для журнала: «auto→play-and-record»),
 * sessionHeld (надо вернуть 'auto'), sessionTimer (сброс идёт). type — желаемый тип или null (только прочитать); reset — сначала 'auto',
 * через SESSION_RESET_MS поставить type и только тогда start (старт на 150 мс позже тапа). Без API — просто start (degraded — стратегия уже превращена в S3).
 */
export function startWithSession(a, session, { type = null, reset = false, degraded = false, start, setTimer = setTimeout }) {
  a.sessionInfo = ''; a.sessionHeld = false; a.sessionTimer = null
  if (!session || !session.supported()) { a.sessionInfo = type || degraded ? `нет API → ${degraded ? 'как S3' : 'без аудиосессии'}` : '—'; start(); return }
  const before = session.current() ?? '?'
  if (!type) { a.sessionInfo = before; start(); return }
  if (!reset) { a.sessionHeld = session.set(type); a.sessionInfo = `${before}→${type}${a.sessionHeld ? '' : ' (не удалось)'}`; start(); return }
  session.set('auto'); a.sessionHeld = true
  a.sessionInfo = `${before}→auto→(${SESSION_RESET_MS} мс)→${type}`
  a.sessionTimer = setTimer(() => { a.sessionTimer = null; session.set(type); start() }, SESSION_RESET_MS)
}

/** Вернуть 'auto' (если мы ставили тип) и снять незавершённый сброс; повторный вызов безопасен */
export function releaseSession(a, session) {
  clearTimeout(a.sessionTimer); a.sessionTimer = null
  if (!a.sessionHeld) return
  a.sessionHeld = false
  try { session?.set('auto') } catch { /* API пропал — нечего возвращать */ }
}
