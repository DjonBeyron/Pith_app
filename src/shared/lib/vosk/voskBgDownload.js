// Тихое скачивание модели кусками HTTP Range (по 2 МБ) с докачкой: куски лежат в Cache Storage (voskParts.js), после обрыва
// (iOS выгрузил приложение, пропала сеть) продолжаем с первого недостающего. Перед КАЖДЫМ куском ctx.gate() ждёт «тишины»
// (лента / видео / загрузка файлов урока / фон / офлайн), между кусками — короткая пауза. Если во время куска стало занято —
// кусок бросаем и повторяем позже (на попытки это не влияет). Сервер без Range → обычная полная загрузка (тоже под gate и с отменой при занятости).
// Без React; fetch, кеш и сигналы среды приходят в ctx — тестируется без браузера.
//
// ctx: { fetchFn, cachesApi, signal, gate(), pause(), watchBusy(cb) → unsub, shouldYield(), onProgress({loaded,total,mode}),
//        chunkBytes, stallMs, now, log(msg) }
import { VoskError, diagnoseFetchFailure } from './voskErrors.js'
import { saveModel } from './voskStorage.js'
import { downloadModel, archiveKind } from './voskDownload.js'
import { RangeUnsupported, chunkCount, chunkRange, parseContentRange, CHUNK_BYTES } from './voskBgPolicy.js'
import { readMeta, writeMeta, putPart, scanParts, assembleParts, clearParts } from './voskParts.js'

export const CHUNK_STALL_MS = 60000

const cancelled = () => new VoskError('cancelled')
const cancelBody = res => { try { res.body?.cancel?.() } catch { /* тело уже закрыто */ } }

// Один Range-запрос [start..end] под gate. Бросает RangeUnsupported (сервер отдал 200 / не тот кусок), VoskError (http/stall/network/…).
// Занято во время запроса → запрос обрывается, ждём gate и повторяем тот же кусок.
async function fetchChunk(url, start, end, ctx) {
  for (;;) {
    await ctx.gate()
    const ctl = new AbortController()
    let why = null, res = null
    const link = () => ctl.abort()
    ctx.signal?.addEventListener('abort', link, { once: true })
    const unwatch = ctx.watchBusy(() => { if (ctx.shouldYield()) { why = 'busy'; ctl.abort() } })
    const timer = setTimeout(() => { why = 'stall'; ctl.abort() }, ctx.stallMs ?? CHUNK_STALL_MS)
    try {
      res = await ctx.fetchFn(url, { headers: { Range: `bytes=${start}-${end}` }, signal: ctl.signal, cache: 'no-store' })
      if (res.status === 200) { cancelBody(res); throw new RangeUnsupported('сервер вернул 200 вместо 206') }
      if (res.status !== 206) throw new VoskError('http', { status: res.status })
      if (/text\/html/i.test(res.headers.get('content-type') || '')) throw new VoskError('html')
      if (res.headers.get('content-encoding')) throw new RangeUnsupported('ответ сжат (Content-Encoding)')
      const blob = await res.blob()
      return { blob, range: parseContentRange(res.headers.get('content-range')), lastModified: res.headers.get('last-modified') }
    } catch (e) {
      if (ctx.signal?.aborted) throw cancelled()
      if (why === 'busy') continue
      if (why === 'stall') throw new VoskError('stall')
      if (e instanceof VoskError) throw e
      if (res) throw new VoskError('network')
      throw e?.name === 'TypeError' ? await diagnoseFetchFailure(url, { fetchFn: ctx.fetchFn }) : e
    } finally {
      clearTimeout(timer); unwatch(); ctx.signal?.removeEventListener('abort', link)
    }
  }
}

// Полный размер: из Content-Range; если заголовок не виден странице (нет ExposeHeaders) — из Content-Length ответа на HEAD
async function totalSize(url, first, ctx) {
  if (first.range?.total) return first.range.total
  try {
    const res = await ctx.fetchFn(url, { method: 'HEAD', signal: ctx.signal, cache: 'no-store' })
    const n = res.ok && !res.headers.get('content-encoding') ? Number(res.headers.get('content-length')) : 0
    return n > 0 ? n : null
  } catch { return null }
}

// Первый кусок: заодно узнаём, понимает ли сервер Range и каков полный размер. null → докачки не будет, качаем целиком
async function probe(url, ctx, chunk) {
  let first
  try { first = await fetchChunk(url, 0, chunk - 1, ctx) } catch (e) { if (e instanceof RangeUnsupported) { ctx.log?.(`Range не поддержан: ${e.message}`); return null } throw e }
  const total = await totalSize(url, first, ctx)
  if (!total) { ctx.log?.('полный размер неизвестен (нет Content-Range и Content-Length) — качаем целиком'); return null }
  if (first.blob.size !== Math.min(chunk, total)) throw new VoskError('incomplete', { detail: 'первый кусок неполный' })
  return { meta: { total, chunk, lastModified: first.lastModified }, first: first.blob }
}

async function rangeLoop(url, meta, from, ctx) {
  const { cachesApi, onProgress } = ctx
  const count = chunkCount(meta.total, meta.chunk)
  let { loaded } = await scanParts(url, meta, cachesApi)
  for (let i = from; i < count; i++) {
    const { start, end, size } = chunkRange(i, meta.total, meta.chunk)
    const r = await fetchChunk(url, start, end, ctx)
    // Файл на сервере подменили между кусками — прежние куски негодны
    const changed = (r.range?.total && r.range.total !== meta.total) || (meta.lastModified && r.lastModified && meta.lastModified !== r.lastModified)
    if (changed) { await clearParts(cachesApi); throw new VoskError('changed') }
    if (r.blob.size !== size) throw new VoskError('incomplete', { detail: `кусок ${i + 1} из ${count}` })
    await putPart(url, i, r.blob, cachesApi)
    loaded += size
    onProgress?.({ loaded, total: meta.total, mode: 'range' })
    if (i < count - 1) await ctx.pause()
  }
}

// Обычная загрузка целиком: под gate; стало занято → обрываем и начинаем заново, когда снова тихо (докачки нет)
async function downloadWhole(url, ctx) {
  for (;;) {
    await ctx.gate()
    const ctl = new AbortController()
    let yielded = false
    const link = () => ctl.abort()
    ctx.signal?.addEventListener('abort', link, { once: true })
    const unwatch = ctx.watchBusy(() => { if (ctx.shouldYield()) { yielded = true; ctl.abort() } })
    try {
      const r = await downloadModel(url, { fetchFn: ctx.fetchFn, attempts: 1, signal: ctl.signal, now: ctx.now, onProgress: p => ctx.onProgress?.({ loaded: p.loaded, total: p.total, mode: 'full' }) })
      return r.blob
    } catch (e) {
      if (ctx.signal?.aborted) throw cancelled()
      if (yielded) continue
      throw e
    } finally { unwatch(); ctx.signal?.removeEventListener('abort', link) }
  }
}

async function finish(url, blob, ctx) {
  const kind = await archiveKind(blob)
  if (kind === 'html') throw new VoskError('html')
  if (kind === 'unknown') throw new VoskError('format')
  await saveModel(url, blob, ctx.cachesApi) // нет места → VoskError('quota')
  await clearParts(ctx.cachesApi)
  return { size: blob.size, kind }
}

/** Скачать модель в Cache Storage под обычным ключом (его читает voskStorage/движок). → { size, kind, mode: 'range'|'full'|'parts' } */
export async function backgroundDownload(url, ctx) {
  const { cachesApi } = ctx
  const chunk = ctx.chunkBytes ?? CHUNK_BYTES
  let meta = await readMeta(url, cachesApi)
  let mode = 'parts' // продолжили с уже лежащих кусков
  if (!meta) {
    const p = await probe(url, ctx, chunk)
    if (!p) return { ...(await finish(url, await downloadWhole(url, ctx), ctx)), mode: 'full' }
    meta = p.meta; mode = 'range'
    await writeMeta(url, meta, cachesApi)
    await putPart(url, 0, p.first, cachesApi)
    ctx.onProgress?.({ loaded: p.first.size, total: meta.total, mode })
    if (chunkCount(meta.total, meta.chunk) > 1) await ctx.pause()
  }
  try {
    await rangeLoop(url, meta, (await scanParts(url, meta, cachesApi)).next, ctx)
  } catch (e) {
    // Сервер перестал понимать Range посреди файла: куски бесполезны — качаем целиком
    if (!(e instanceof RangeUnsupported)) throw e
    ctx.log?.(`Range пропал на ходу: ${e.message}`)
    await clearParts(cachesApi)
    return { ...(await finish(url, await downloadWhole(url, ctx), ctx)), mode: 'full' }
  }
  const blob = await assembleParts(url, meta, cachesApi)
  if (!blob) { await clearParts(cachesApi); throw new VoskError('incomplete', { detail: 'куски не сошлись по размеру' }) }
  return { ...(await finish(url, blob, ctx)), mode }
}
