// Куски модели для докачки: фоновая загрузка кладёт каждый Range-кусок отдельной записью в Cache Storage (имя vosk-parts-v1) —
// iOS может выгрузить приложение посреди скачивания, после возврата продолжаем с первого недостающего куска.
// Когда все куски на месте, они собираются в один Blob и кладутся под обычным ключом (voskStorage.saveModel), куски удаляются.
// Без React; caches подставляется — тестируется без браузера.
import { VoskError, isQuotaError } from './voskErrors.js'
import { cacheAvailable, cacheKey } from './voskStorage.js'
import { chunkCount, chunkRange } from './voskBgPolicy.js'

export const PARTS_CACHE = 'vosk-parts-v1'

const keyOf = (url, tag) => `${cacheKey(url)}${url.includes('?') ? '&' : '?'}vosk-part=${tag}`

async function open(c, create) {
  if (!cacheAvailable(c)) return null
  if (!create && typeof c.has === 'function' && !(await c.has(PARTS_CACHE))) return null
  return c.open(PARTS_CACHE)
}

/** Описание загрузки: { total, chunk, lastModified } либо null (ещё не начинали / повреждено) */
export async function readMeta(url, c = globalThis.caches) {
  try {
    const cache = await open(c)
    const r = cache && await cache.match(keyOf(url, 'meta'))
    if (!r) return null
    const m = await r.json()
    return m?.total > 0 && m?.chunk > 0 ? { total: m.total, chunk: m.chunk, lastModified: m.lastModified ?? null } : null
  } catch { return null }
}

async function put(cache, key, body, headers) {
  try { await cache.put(key, new Response(body, { headers })) } catch (e) {
    try { await cache.delete(key) } catch { /* нечего чистить */ }
    throw isQuotaError(e) ? new VoskError('quota') : e
  }
}

export async function writeMeta(url, meta, c = globalThis.caches) {
  const cache = await open(c, true)
  if (!cache) throw new VoskError('nocache')
  await put(cache, keyOf(url, 'meta'), JSON.stringify(meta), { 'content-type': 'application/json' })
}

/** Сохранить кусок i (Blob). Нет места → VoskError('quota') */
export async function putPart(url, i, blob, c = globalThis.caches) {
  const cache = await open(c, true)
  if (!cache) throw new VoskError('nocache')
  await put(cache, keyOf(url, i), blob, { 'content-type': 'application/octet-stream', 'x-part-size': String(blob.size) })
}

/** Что уже скачано: { next (индекс первого недостающего куска), loaded (байт в целых кусках), done (все на месте) }. Кусок неверного размера = нет */
export async function scanParts(url, meta, c = globalThis.caches) {
  const count = chunkCount(meta.total, meta.chunk)
  let loaded = 0, i = 0
  try {
    const cache = await open(c)
    for (; cache && i < count; i++) {
      const r = await cache.match(keyOf(url, i))
      if (!r || Number(r.headers.get('x-part-size')) !== chunkRange(i, meta.total, meta.chunk).size) break
      loaded += chunkRange(i, meta.total, meta.chunk).size
    }
  } catch { /* читать нечего — начинаем с места, где остановились */ }
  return { next: i, loaded, done: i >= count }
}

/** Собрать модель из кусков: Blob нужного размера либо null (чего-то не хватает или размер не сошёлся) */
export async function assembleParts(url, meta, c = globalThis.caches) {
  const cache = await open(c)
  if (!cache) return null
  const count = chunkCount(meta.total, meta.chunk)
  const blobs = []
  for (let i = 0; i < count; i++) {
    const r = await cache.match(keyOf(url, i))
    if (!r) return null
    blobs.push(await r.blob())
  }
  const out = new Blob(blobs, { type: 'application/gzip' })
  return out.size === meta.total ? out : null
}

/** Удалить все куски (и описание) — для любого адреса: кеш vosk-parts-v1 целиком */
export async function clearParts(c = globalThis.caches) {
  try { return cacheAvailable(c) ? await c.delete(PARTS_CACHE) : false } catch { return false }
}
