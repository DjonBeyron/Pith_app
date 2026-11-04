// Запасная загрузка библиотеки Vosk. Основной путь — import('vosk-browser') (чанк assets/vosk-*.js). В Safari на iPhone он иногда
// падает мгновенно («Importing a module script failed»): испорченный ответ в кеше воркера либо запомненный браузером провал модуля
// (до перезагрузки страницы повтор не помогает). Тогда: просим воркер стереть чанк из кеша (drop-asset) и грузим ту же UMD-сборку
// ОБЫЧНЫМ <script> с другого адреса /vosk-fallback.js — он ставит globalThis.Vosk. Файл кладёт в dist/ tools/viteVoskFallback.js.
import { askSw } from '../shellClient.js'
import { APP_VERSION } from '../version.js'
import { pLog } from '../debug.js'

export const FALLBACK_URL = '/vosk-fallback.js'
export const FALLBACK_TIMEOUT_MS = 30000
const DROP_PREFIX = '/assets/vosk-'

/** Попросить воркер стереть чанк библиотеки из кеша оболочки. Нет воркера-контроллера — шаг пропускается (null) */
export async function dropVoskChunk(ask = askSw, timeout = 2000) {
  const r = await ask({ type: 'drop-asset', prefix: DROP_PREFIX }, timeout)
  return r && typeof r.dropped === 'number' ? r.dropped : null
}

/** <script src="/vosk-fallback.js?v=…">: ждём load/error (таймаут), затем отдаём globalThis.Vosk. Отказ — Error с причиной */
export function loadFallbackScript(doc = globalThis.document, timeout = FALLBACK_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    if (!doc) { reject(new Error('нет document для запасной загрузки')); return }
    const el = doc.createElement('script')
    const timer = setTimeout(() => done(new Error(`запасная загрузка не уложилась в ${Math.round(timeout / 1000)} с`)), timeout)
    function done(err) {
      clearTimeout(timer)
      el.onload = el.onerror = null
      if (err) { try { el.remove() } catch { /* уже убран */ } reject(err) } else resolve(globalThis.Vosk)
    }
    el.async = true
    el.onload = () => done(typeof globalThis.Vosk?.Model === 'function' ? null : new Error('запасный скрипт загрузился без Vosk.Model'))
    el.onerror = () => done(new Error('запасный скрипт не загрузился'))
    el.src = `${FALLBACK_URL}?v=${encodeURIComponent(APP_VERSION)}`
    doc.head.appendChild(el)
  })
}

/** Полный запасной путь после сбоя import(): журнал → drop-asset → <script>. Возвращает api либо кидает исходную ошибку */
export async function loadVoskFallback(cause, { ask = askSw, doc, log = pLog, hasSw = !!(typeof navigator !== 'undefined' && navigator.serviceWorker?.controller) } = {}) {
  log(`[say-vosk] библиотека: import не удался (${cause?.message || cause}); воркер-контроллер: ${hasSw ? 'есть' : 'нет'}`)
  if (hasSw) {
    const dropped = await dropVoskChunk(ask).catch(() => null)
    log(`[say-vosk] библиотека: воркер стёр записей чанка из кеша: ${dropped ?? 'нет ответа'}`)
  }
  const t = performance.now()
  try {
    const api = await loadFallbackScript(doc)
    log(`[say-vosk] библиотека: запасная загрузка ${FALLBACK_URL} — ок за ${Math.round(performance.now() - t)} мс`)
    return api
  } catch (e) {
    log(`[say-vosk] библиотека: запасная загрузка ${FALLBACK_URL} — ошибка: ${e.message}`)
    throw cause instanceof Error ? cause : e
  }
}
