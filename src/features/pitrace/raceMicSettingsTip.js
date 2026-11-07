// Чистая логика подсказки «Чтобы iPhone не спрашивал микрофон каждый раз» (тексты — raceMicHelp.js, вид — RaceMicSettingsTip.jsx). В попапе «Голосом / Пальцами» она заменяет строку «iPhone спросит…»,
// но только когда микрофон уже разрешали минимум в двух разных запусках (micGrantFlag.js), «Понятно» не нажимали (pithy_mic_tip_done_v1) и «Напомнить позже» не действует (pithy_mic_tip_later_v1, 24 часа). На не-iOS не показывается.
import { isIOS } from './raceMicHelp.js'
import { readMicLaunches } from '../../shared/lib/micGrantFlag.js'

export const TIP_DONE_KEY = 'pithy_mic_tip_done_v1'
export const TIP_LATER_KEY = 'pithy_mic_tip_later_v1' // до какого момента (мс) молчим
export const TIP_LATER_MS = 24 * 60 * 60 * 1000
export const TIP_MIN_LAUNCHES = 2

/** Условие показа в попапе */
export function shouldShowTip({ ios = false, launches = 0, done = false, laterUntil = null, now = Date.now() } = {}) {
  if (!ios || done) return false
  if (launches < TIP_MIN_LAUNCHES) return false
  return !(laterUntil != null && now < laterUntil)
}

export function readTipDone(store = globalThis.localStorage) {
  try { return store?.getItem(TIP_DONE_KEY) === '1' } catch { return false }
}
export function writeTipDone(store = globalThis.localStorage) {
  try { store?.setItem(TIP_DONE_KEY, '1') } catch { /* приватный режим */ }
}
export function readTipLaterUntil(store = globalThis.localStorage) {
  try { const v = Number(store?.getItem(TIP_LATER_KEY)); return Number.isFinite(v) && v > 0 ? v : null } catch { return null }
}
export function writeTipLater(now = Date.now(), store = globalThis.localStorage) {
  try { store?.setItem(TIP_LATER_KEY, String(Math.round(now + TIP_LATER_MS))) } catch { /* приватный режим */ }
}

/** Показать ли подсказку в попапе сейчас: всё читается из хранилищ */
export function tipVisibleNow({ now = Date.now(), nav = globalThis.navigator, store = globalThis.localStorage } = {}) {
  return shouldShowTip({ ios: isIOS(nav), launches: readMicLaunches(store), done: readTipDone(store), laterUntil: readTipLaterUntil(store), now })
}
