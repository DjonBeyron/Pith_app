import { begin as beginNetBusy } from '../../../shared/lib/netBusy.js'

// Подкачка файлов озвучки сцен (mp3 реплики ~100–200 КБ) заранее — чтобы
// реплика начиналась без ожидания сети: fetch → Blob → blob-URL в маленьком
// LRU (общий для ленты и ноды урока). Прогретый <audio> (sceneAudioUnlock.js)
// нельзя заставить предзагружать следующий файл, пока играет текущий, — зато
// ему можно подставить blob-URL: разрешение на звук остаётся при элементе.
//  · prefetch(url): не чаще одного раза на ссылку за жизнь кэша (неудача
//    запоминается — повтор сделает сам <audio> прямой ссылкой при игре);
//  · параллельно — CONCURRENCY загрузок, остальное в очереди (light — в хвост);
//  · лимиты MAX_ENTRIES / MAX_BYTES, вытеснение самых давних по обращению,
//    играющий сейчас (pin) не вытесняется; файл больше MAX_FILE не храним;
//  · prefetchAllowed(connection): экономия трафика / 2g → ничего не качаем;
//  · на время загрузки сеть «занята» (netBusy.js) — фоновая модель Vosk ждёт.
// Чистая фабрика с инъекциями для тестов; sceneAudioCache — общий экземпляр.

export const MAX_ENTRIES = 10
export const MAX_BYTES = 3 * 1024 * 1024
export const MAX_FILE = 700 * 1024
export const CONCURRENCY = 2

export function prefetchAllowed(conn = (typeof navigator !== 'undefined' ? navigator.connection : null)) {
  if (!conn) return true
  if (conn.saveData) return false
  return conn.effectiveType !== 'slow-2g' && conn.effectiveType !== '2g'
}

export function createSceneAudioCache({
  fetchFn = (...a) => globalThis.fetch(...a),
  createUrl = b => URL.createObjectURL(b),
  revokeUrl = u => URL.revokeObjectURL(u),
  busy = beginNetBusy,
  limits = {},
} = {}) {
  const maxEntries = limits.maxEntries ?? MAX_ENTRIES
  const maxBytes = limits.maxBytes ?? MAX_BYTES
  const maxFile = limits.maxFile ?? MAX_FILE
  const concurrency = limits.concurrency ?? CONCURRENCY
  const entries = new Map() // url → { blobUrl, bytes } (порядок = давность)
  const failed = new Set()
  const inflight = new Set()
  const queue = []
  let pinned = null
  let bytes = 0

  function evict() {
    for (const [url, e] of entries) {
      if (entries.size <= maxEntries && bytes <= maxBytes) break
      if (url === pinned) continue
      entries.delete(url)
      bytes -= e.bytes
      revokeUrl(e.blobUrl)
    }
  }

  async function load(url) {
    inflight.add(url)
    const end = busy()
    try {
      const res = await fetchFn(url)
      if (!res?.ok) throw new Error(`HTTP ${res?.status}`)
      const blob = await res.blob()
      if (blob.size > maxFile) return
      if (entries.has(url)) return
      entries.set(url, { blobUrl: createUrl(blob), bytes: blob.size })
      bytes += blob.size
      evict()
    } catch {
      failed.add(url)
    } finally {
      end()
      inflight.delete(url)
      pump()
    }
  }

  function pump() {
    while (inflight.size < concurrency && queue.length) {
      const url = queue.shift()
      if (!entries.has(url) && !inflight.has(url) && !failed.has(url)) load(url)
    }
  }

  return {
    // light — не срочно (первая реплика соседнего слайда): в хвост очереди
    prefetch(url, { light = false } = {}) {
      if (!url || typeof url !== 'string' || !/^https?:\/\//.test(url)) return false
      if (entries.has(url) || inflight.has(url) || failed.has(url) || queue.includes(url)) return false
      if (light) queue.push(url); else queue.unshift(url)
      pump()
      return true
    },
    // blob-URL прогретого файла (и отметка «только что нужен» для LRU) либо null
    resolve(url) {
      const e = entries.get(url)
      if (!e) return null
      entries.delete(url); entries.set(url, e)
      return e.blobUrl
    },
    pin(url) { pinned = url ?? null },
    has: url => entries.has(url),
    hasFailed: url => failed.has(url),
    stats: () => ({ entries: entries.size, bytes, inflight: inflight.size, queued: queue.length }),
    clear() {
      for (const e of entries.values()) revokeUrl(e.blobUrl)
      entries.clear(); failed.clear(); queue.length = 0; bytes = 0; pinned = null
    },
  }
}

export const sceneAudioCache = createSceneAudioCache()
