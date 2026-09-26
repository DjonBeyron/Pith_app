import { describe, it, expect, vi, beforeEach } from 'vitest'

// Загрузка одного файла прогрева (вынесена из usePlayerPreload.js): сеть,
// постеры и разбор звука подменены — проверяем, что публикуется, что
// считается готовым и что зовётся дальше
vi.mock('./preloadFetch.js', () => ({ fetchBlobWithRetry: vi.fn() }))
vi.mock('./posterQueue.js', () => ({ enqueuePosterCapture: vi.fn() }))
vi.mock('../../shared/lib/audioUtils.js', () => ({
  probeAudioDuration: vi.fn(async () => 1.5), analyzeWaveform: vi.fn(async () => [1, 2]),
}))
const { fetchBlobWithRetry } = await import('./preloadFetch.js')
const { enqueuePosterCapture } = await import('./posterQueue.js')
const { makePreloadFetch, EVICT_TYPES, POSTER_TYPES } = await import('./preloadFetchOne.js')

let n = 0
beforeEach(() => {
  vi.clearAllMocks()
  globalThis.URL.createObjectURL = () => `blob:test/${++n}`
  globalThis.URL.revokeObjectURL = () => {}
})

function ctx(overrides = {}) {
  let blobMap = {}
  let ready = new Set()
  const c = {
    genRef: { current: 1 }, blobUrlsRef: { current: {} },
    setBlobMap: fn => { blobMap = fn(blobMap) }, getBlobMap: () => blobMap,
    setReadyNodeIds: fn => { ready = fn(ready) }, getReady: () => ready,
    inFlightRef: { current: 0 }, debugItemsRef: { current: new Map() },
    bytesLoadedRef: { current: new Map() }, bytesTotalRef: { current: new Map() },
    tick: vi.fn(), throttledTick: vi.fn(), markFailed: vi.fn(),
    ts: () => '+0.0', checkNodeReady: () => true, evictFarthestIfNeeded: vi.fn(async () => {}), pump: vi.fn(),
    ...overrides,
  }
  return c
}
const item = (nodeType, id = 'f1') => ({ id, url: 'http://x/f', nodeType, nodeSeq: 2, nodeId: 'n1', size: 10 })
const flush = () => new Promise(r => setTimeout(r, 0))

describe('загрузка файла прогрева', () => {
  it('успех: blob опубликован, слот освобождён, очередь качает дальше, нода готова', async () => {
    fetchBlobWithRetry.mockResolvedValue({ blob: new Blob(['x']), httpStatus: 200 })
    const c = ctx()
    await makePreloadFetch(c)(item('photo'), 1)
    expect(c.blobUrlsRef.current.f1.blobUrl).toMatch(/^blob:/)
    expect(c.getBlobMap().f1.blobUrl).toBe(c.blobUrlsRef.current.f1.blobUrl)
    expect(c.inFlightRef.current).toBe(0)
    expect(c.pump).toHaveBeenCalledWith(1)
    expect(c.getReady().has('n1')).toBe(true)
    expect(c.debugItemsRef.current.get('2_f1').status).toBe('ready')
  })

  it('голосовое: после скачивания разбирается длительность и волна (metaDone)', async () => {
    fetchBlobWithRetry.mockResolvedValue({ blob: new Blob(['x']), httpStatus: 200 })
    const c = ctx()
    await makePreloadFetch(c)(item('audio'), 1)
    await flush()
    expect(c.getBlobMap().f1).toMatchObject({ duration: 1.5, waveformData: [1, 2], metaDone: true })
    expect(c.evictFarthestIfNeeded).toHaveBeenCalledWith(1, 'f1') // audio — выгружаемый тип
  })

  it('ошибка сети: файл помечен сбойным, нода всё равно «готова», очередь идёт', async () => {
    fetchBlobWithRetry.mockRejectedValue(Object.assign(new Error('boom'), { httpStatus: 503 }))
    const c = ctx()
    await makePreloadFetch(c)(item('photo'), 1)
    expect(c.blobUrlsRef.current.f1).toEqual({ blobUrl: null, error: true })
    expect(c.markFailed).toHaveBeenCalledWith('f1', 10)
    expect(c.getReady().has('n1')).toBe(true)
    expect(c.pump).toHaveBeenCalledWith(1)
    expect(c.inFlightRef.current).toBe(0)
  })

  it('поколение сменилось за время скачивания — ничего не публикуем', async () => {
    const c = ctx()
    fetchBlobWithRetry.mockImplementation(async () => { c.genRef.current = 2; return { blob: new Blob(['x']) } })
    await makePreloadFetch(c)(item('photo'), 1)
    expect(c.blobUrlsRef.current).toEqual({})
    expect(c.pump).not.toHaveBeenCalled()
  })

  it('видео: постер снимается в фоне и дописывается к записи', async () => {
    fetchBlobWithRetry.mockResolvedValue({ blob: new Blob(['x']), httpStatus: 200 })
    const c = ctx()
    await makePreloadFetch(c)(item('video'), 1)
    expect(enqueuePosterCapture).toHaveBeenCalledTimes(1)
    enqueuePosterCapture.mock.calls[0][1]('blob:poster')
    expect(c.getBlobMap().f1.posterUrl).toBe('blob:poster')
  })

  it('наборы типов не разъехались с прогревом', () => {
    expect([...POSTER_TYPES]).toEqual(['video', 'circle', 'sticker'])
    expect(EVICT_TYPES.has('photo')).toBe(false)
  })
})
