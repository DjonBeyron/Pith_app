// Скачивание модели Vosk самим приложением: fetch + ReadableStream (проценты, МБ, скорость), отмена, до 3 попыток, проверка
// полноты по Content-Length, проверка «это архив». Без React; fetch и кеш подставляются. Авто-скачивания НЕТ: из сети
// getModel тянет только с allowNetwork:true (его ставит кнопка подтверждения).
import { VoskError, diagnoseFetchFailure, isRetryable } from './voskErrors.js'
import { readCached, saveModel } from './voskStorage.js'

export const ATTEMPTS = 3
export const PAUSE_MS = 2000
export const STALL_MS = 30000

export const fmtMb = n => (n == null ? '—' : `${(n / 1048576).toFixed(1)} МБ`)
export const fmtSpeed = bps => (bps ? `${(bps / 1048576).toFixed(2)} МБ/с` : '—')

/** Откуда брать модель: есть в кеше → 'cache'; нет и скачивание разрешено кнопкой → 'network'; иначе 'blocked' */
export function chooseSource(cached, allowNetwork) {
  if (cached) return 'cache'
  return allowNetwork ? 'network' : 'blocked'
}

/** Доля 0..100 (null, если полный размер неизвестен) */
export const percentOf = (loaded, total) => (total > 0 ? Math.min(100, Math.floor((loaded / total) * 100)) : null)

/** Скачано полностью? Размер известен — должен совпасть точно; неизвестен — хватит непустого ответа */
export const isComplete = (loaded, total) => (total > 0 ? loaded === total : loaded > 0)

/** Скорость, байт/с, по окну последних windowMs: meter(nowMs, loadedBytes) → bps */
export function makeSpeedMeter(windowMs = 3000) {
  const s = []
  return (now, loaded) => {
    s.push([now, loaded])
    while (s.length > 2 && now - s[0][0] > windowMs) s.shift()
    const [t0, b0] = s[0]
    return now > t0 ? ((loaded - b0) / (now - t0)) * 1000 : 0
  }
}

/** Что за файл по первым байтам: gzip | zip | tar | html | unknown */
export function sniffArchive(u8) {
  if (u8[0] === 0x1f && u8[1] === 0x8b) return 'gzip'
  if (u8[0] === 0x50 && u8[1] === 0x4b) return 'zip'
  if (String.fromCharCode(...u8.slice(257, 262)) === 'ustar') return 'tar'
  const head = String.fromCharCode(...u8.slice(0, 15)).trimStart().toLowerCase()
  return head.startsWith('<') ? 'html' : 'unknown'
}
export const archiveKind = async blob => sniffArchive(new Uint8Array(await blob.slice(0, 512).arrayBuffer()))

const sleepDefault = (ms, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) return reject(new VoskError('cancelled'))
  const t = setTimeout(resolve, ms)
  signal?.addEventListener('abort', () => { clearTimeout(t); reject(new VoskError('cancelled')) }, { once: true })
})

// Одна попытка. Любой сбой → VoskError с кодом (cancelled / stall / http / html / cors / network / incomplete)
async function downloadOnce(url, { fetchFn, signal, onProgress, stallMs, now }) {
  const ctl = new AbortController()
  const onAbort = () => ctl.abort()
  signal?.addEventListener('abort', onAbort, { once: true })
  let stalled = false, timer, res
  const arm = () => { clearTimeout(timer); timer = setTimeout(() => { stalled = true; ctl.abort() }, stallMs) }
  const meter = makeSpeedMeter()
  try {
    arm()
    res = await fetchFn(url, { signal: ctl.signal, cache: 'no-store' })
    if (!res.ok) throw new VoskError('http', { status: res.status })
    if (/text\/html/i.test(res.headers.get('content-type') || '')) throw new VoskError('html')
    // Content-Encoding: браузер сам распаковал тело — его длина не равна Content-Length, сверка бессмысленна
    const len = res.headers.get('content-encoding') ? 0 : Number(res.headers.get('content-length'))
    const total = len > 0 ? len : null
    const reader = res.body.getReader()
    const chunks = []
    let loaded = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      arm()
      chunks.push(value); loaded += value.length
      onProgress?.({ loaded, total, pct: percentOf(loaded, total), speed: meter(now(), loaded) })
    }
    if (!isComplete(loaded, total)) throw new VoskError('incomplete', { detail: total ? `${fmtMb(loaded)} из ${fmtMb(total)}` : 'пустой ответ' })
    return { blob: new Blob(chunks, { type: 'application/gzip' }), size: loaded, total }
  } catch (e) {
    if (signal?.aborted) throw new VoskError('cancelled')
    if (stalled) throw new VoskError('stall')
    if (e instanceof VoskError) throw e
    if (res) throw new VoskError('network') // ответ уже шёл, но тело оборвалось
    // fetch без ответа (TypeError) — CORS или сеть: различаем запросом no-cors
    throw e?.name === 'TypeError' ? await diagnoseFetchFailure(url, { fetchFn }) : e
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

/** Скачать архив: до 3 попыток с паузой (докачки нет — каждая попытка с начала). opts: signal, onProgress, onAttempt(n, err) */
export async function downloadModel(url, opts = {}) {
  const { fetchFn = globalThis.fetch.bind(globalThis), attempts = ATTEMPTS, pauseMs = PAUSE_MS, stallMs = STALL_MS,
    sleep = sleepDefault, now = () => performance.now(), signal, onProgress, onAttempt } = opts
  const t0 = now()
  for (let n = 1; ; n++) {
    try {
      const r = await downloadOnce(url, { fetchFn, signal, onProgress, stallMs, now })
      return { ...r, attempts: n, ms: Math.round(now() - t0) }
    } catch (e) {
      if (!isRetryable(e) || n >= attempts) throw e
      onAttempt?.(n + 1, e)
      await sleep(pauseMs, signal)
    }
  }
}

/** Модель для загрузки в движок: из кеша, иначе (только allowNetwork) скачать, проверить, сохранить.
 *  → { blob, size, from: 'cache'|'network', kind, ms?, attempts?, saveError? } */
export async function getModel(url, opts = {}) {
  const { allowNetwork = false, cachesApi = globalThis.caches } = opts
  const cached = await readCached(url, cachesApi)
  const source = chooseSource(cached, allowNetwork)
  if (source === 'blocked') throw new VoskError('blocked')
  if (source === 'cache') return { blob: cached.blob, size: cached.size, from: 'cache', kind: await archiveKind(cached.blob) }
  const r = await downloadModel(url, opts)
  const kind = await archiveKind(r.blob)
  if (kind === 'html') throw new VoskError('html')
  if (kind === 'unknown') throw new VoskError('format')
  let saveError = null
  try { await saveModel(url, r.blob, cachesApi) } catch (e) { saveError = e } // не влезло в хранилище: работаем с этой копией, но не сохранили
  return { blob: r.blob, size: r.size, from: 'network', kind, ms: r.ms, attempts: r.attempts, saveError }
}
