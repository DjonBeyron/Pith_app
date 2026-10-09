// Фоновая предзагрузка модели Vosk — чистые решения без побочных эффектов (тестируются без браузера):
// можно ли качать сейчас (canStart), через сколько повторять (nextDelay / pollDelay), на какие куски резать файл.
import { VoskError } from './voskErrors.js'

export const CHUNK_BYTES = 2 * 1048576 // один Range-запрос
export const PAUSE_MIN_MS = 250        // пауза между кусками — чтобы не занимать канал сплошным потоком
export const PAUSE_MAX_MS = 400
export const POLL_MS = 2500            // как часто смотрим «стало ли тихо»
export const SLOW_POLL_MS = 30000      // экономия трафика / 2g: смотрим редко
export const MAX_ATTEMPTS = 5          // неудачных попыток за сессию
export const RETRY_BASE_MS = 5000
export const RETRY_MAX_MS = 60000
export const START_MIN_MS = 5000       // после запуска приложения (и ухода сплэша) подождать 5–8 с
export const START_MAX_MS = 8000
export const STOP_KEY = 'pithy_vosk_bg_stop_v1' // «Остановить фоновую загрузку» (админ): планировщик не запускается

/** Подписи причин ожидания для админской строки */
export const REASON_TEXT = {
  feed: 'лента', video: 'видео', busy: 'занято (грузятся файлы урока)', hidden: 'приложение в фоне',
  offline: 'офлайн', saveData: 'экономия трафика', slow: 'медленная сеть', off: 'остановлена', cached: 'уже в кэше',
}

/**
 * Можно ли начинать/продолжать скачивание. s: { cached, stopped, offline, saveData, slow, hidden, feed, video, busy } (булевы).
 * → { ok: true } | { ok: false, reason } — reason из REASON_TEXT. Порядок = важность: сначала «навсегда» (кэш/стоп), потом «сеть», потом «занято».
 */
export function canStart(s) {
  if (s.cached) return { ok: false, reason: 'cached' }
  if (s.stopped) return { ok: false, reason: 'off' }
  if (s.offline) return { ok: false, reason: 'offline' }
  if (s.saveData) return { ok: false, reason: 'saveData' }
  if (s.slow) return { ok: false, reason: 'slow' }
  if (s.hidden) return { ok: false, reason: 'hidden' }
  if (s.feed) return { ok: false, reason: 'feed' }
  if (s.video) return { ok: false, reason: 'video' }
  if (s.busy) return { ok: false, reason: 'busy' }
  return { ok: true }
}

/** Через сколько мс проверить снова, если ждём по причине reason */
export const pollDelay = reason => (reason === 'saveData' || reason === 'slow' ? SLOW_POLL_MS : POLL_MS)

/** Пауза перед повтором после неудачи: 5, 10, 20, 40, 60, 60… секунд (attempt = номер только что упавшей попытки, с 1) */
export const nextDelay = attempt => Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** Math.max(0, attempt - 1))

/** Пауза между кусками, rand ∈ [0,1) */
export const chunkPause = (rand = Math.random()) => Math.round(PAUSE_MIN_MS + rand * (PAUSE_MAX_MS - PAUSE_MIN_MS))
/** Задержка старта после запуска приложения, rand ∈ [0,1) */
export const startDelayMs = (rand = Math.random()) => Math.round(START_MIN_MS + rand * (START_MAX_MS - START_MIN_MS))

/** Сколько кусков в файле размером total и границы куска i: { start, end (включительно), size } */
export const chunkCount = (total, chunk = CHUNK_BYTES) => Math.ceil(total / chunk)
export function chunkRange(i, total, chunk = CHUNK_BYTES) {
  const start = i * chunk
  const end = Math.min(total, start + chunk) - 1
  return { start, end, size: end - start + 1 }
}

/** «bytes 0-2097151/40000000» → { start, end, total|null }; нечитаемое → null */
export function parseContentRange(h) {
  const m = /^\s*bytes\s+(\d+)-(\d+)\/(\d+|\*)\s*$/i.exec(h || '')
  return m ? { start: Number(m[1]), end: Number(m[2]), total: m[3] === '*' ? null : Number(m[3]) } : null
}

/** Что можно качать «сейчас» по среде браузера: снимок для canStart. nav/doc/busy подставляются в тестах */
export function envSnapshot({ nav = globalThis.navigator, doc = globalThis.document, busy = {}, stopped = false } = {}) {
  const conn = nav?.connection
  return {
    stopped,
    offline: nav?.onLine === false,
    saveData: conn?.saveData === true,
    slow: conn?.effectiveType === 'slow-2g' || conn?.effectiveType === '2g',
    hidden: doc?.visibilityState === 'hidden' || doc?.hidden === true,
    feed: !!busy.feed?.(),
    video: !!busy.video?.(),
    busy: !!busy.net?.(),
  }
}

/** Флаг «остановить» в localStorage (админ): читать при каждой проверке, писать из кнопки */
export function isStopped(store = globalThis.localStorage) {
  try { return store.getItem(STOP_KEY) === '1' } catch { return false }
}
export function setStopped(on, store = globalThis.localStorage) {
  try { if (on) store.setItem(STOP_KEY, '1'); else store.removeItem(STOP_KEY) } catch { /* приватный режим */ }
}

/** Ошибка «сервер не поддерживает Range» — не сбой, а повод перейти на обычную загрузку */
export class RangeUnsupported extends VoskError {
  constructor(detail = '') { super('range', { detail }); this.name = 'RangeUnsupported' }
}
