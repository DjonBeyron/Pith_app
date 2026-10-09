// Ошибки загрузки модели Vosk — понятным языком по-русски. Без React; сеть (fetch) и navigator подставляются снаружи — тестируется без браузера.

export const MODEL_MB = 40

const TEXT = {
  http: (s) => `Адрес недоступен (код ${s ?? '—'}). Проверьте адрес модели`,
  cors: () => 'Хост модели закрыт CORS — нужно правило CORS на бакете (AllowedOrigins: адрес приложения, GET/HEAD, ExposeHeaders Content-Length)',
  network: () => 'Сеть пропала — повторите',
  stall: () => 'Скачивание зависло (30 секунд без данных) — повторите',
  incomplete: (_s, d) => `Скачано не полностью${d ? ` (${d})` : ''} — повторите`,
  html: () => 'По адресу не архив, а веб-страница — проверьте адрес модели',
  format: () => 'Файл не похож на архив модели (нужен tar.gz) — проверьте адрес и файл',
  quota: () => 'Нет места на устройстве (QuotaExceeded) — освободите память или удалите другие данные сайта',
  cancelled: () => 'Скачивание отменено',
  nocache: () => 'Кеш браузера недоступен (нужен https) — модель не сохранится на устройстве',
  blocked: () => 'Модель ещё не скачана — нажмите «Скачать модель»',
}

/** Ошибка с кодом: http | cors | network | stall | incomplete | html | format | quota | nocache | cancelled | blocked */
export class VoskError extends Error {
  constructor(code, { status = null, detail = '' } = {}) {
    super((TEXT[code] || (() => detail || 'Неизвестная ошибка'))(status, detail))
    this.name = 'VoskError'
    this.code = code
    this.status = status
  }
}

/** Ошибка переполнения хранилища у разных браузеров */
export function isQuotaError(e) {
  return !!e && (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014 || e.name === 'NS_ERROR_DOM_QUOTA_REACHED')
}

/** Сеть-сбой (TypeError без ответа) → cors (хост отвечает, но не пускает страницу) или network (хоста не слышно).
 *  Проверка: HEAD с mode:'no-cors' — если запрос дошёл (ответ «непрозрачный»), значит, это CORS. */
export async function diagnoseFetchFailure(url, { fetchFn = globalThis.fetch, online = globalThis.navigator?.onLine } = {}) {
  if (online === false) return new VoskError('network')
  try {
    await fetchFn(url, { method: 'HEAD', mode: 'no-cors' })
    return new VoskError('cors')
  } catch {
    return new VoskError('network')
  }
}

/** Ошибки, при которых повторная попытка имеет смысл */
export function isRetryable(e) {
  if (!(e instanceof VoskError)) return false
  if (e.code === 'network' || e.code === 'stall' || e.code === 'incomplete') return true
  return e.code === 'http' && (e.status >= 500 || e.status === 408 || e.status === 429)
}

/** Предупреждение о мобильной сети/экономии трафика (navigator.connection; на iPhone Safari его нет — тогда null) */
export function cellularWarning(conn) {
  if (!conn) return null
  const slow = ['slow-2g', '2g', '3g'].includes(conn.effectiveType)
  if (conn.type === 'cellular' || conn.saveData === true || slow) {
    return `Wi-Fi нужен: модель ${MODEL_MB} МБ, а сейчас ${conn.saveData ? 'включена экономия трафика' : 'мобильная сеть'}. Скачать всё равно?`
  }
  return null
}

/** Короткий текст ошибки для экрана (любой объект ошибки → строка по-русски) */
export function errorText(e) {
  if (e instanceof VoskError) return e.message
  if (isQuotaError(e)) return new VoskError('quota').message
  return e?.message || String(e)
}
