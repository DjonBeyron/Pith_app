// Настройки стенда пилюль между открытиями (localStorage pithy_pillstand_v1): язык, режим, длина, «авто-следующая» и её пауза. Сбой хранилища — значения по умолчанию. Чистые функции.
import { MODES, LANGS, LENS } from './pillStandPick.js'

export const PREFS_KEY = 'pithy_pillstand_v1'
export const AUTO_MS = [600, 1200, 2000]
export const DEFAULTS = { lang: 'en', mode: 'word', len: 'any', auto: true, autoMs: 1200 }

const fit = (v, list, def) => (list.includes(v) ? v : def)

export function readStandPrefs(store = globalThis.localStorage) {
  let raw = null
  try { raw = JSON.parse(store?.getItem(PREFS_KEY) ?? 'null') } catch { raw = null }
  const p = raw && typeof raw === 'object' ? raw : {}
  return { lang: fit(p.lang, LANGS, DEFAULTS.lang), mode: fit(p.mode, MODES, DEFAULTS.mode), len: fit(p.len, LENS, DEFAULTS.len), auto: typeof p.auto === 'boolean' ? p.auto : DEFAULTS.auto, autoMs: fit(p.autoMs, AUTO_MS, DEFAULTS.autoMs) }
}

export function writeStandPrefs(prefs, store = globalThis.localStorage) {
  try { store?.setItem(PREFS_KEY, JSON.stringify(prefs)) } catch { /* не записалось — в следующий раз по умолчанию */ }
}
