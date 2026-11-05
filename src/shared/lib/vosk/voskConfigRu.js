// Русская модель Vosk (проход «назови перевод» игры «Встряхни память»): та же схема адреса, что у английской (voskConfig.js), — свой ключ админа и своя переменная окружения.
// Порядок: адрес, сохранённый админом в блоке «Встряхни память» (localStorage) → VITE_VOSK_RU_MODEL_URL (Vercel) → встроенный запасной (github.io, тот же хост, что у английской).
// Библиотека vosk-browser читает модели ТОЛЬКО в виде tar.gz (zip она не открывает), поэтому запасной адрес — архив tar.gz, а свой файл админ кладёт в бакет R2 тоже в tar.gz.
import { readModelUrl } from './voskConfig.js'

export const VOSK_RU_MODEL_URL = 'https://ccoreilly.github.io/vosk-browser/models/vosk-model-small-ru-0.22.tar.gz'
export const VOSK_RU_URL_KEY = 'pithy_admin_vosk_ru_model_url_v1'
export const VOSK_RU_SIZE_TEXT = '≈45 МБ'

/** Русский адрес «по умолчанию»: VITE_VOSK_RU_MODEL_URL, если задан, иначе встроенный. env подставляется в тестах */
export function defaultRuModelUrl(env = import.meta.env) {
  const v = typeof env?.VITE_VOSK_RU_MODEL_URL === 'string' ? env.VITE_VOSK_RU_MODEL_URL.trim() : ''
  return v || VOSK_RU_MODEL_URL
}
export function readRuModelUrl(store = globalThis.localStorage, env = import.meta.env) {
  const def = defaultRuModelUrl(env)
  try { return store.getItem(VOSK_RU_URL_KEY) || def } catch { return def }
}
export function writeRuModelUrl(url, store = globalThis.localStorage) {
  try { store.setItem(VOSK_RU_URL_KEY, url) } catch { /* приватный режим */ }
}
/** «Вернуть по умолчанию»: забываем сохранённый русский адрес */
export function resetRuModelUrl(store = globalThis.localStorage, env = import.meta.env) {
  try { store.removeItem(VOSK_RU_URL_KEY) } catch { /* приватный режим */ }
  return defaultRuModelUrl(env)
}
/** Адрес модели нужного языка: 'ru' — русская, иначе английская */
export const modelUrlOf = (lang = 'en', store, env) => (lang === 'ru' ? readRuModelUrl(store, env) : readModelUrl(store, env))
