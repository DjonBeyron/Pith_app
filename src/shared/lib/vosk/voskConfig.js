// Адрес модели Vosk — одно место для всех: фоновой загрузки у обычных пользователей, будущего модуля «Сказать фразу» и админ-пробы.
// Порядок: адрес, сохранённый админом в лаборатории (localStorage) → VITE_VOSK_MODEL_URL (Vercel) → встроенный запасной (github.io, CORS там работает).
// У обычных пользователей ключа в localStorage нет, поэтому им достаётся VITE_VOSK_MODEL_URL либо запасной адрес.
export const VOSK_MODEL_URL = 'https://ccoreilly.github.io/vosk-browser/models/vosk-model-small-en-us-0.15.tar.gz'
export const VOSK_URL_KEY = 'pithy_admin_vosk_model_url_v1'
const LEGACY_URL_KEY = 'pithy_admin_voice_vosk_url_v1' // прежний ключ (до своего хоста модели)

/** Адрес «по умолчанию»: VITE_VOSK_MODEL_URL, если задан, иначе встроенный. env подставляется в тестах */
export function defaultModelUrl(env = import.meta.env) {
  const v = typeof env?.VITE_VOSK_MODEL_URL === 'string' ? env.VITE_VOSK_MODEL_URL.trim() : ''
  return v || VOSK_MODEL_URL
}

export function readModelUrl(store = globalThis.localStorage, env = import.meta.env) {
  const def = defaultModelUrl(env)
  try { return store.getItem(VOSK_URL_KEY) || store.getItem(LEGACY_URL_KEY) || def } catch { return def }
}
/** Откуда взят адрес модели (для диагностики): 'saved' — админ сохранил свой в лаборатории; 'env' — VITE_VOSK_MODEL_URL (Vercel); 'builtin' — встроенный запасной (github.io) */
export function modelUrlSource(store = globalThis.localStorage, env = import.meta.env) {
  try { if (store.getItem(VOSK_URL_KEY) || store.getItem(LEGACY_URL_KEY)) return 'saved' } catch { /* приватный режим */ }
  return defaultModelUrl(env) === VOSK_MODEL_URL ? 'builtin' : 'env'
}
export function writeModelUrl(url, store = globalThis.localStorage) {
  try { store.setItem(VOSK_URL_KEY, url) } catch { /* приватный режим */ }
}
/** «Вернуть по умолчанию»: забываем сохранённый адрес (и прежний ключ) */
export function resetModelUrl(store = globalThis.localStorage, env = import.meta.env) {
  try { store.removeItem(VOSK_URL_KEY); store.removeItem(LEGACY_URL_KEY) } catch { /* приватный режим */ }
  return defaultModelUrl(env)
}
