import { describe, it, expect, vi } from 'vitest'
import { createSceneAudioCache, prefetchAllowed } from './sceneAudioCache.js'

// Поддельный fetch: ответы по ссылке — { ok, size } или 'fail'; завершаются вручную
function fakeNet() {
  const pending = []
  const fetchFn = vi.fn(url => new Promise((resolve, reject) => pending.push({ url, resolve, reject })))
  const done = (url, { ok = true, size = 150_000 } = {}) => {
    const k = pending.findIndex(p => p.url === url); if (k < 0) throw new Error(`нет запроса ${url}`)
    const p = pending.splice(k, 1)[0]
    if (ok === 'throw') p.reject(new Error('net')); else p.resolve({ ok, status: ok ? 200 : 404, blob: async () => ({ size }) })
  }
  return { fetchFn, done, inflight: () => pending.map(p => p.url) }
}
const flush = () => new Promise(r => setTimeout(r, 0))
let n = 0
const mk = (net, limits) => createSceneAudioCache({
  fetchFn: net.fetchFn, createUrl: () => `blob:${++n}`, revokeUrl: vi.fn(), busy: () => () => {}, limits,
})

describe('sceneAudioCache — подкачка озвучки сцен', () => {
  it('prefetch качает и отдаёт blob через resolve; повторно ту же ссылку не качает', async () => {
    const net = fakeNet(); const c = mk(net)
    expect(c.prefetch('https://r2/a.mp3')).toBe(true)
    expect(c.prefetch('https://r2/a.mp3')).toBe(false)
    expect(c.resolve('https://r2/a.mp3')).toBeNull()
    net.done('https://r2/a.mp3'); await flush()
    expect(c.resolve('https://r2/a.mp3')).toBe('blob:1')
    expect(c.prefetch('https://r2/a.mp3')).toBe(false)
    expect(net.fetchFn).toHaveBeenCalledTimes(1)
  })

  it('неудача (404 / сеть) запоминается — второй раз не пробуем; мусорные ссылки игнор', async () => {
    const net = fakeNet(); const c = mk(net)
    c.prefetch('https://r2/404.mp3'); net.done('https://r2/404.mp3', { ok: false }); await flush()
    c.prefetch('https://r2/x.mp3'); net.done('https://r2/x.mp3', { ok: 'throw' }); await flush()
    expect(c.hasFailed('https://r2/404.mp3')).toBe(true)
    expect(c.prefetch('https://r2/404.mp3')).toBe(false)
    expect(c.prefetch('https://r2/x.mp3')).toBe(false)
    expect(c.prefetch('blob:1')).toBe(false)
    expect(c.prefetch(null)).toBe(false)
    expect(net.fetchFn).toHaveBeenCalledTimes(2)
  })

  it('параллельно не больше CONCURRENCY, срочные — в голову очереди, light — в хвост', async () => {
    const net = fakeNet(); const c = mk(net, { concurrency: 1 })
    c.prefetch('https://r2/1.mp3')
    c.prefetch('https://r2/light.mp3', { light: true })
    c.prefetch('https://r2/2.mp3')
    expect(net.inflight()).toEqual(['https://r2/1.mp3'])
    net.done('https://r2/1.mp3'); await flush()
    expect(net.inflight()).toEqual(['https://r2/2.mp3'])
    net.done('https://r2/2.mp3'); await flush()
    expect(net.inflight()).toEqual(['https://r2/light.mp3'])
  })

  it('лимиты: самые давние по обращению вытесняются (revoke), играющий (pin) — нет, большой файл не хранится', async () => {
    const net = fakeNet()
    const revokeUrl = vi.fn()
    const c = createSceneAudioCache({ fetchFn: net.fetchFn, createUrl: () => `blob:${++n}`, revokeUrl, busy: () => () => {}, limits: { maxEntries: 2, maxBytes: 10_000_000, maxFile: 500_000 } })
    for (const u of ['a', 'b']) { c.prefetch(`https://r2/${u}`); net.done(`https://r2/${u}`); await flush() }
    c.pin('https://r2/a')
    c.prefetch('https://r2/c'); net.done('https://r2/c'); await flush()
    expect(c.has('https://r2/a')).toBe(true)   // pinned
    expect(c.has('https://r2/b')).toBe(false)  // вытеснен
    expect(revokeUrl).toHaveBeenCalledTimes(1)
    c.pin(null)
    c.resolve('https://r2/a') // «только что нужен» → теперь давний — c
    c.prefetch('https://r2/d'); net.done('https://r2/d'); await flush()
    expect(c.has('https://r2/c')).toBe(false)
    expect(c.has('https://r2/a')).toBe(true)
    c.prefetch('https://r2/big'); net.done('https://r2/big', { size: 900_000 }); await flush()
    expect(c.has('https://r2/big')).toBe(false)
    expect(c.stats().entries).toBe(2)
    c.clear()
    expect(c.stats()).toEqual({ entries: 0, bytes: 0, inflight: 0, queued: 0 })
  })

  it('байтовый лимит тоже вытесняет', async () => {
    const net = fakeNet(); const c = mk(net, { maxEntries: 10, maxBytes: 250_000 })
    c.prefetch('https://r2/a'); net.done('https://r2/a', { size: 150_000 }); await flush()
    c.prefetch('https://r2/b'); net.done('https://r2/b', { size: 150_000 }); await flush()
    expect(c.has('https://r2/a')).toBe(false)
    expect(c.stats().bytes).toBe(150_000)
  })

  it('prefetchAllowed: экономия трафика и 2g — нет; без Network Information API — да', () => {
    expect(prefetchAllowed(null)).toBe(true)
    expect(prefetchAllowed({ effectiveType: '4g' })).toBe(true)
    expect(prefetchAllowed({ saveData: true, effectiveType: '4g' })).toBe(false)
    expect(prefetchAllowed({ effectiveType: '2g' })).toBe(false)
    expect(prefetchAllowed({ effectiveType: 'slow-2g' })).toBe(false)
    expect(prefetchAllowed({ effectiveType: '3g' })).toBe(true)
  })
})
