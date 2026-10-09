import { describe, it, expect, vi } from 'vitest'
import { fakeCaches, gzBytes, rangeServer, hangingFetch } from './voskTestKit.js'
import { backgroundDownload } from './voskBgDownload.js'
import { PARTS_CACHE, readMeta, scanParts, assembleParts, putPart, writeMeta } from './voskParts.js'
import { CACHE_NAME, peekCached, readCached } from './voskStorage.js'

const URL1 = 'https://models.example.com/vosk.tar.gz'
const bytes = gzBytes(100) // 4 куска по 30 байт: 30+30+30+10

function mkCtx(over = {}) {
  const watchers = new Set()
  const ctx = {
    fetchFn: rangeServer(bytes), cachesApi: fakeCaches(), signal: new AbortController().signal, chunkBytes: 30, stallMs: 500,
    gate: vi.fn(async () => {}), pause: vi.fn(async () => {}), watchBusy: cb => { watchers.add(cb); return () => watchers.delete(cb) },
    shouldYield: () => false, onProgress: vi.fn(), log: vi.fn(), ...over,
  }
  ctx.fire = () => watchers.forEach(cb => cb())
  return ctx
}
const cachedBytes = async c => new Uint8Array(await (await readCached(URL1, c)).blob.arrayBuffer())

describe('фоновая загрузка кусками Range', () => {
  it('режет на куски по 2 запросам Range, собирает модель под обычным ключом и чистит куски', async () => {
    const ctx = mkCtx()
    const r = await backgroundDownload(URL1, ctx)
    expect(r).toMatchObject({ size: 100, kind: 'gzip', mode: 'range' })
    expect(ctx.fetchFn.calls.map(c => c.range)).toEqual(['bytes=0-29', 'bytes=30-59', 'bytes=60-89', 'bytes=90-99'])
    expect(await cachedBytes(ctx.cachesApi)).toEqual(bytes)
    expect((await peekCached(URL1, ctx.cachesApi)).size).toBe(100)
    expect(ctx.cachesApi.has(PARTS_CACHE)).toBe(false) // куски убраны
    expect(ctx.cachesApi.has(CACHE_NAME)).toBe(true)
  })
  it('перед каждым куском ждёт тишины (gate), между кусками — пауза; прогресс растёт до 100%', async () => {
    const ctx = mkCtx()
    await backgroundDownload(URL1, ctx)
    expect(ctx.gate).toHaveBeenCalledTimes(4)
    expect(ctx.pause).toHaveBeenCalledTimes(3)
    const loaded = ctx.onProgress.mock.calls.map(([p]) => p.loaded)
    expect(loaded).toEqual([30, 60, 90, 100])
    expect(ctx.onProgress.mock.calls.at(-1)[0]).toMatchObject({ total: 100, mode: 'range' })
  })
  it('обрыв посреди файла → докачка с места разрыва: уже скачанные куски не запрашиваются', async () => {
    const cachesApi = fakeCaches()
    let n = 0
    const server = rangeServer(bytes)
    const flaky = (u, i) => (++n > 2 ? Promise.reject(new TypeError('Failed to fetch')) : server(u, i))
    await expect(backgroundDownload(URL1, mkCtx({ cachesApi, fetchFn: flaky }))).rejects.toMatchObject({ code: 'network' })
    expect(await peekCached(URL1, cachesApi)).toBeNull() // целой модели ещё нет
    const meta = await readMeta(URL1, cachesApi)
    expect(meta).toMatchObject({ total: 100, chunk: 30 })
    expect(await scanParts(URL1, meta, cachesApi)).toEqual({ next: 2, loaded: 60, done: false })

    const second = mkCtx({ cachesApi }) // «приложение запустили заново»
    const r = await backgroundDownload(URL1, second)
    expect(r.mode).toBe('parts')
    expect(second.fetchFn.calls.map(c => c.range)).toEqual(['bytes=60-89', 'bytes=90-99'])
    expect(await cachedBytes(cachesApi)).toEqual(bytes)
  })
  it('Content-Range скрыт от страницы (нет ExposeHeaders) — полный размер берём из Content-Length ответа на HEAD', async () => {
    const ctx = mkCtx({ fetchFn: rangeServer(bytes, { exposeRange: false }) })
    const r = await backgroundDownload(URL1, ctx)
    expect(r.mode).toBe('range')
    expect(ctx.fetchFn.calls.filter(c => c.method === 'HEAD')).toHaveLength(1)
    expect(await cachedBytes(ctx.cachesApi)).toEqual(bytes)
  })
  it('Content-Range скрыт и HEAD не отвечает — размер неизвестен, качаем целиком', async () => {
    const ctx = mkCtx({ fetchFn: rangeServer(bytes, { exposeRange: false, head: false }) })
    const r = await backgroundDownload(URL1, ctx)
    expect(r.mode).toBe('full')
    expect(await cachedBytes(ctx.cachesApi)).toEqual(bytes)
  })
  it('сервер не поддерживает Range (200 на любой запрос) — запасной путь: обычная полная загрузка', async () => {
    const ctx = mkCtx({ fetchFn: rangeServer(bytes, { range: false }) })
    const r = await backgroundDownload(URL1, ctx)
    expect(r).toMatchObject({ mode: 'full', size: 100 })
    expect(ctx.fetchFn.calls.map(c => c.range)).toEqual(['bytes=0-29', null]) // проба + одна полная загрузка
    expect(ctx.log).toHaveBeenCalled()
    expect(await cachedBytes(ctx.cachesApi)).toEqual(bytes)
    expect(ctx.cachesApi.has(PARTS_CACHE)).toBe(false)
    expect(ctx.onProgress.mock.calls.at(-1)[0]).toMatchObject({ mode: 'full', loaded: 100 })
  })
  it('полная загрузка тоже ждёт тишины и при занятости обрывается, потом начинается заново', async () => {
    const fetches = []
    const server = rangeServer(bytes, { range: false })
    let ctx
    ctx = mkCtx({
      fetchFn: (u, i) => {
        fetches.push(i.headers?.Range ?? 'full')
        if (fetches.length === 2) { setTimeout(() => { ctx.shouldYield = () => true; ctx.fire() }, 5); return hangingFetch()(u, i) } // вторая — полная загрузка, зависла
        return server(u, i)
      },
    })
    const r = await backgroundDownload(URL1, ctx)
    expect(r.mode).toBe('full')
    expect(fetches).toEqual(['bytes=0-29', 'full', 'full'])
    expect(ctx.gate.mock.calls.length).toBeGreaterThanOrEqual(3) // проба, полная, повтор полной
  })
  it('стало занято посреди куска — кусок бросаем, ждём gate и повторяем тот же кусок; ошибкой это не считается', async () => {
    const server = rangeServer(bytes)
    const ranges = []
    let ctx
    ctx = mkCtx({
      fetchFn: (u, i) => {
        ranges.push(i.headers.Range)
        if (ranges.length === 2) { setTimeout(() => { ctx.shouldYield = () => true; ctx.fire() }, 5); return hangingFetch()(u, i) }
        ctx.shouldYield = () => false
        return server(u, i)
      },
    })
    const r = await backgroundDownload(URL1, ctx)
    expect(r.size).toBe(100)
    expect(ranges).toEqual(['bytes=0-29', 'bytes=30-59', 'bytes=30-59', 'bytes=60-89', 'bytes=90-99'])
    expect(await cachedBytes(ctx.cachesApi)).toEqual(bytes)
  })
  it('сигнал «не мешать» без реальной занятости (shouldYield=false) кусок не обрывает', async () => {
    const ctx = mkCtx()
    const p = backgroundDownload(URL1, ctx)
    ctx.fire()
    await expect(p).resolves.toMatchObject({ size: 100 })
    expect(ctx.fetchFn.calls).toHaveLength(4)
  })
  it('кусок завис — сторож: ошибка stall (повторяемая)', async () => {
    const ctx = mkCtx({ fetchFn: hangingFetch(), stallMs: 20 })
    await expect(backgroundDownload(URL1, ctx)).rejects.toMatchObject({ code: 'stall' })
  })
  it('отмена (стоп / закрытие) — ошибка cancelled, куски остаются для докачки', async () => {
    const cachesApi = fakeCaches()
    const ctl = new AbortController()
    const server = rangeServer(bytes)
    const ctx = mkCtx({ cachesApi, signal: ctl.signal, fetchFn: (u, i) => { if (server.calls.length === 1) ctl.abort(); return server(u, i) } })
    await expect(backgroundDownload(URL1, ctx)).rejects.toMatchObject({ code: 'cancelled' })
    expect((await readMeta(URL1, cachesApi))?.total).toBe(100)
  })
  it('файл на сервере подменили между кусками — куски выбрасываем, ошибка changed (повторяемая)', async () => {
    const cachesApi = fakeCaches()
    const ctx = mkCtx({ cachesApi, fetchFn: rangeServer(bytes, { lastModified: n => (n < 2 ? 'Mon, 01 Jan 2026 00:00:00 GMT' : 'Tue, 02 Feb 2027 00:00:00 GMT') }) })
    await expect(backgroundDownload(URL1, ctx)).rejects.toMatchObject({ code: 'changed' })
    expect(cachesApi.has(PARTS_CACHE)).toBe(false)
  })
  it('сервер отдал веб-страницу, 404, не архив — понятные ошибки; в кэш ничего не попадает', async () => {
    const html = new TextEncoder().encode('<!DOCTYPE html><html>'.padEnd(100, ' '))
    const c1 = mkCtx({ fetchFn: rangeServer(html, { contentType: 'text/html' }) })
    await expect(backgroundDownload(URL1, c1)).rejects.toMatchObject({ code: 'html' })
    const c2 = mkCtx({ fetchFn: async () => new Response('nope', { status: 404 }) })
    await expect(backgroundDownload(URL1, c2)).rejects.toMatchObject({ code: 'http', status: 404 })
    const junk = new Uint8Array(100).fill(3)
    const c3 = mkCtx({ fetchFn: rangeServer(junk) })
    await expect(backgroundDownload(URL1, c3)).rejects.toMatchObject({ code: 'format' })
    for (const c of [c1, c2, c3]) expect(await peekCached(URL1, c.cachesApi)).toBeNull()
  })
  it('нет места под кусок — quota (без повторов), недописанное удалено', async () => {
    const ctx = mkCtx({ cachesApi: fakeCaches({ putError: Object.assign(new Error('full'), { name: 'QuotaExceededError' }) }) })
    await expect(backgroundDownload(URL1, ctx)).rejects.toMatchObject({ code: 'quota' })
  })
})

describe('куски в Cache Storage', () => {
  it('кусок неверного размера считается отсутствующим; сборка отдаёт Blob нужного размера, а при дыре — null', async () => {
    const c = fakeCaches()
    const meta = { total: 100, chunk: 30, lastModified: null }
    await writeMeta(URL1, meta, c)
    await putPart(URL1, 0, new Blob([bytes.slice(0, 30)]), c)
    await putPart(URL1, 1, new Blob([bytes.slice(30, 55)]), c) // короткий
    expect(await scanParts(URL1, meta, c)).toEqual({ next: 1, loaded: 30, done: false })
    expect(await assembleParts(URL1, meta, c)).toBeNull()
    await putPart(URL1, 1, new Blob([bytes.slice(30, 60)]), c)
    await putPart(URL1, 2, new Blob([bytes.slice(60, 90)]), c)
    await putPart(URL1, 3, new Blob([bytes.slice(90, 100)]), c)
    expect(await scanParts(URL1, meta, c)).toEqual({ next: 4, loaded: 100, done: true })
    const whole = await assembleParts(URL1, meta, c)
    expect(new Uint8Array(await whole.arrayBuffer())).toEqual(bytes)
  })
  it('кеша нет (http) — не падаем при чтении, при записи понятная ошибка', async () => {
    expect(await readMeta(URL1, undefined)).toBeNull()
    expect(await scanParts(URL1, { total: 100, chunk: 30 }, undefined)).toMatchObject({ next: 0, done: false })
    await expect(putPart(URL1, 0, new Blob(['x']), undefined)).rejects.toMatchObject({ code: 'nocache' })
  })
})
