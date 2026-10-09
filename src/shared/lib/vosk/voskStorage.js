// Хранение модели Vosk на устройстве: Cache Storage (имя кеша vosk-models-v1, ключ = полный URL модели). Без React;
// caches / indexedDB / navigator подставляются — тестируется без браузера. В кеш кладётся только ПОЛНЫЙ ответ.
import { VoskError, isQuotaError } from './voskErrors.js'

export const CACHE_NAME = 'vosk-models-v1'
export const LIB_DB = '/vosk' // база IndexedDB, куда vosk-browser распаковывает модель (имя = точка монтирования IDBFS)

export const cacheAvailable = (c = globalThis.caches) => !!c && typeof c.open === 'function'

/** Ключ кеша: абсолютный URL без #фрагмента */
export function cacheKey(url, base = globalThis.location?.href) {
  try { const u = new URL(url, base); u.hash = ''; return u.href } catch { return String(url) }
}

// Для чтения кеш НЕ создаём (после удаления модели пустой кеш не должен появляться заново); для записи — create
async function openCache(c, create = false) {
  if (!cacheAvailable(c)) return null
  if (!create && typeof c.has === 'function' && !(await c.has(CACHE_NAME))) return null
  return c.open(CACHE_NAME)
}

/** Быстрый статус без чтения тела: { size, savedAt } либо null */
export async function peekCached(url, cachesApi = globalThis.caches) {
  try {
    const cache = await openCache(cachesApi)
    const r = cache && await cache.match(cacheKey(url))
    if (!r) return null
    return { size: Number(r.headers.get('x-vosk-size')) || null, savedAt: Number(r.headers.get('x-vosk-saved')) || null }
  } catch { return null }
}

/** Модель из кеша целиком: { blob, size } либо null. Размер тела не совпал с записанным — запись битая, удаляем */
export async function readCached(url, cachesApi = globalThis.caches) {
  try {
    const cache = await openCache(cachesApi)
    if (!cache) return null
    const key = cacheKey(url)
    const r = await cache.match(key)
    if (!r) return null
    const blob = await r.blob()
    const want = Number(r.headers.get('x-vosk-size')) || 0
    if (!blob.size || (want && blob.size !== want)) { await cache.delete(key); return null }
    return { blob, size: blob.size }
  } catch { return null }
}

/** Сохранить полную модель. Нет места → VoskError('quota'); недоделанная запись удаляется */
export async function saveModel(url, blob, cachesApi = globalThis.caches) {
  const cache = await openCache(cachesApi, true)
  if (!cache) throw new VoskError('nocache')
  const key = cacheKey(url)
  const headers = {
    'content-type': 'application/gzip', 'content-length': String(blob.size),
    'x-vosk-size': String(blob.size), 'x-vosk-saved': String(Date.now()),
  }
  try {
    await cache.put(key, new Response(blob, { headers }))
  } catch (e) {
    try { await cache.delete(key) } catch { /* нечего чистить */ }
    throw isQuotaError(e) ? new VoskError('quota') : e
  }
}

/** Удалить базу IndexedDB, куда библиотека распаковала модель (иначе каждая загрузка оставляла бы лишние ≈70 МБ).
 *  Вызывать, когда движок остановлен. 'ok' | 'timeout' | 'error' | 'none' */
export function deleteLibraryStore(idb = globalThis.indexedDB, timeoutMs = 4000) {
  return new Promise(resolve => {
    if (!idb?.deleteDatabase) return resolve('none')
    let done = false
    const end = r => { if (!done) { done = true; clearTimeout(timer); resolve(r) } }
    const timer = setTimeout(() => end('timeout'), timeoutMs) // blocked: запрос выполнится сам, когда воркер закроет базу
    try {
      const req = idb.deleteDatabase(LIB_DB)
      req.onsuccess = () => end('ok')
      req.onerror = () => end('error')
    } catch { end('error') }
  })
}

/** Удалить модель с устройства: кеш архива + распакованная копия библиотеки */
export async function deleteModel(cachesApi = globalThis.caches, idb = globalThis.indexedDB) {
  let removed = false
  try { removed = cacheAvailable(cachesApi) ? await cachesApi.delete(CACHE_NAME) : false } catch { /* кеша нет */ }
  await deleteLibraryStore(idb)
  return removed
}

/** Занято / квота хранилища сайта: { usage, quota, persisted } (что недоступно — null) */
export async function storageInfo(nav = globalThis.navigator) {
  const out = { usage: null, quota: null, persisted: null }
  try { const e = await nav.storage.estimate(); out.usage = e.usage ?? null; out.quota = e.quota ?? null } catch { /* не поддерживается */ }
  try { out.persisted = await nav.storage.persisted() } catch { /* не поддерживается */ }
  return out
}

/** «Закрепить хранилище»: { supported, granted } */
export async function requestPersist(nav = globalThis.navigator) {
  if (typeof nav?.storage?.persist !== 'function') return { supported: false, granted: false }
  try { return { supported: true, granted: !!(await nav.storage.persist()) } } catch { return { supported: true, granted: false } }
}
