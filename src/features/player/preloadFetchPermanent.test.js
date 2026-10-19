import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchBlobWithRetry, isPermanentHttp } from './preloadFetch.js'

// Файла нет (404) — повторять нечего: раньше 3 попытки с паузами 1,2 + 2,4 с держали карточку запуска на «почти готово»
describe('предзагрузка: постоянные ошибки HTTP не повторяются', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('какие коды постоянные', () => {
    for (const s of [400, 401, 403, 404, 410]) expect(isPermanentHttp(s), String(s)).toBe(true)
    for (const s of [408, 425, 429, 500, 502, 503, undefined]) expect(isPermanentHttp(s), String(s)).toBe(false)
  })

  it('404 → одна попытка и сразу отказ', async () => {
    const fetchFn = vi.fn(async () => ({ ok: false, status: 404 }))
    vi.stubGlobal('fetch', fetchFn)
    const t0 = Date.now()
    await expect(fetchBlobWithRetry('https://r2.test/x.mp3', { onProgress() {}, isAlive: () => true })).rejects.toMatchObject({ httpStatus: 404 })
    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(Date.now() - t0).toBeLessThan(500)
  })

  it('503 повторяется (до трёх попыток)', async () => {
    vi.useFakeTimers()
    const fetchFn = vi.fn(async () => ({ ok: false, status: 503 }))
    vi.stubGlobal('fetch', fetchFn)
    const p = fetchBlobWithRetry('https://r2.test/x.mp3', { onProgress() {}, isAlive: () => true }).catch(e => e)
    await vi.advanceTimersByTimeAsync(10_000)
    expect((await p).httpStatus).toBe(503)
    expect(fetchFn).toHaveBeenCalledTimes(3)
    vi.useRealTimers()
  })
})
