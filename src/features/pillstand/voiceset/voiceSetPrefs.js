// Настройки «Записи набора» между открытиями (localStorage pithy_voiceset_prefs_v1): список слов (текст поля ввода, как набрал человек), повторов на вид, «ещё раз на вытянутой руке».
// Сбой хранилища — значения по умолчанию. Чистые функции.
import { DEFAULT_WORDS, REPS } from './voiceSetPlan.js'

export const PREFS_KEY = 'pithy_voiceset_prefs_v1'
export const DEFAULTS = { words: DEFAULT_WORDS.join(', '), reps: 3, far: false }

export function readSetPrefs(store = globalThis.localStorage) {
  let raw = null
  try { raw = JSON.parse(store?.getItem(PREFS_KEY) ?? 'null') } catch { raw = null }
  const p = raw && typeof raw === 'object' ? raw : {}
  return { words: typeof p.words === 'string' && p.words.trim() ? p.words : DEFAULTS.words, reps: REPS.includes(p.reps) ? p.reps : DEFAULTS.reps, far: typeof p.far === 'boolean' ? p.far : DEFAULTS.far }
}

export function writeSetPrefs(prefs, store = globalThis.localStorage) {
  try { store?.setItem(PREFS_KEY, JSON.stringify(prefs)) } catch { /* не записалось — в следующий раз по умолчанию */ }
}
