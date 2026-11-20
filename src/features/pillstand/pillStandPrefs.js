// Настройки стенда пилюль между открытиями (localStorage pithy_pillstand_v1): язык, режим, длина, «авто-следующая» и её пауза. Сбой хранилища — значения по умолчанию. Чистые функции.
import { MODES, LANGS, LENS } from './pillStandPick.js'

export const PREFS_KEY = 'pithy_pillstand_v1'
export const AUTO_MS = [600, 1200, 2000]
export const DEFAULTS = { lang: 'en', mode: 'word', len: 'any', auto: true, autoMs: 1200, pin: '', mix: false } // pin — закреплённая фраза (английский текст) или ''

/** Пресет сейчас выбран: все его настройки совпадают с текущими (для подсветки кнопки) */
export const presetOn = (preset, prefs) => Object.entries(preset.set).every(([k, v]) => prefs[k] === v)

/** Пресеты стенда (v3.3.303; kind — 'pin' закреплённый случай, 'mix' подборка новой системы: свой цвет кнопки): одним тапом выставляют режим, язык, закреплённую фразу и «авто» — чтобы повторить конкретный случай из журнала */
export const PRESETS = [
  { id: 'skip-are-words', kind: 'pin', label: 'Where are you from · по словам (строго)', set: { lang: 'en', mode: 'words', len: 'any', pin: 'Where are you from', mix: false, auto: false } },
  { id: 'skip-are-fast', kind: 'pin', label: 'Where are you from · быстро', set: { lang: 'en', mode: 'fast', len: 'any', pin: 'Where are you from', mix: false, auto: false } },
  { id: 'mix-words', kind: 'mix', label: 'Подборка 24 фразы · по словам', set: { lang: 'en', mode: 'words', len: 'any', pin: '', mix: true, auto: true, autoMs: 1200 } },
  { id: 'mix-fast', kind: 'mix', label: 'Подборка 24 фразы · быстро', set: { lang: 'en', mode: 'fast', len: 'any', pin: '', mix: true, auto: true, autoMs: 1200 } },
  { id: 'mix-word', kind: 'mix', label: 'Подборка слов (все по порядку)', set: { lang: 'en', mode: 'word', len: 'any', pin: '', mix: true, auto: true, autoMs: 1200 } },
]

const fit = (v, list, def) => (list.includes(v) ? v : def)

export function readStandPrefs(store = globalThis.localStorage) {
  let raw = null
  try { raw = JSON.parse(store?.getItem(PREFS_KEY) ?? 'null') } catch { raw = null }
  const p = raw && typeof raw === 'object' ? raw : {}
  return { lang: fit(p.lang, LANGS, DEFAULTS.lang), mode: fit(p.mode, MODES, DEFAULTS.mode), len: fit(p.len, LENS, DEFAULTS.len), auto: typeof p.auto === 'boolean' ? p.auto : DEFAULTS.auto, autoMs: fit(p.autoMs, AUTO_MS, DEFAULTS.autoMs), pin: typeof p.pin === 'string' ? p.pin.slice(0, 80) : DEFAULTS.pin, mix: typeof p.mix === 'boolean' ? p.mix : DEFAULTS.mix }
}

export function writeStandPrefs(prefs, store = globalThis.localStorage) {
  try { store?.setItem(PREFS_KEY, JSON.stringify(prefs)) } catch { /* не записалось — в следующий раз по умолчанию */ }
}
