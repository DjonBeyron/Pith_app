import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// «Страховка второго запуска» (v3.3.113): реестр прогрева не считается правдой. Отметка 'fail' (оборванная сворачиванием докачка) и отметка 'ok' без буфера в памяти сбрасываются перед стартом,
// зависшая докачка / декодирование завершаются по таймауту, возврат из фона перепроверяет прогрев карточки.
vi.mock('../../../../shared/lib/gameAudioCtx.js', async orig => ({ ...(await orig()), webAudioOn: () => true }))
const logs = vi.hoisted(() => [])
vi.mock('../../../../shared/lib/debug.js', async orig => ({ ...(await orig()), pLog: (...a) => logs.push(a.join(' ')) }))

const F = await import('./wordLaneFetch.js')
const S = await import('./wordLaneSettled.js')
const { installGameAudioLife, onGameAudioReturn, consumeRewake } = await import('../../../../shared/lib/gameAudioLife.js')

const fileOf = (n = 8000) => ({ numberOfChannels: 1, length: n, sampleRate: 8000, duration: n / 8000, getChannelData: () => Float32Array.from({ length: n }, (_, i) => (i > 800 && i < 4000 ? Math.sin(i / 3) * 0.5 : 0)) })
let fetchImpl
beforeEach(() => {
  logs.length = 0
  fetchImpl = () => Promise.resolve({ ok: true, blob: () => Promise.resolve(new Blob(['x'])) })
  vi.stubGlobal('fetch', (...a) => fetchImpl(...a))
  vi.stubGlobal('window', { OfflineAudioContext: class { decodeAudioData() { return Promise.resolve(fileOf()) } } })
  Blob.prototype.arrayBuffer ??= () => Promise.resolve(new ArrayBuffer(8))
  F.dropBuffers(); F.dropFetched()
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('reviveWarm: реестру прогрева не верим', () => {
  it('отметка fail сбрасывается (иначе ворота открылись бы без данных)', () => {
    S.settle('https://r2/a.mp3', 'fail')
    const r = F.reviveWarm([{ key: 'a', url: 'https://r2/a.mp3' }])
    expect(r).toEqual({ failed: 1, noBuffer: 0, stuck: 0 })
    expect(S.isSettled('https://r2/a.mp3')).toBe(false)
  })
  it('отметка ok без буфера в памяти (Web Audio включён) сбрасывается; с буфером — остаётся', async () => {
    const u = 'https://r2/ok.mp3'
    S.settle(u, 'ok')
    expect(F.reviveWarm([{ key: 'ok', url: u }])).toEqual({ failed: 0, noBuffer: 1, stuck: 0 })
    await F.prefetchWords([{ key: 'ok', url: u }]) // скачали и декодировали заново
    expect(F.bufferOfUrl(u)).not.toBeNull()
    expect(S.isSettled(u)).toBe(true)
    expect(F.reviveWarm([{ key: 'ok', url: u }])).toEqual({ failed: 0, noBuffer: 0, stuck: 0 })
    expect(S.isSettled(u)).toBe(true)
  })
  it('необработанные файлы не трогает', () => {
    expect(F.reviveWarm([{ key: 'n', url: 'https://r2/never.mp3' }])).toEqual({ failed: 0, noBuffer: 0, stuck: 0 })
  })
})

describe('зависший запрос при старте', () => {
  it('скачивание висит дольше STALE_PENDING_MS: страховка бросает его, prefetchWords начинает новый и доводит до буфера', async () => {
    let t = 0 // сдвиг часов относительно performance.now()
    fetchImpl = () => new Promise(() => {}) // запрос завис при сворачивании
    const u = 'https://r2/stuck-start.mp3'
    F.fetchBlob(u).catch(() => {})
    expect(F.reviveWarm([{ key: 's', url: u }], { now: () => performance.now() + t })).toEqual({ failed: 0, noBuffer: 0, stuck: 0 }) // только что начат — не трогаем
    t = F.STALE_PENDING_MS + 100
    expect(F.reviveWarm([{ key: 's', url: u }], { now: () => performance.now() + t })).toEqual({ failed: 0, noBuffer: 0, stuck: 1 })
    fetchImpl = () => Promise.resolve({ ok: true, blob: () => Promise.resolve(new Blob(['x'])) })
    await F.prefetchWords([{ key: 's', url: u }])
    expect(F.bufferOfUrl(u)).not.toBeNull()
  })
})

describe('зависание после сворачивания не держит прогрев вечно', () => {
  it('скачивание, которое не отвечает FETCH_TIMEOUT_MS, — отказ, запись забыта, отметка fail; следующий вызов качает заново', async () => {
    vi.useFakeTimers()
    fetchImpl = () => new Promise(() => {}) // iOS заморозил соединение
    const u = 'https://r2/hang.mp3'
    const p = F.fetchBlob(u).catch(e => e)
    await vi.advanceTimersByTimeAsync(F.FETCH_TIMEOUT_MS + 50)
    expect((await p).message).toContain('скачивание')
    expect(S.settledOf(u)).toBe('fail')
    fetchImpl = () => Promise.resolve({ ok: true, blob: () => Promise.resolve(new Blob(['x'])) })
    await expect(F.fetchBlob(u)).resolves.toBeInstanceOf(Blob)
  })
  it('декодирование, которое не вернулось, освобождает место в очереди замеров: следующие файлы не стоят вечно', async () => {
    vi.useFakeTimers()
    let hang = true
    vi.stubGlobal('window', { OfflineAudioContext: class { decodeAudioData() { return hang ? new Promise(() => {}) : Promise.resolve(fileOf()) } } })
    const blob = new Blob(['x'])
    const stuck = [1, 2, 3].map(i => F.measureSpeech(`https://r2/stuck${i}.mp3`, blob).catch(e => e))
    await vi.advanceTimersByTimeAsync(F.MEASURE_TIMEOUT_MS + 50)
    expect((await Promise.all(stuck)).every(e => e instanceof Error)).toBe(true)
    hang = false
    const ok = F.measureSpeech('https://r2/after.mp3', blob)
    await vi.advanceTimersByTimeAsync(10)
    await expect(ok).resolves.toBeUndefined()
    expect(F.bufferOfUrl('https://r2/after.mp3')).not.toBeNull()
  })
})

describe('возврат из фона', () => {
  it('подписчик получает событие только после настоящего ухода в фон; отписка работает', () => {
    const docL = {}, winL = {}
    const add = o => (t, f) => { (o[t] ||= []).push(f) }
    const doc = { visibilityState: 'visible', addEventListener: add(docL), removeEventListener() {} }
    const win = { addEventListener: add(winL), removeEventListener() {} }
    consumeRewake()
    const off = installGameAudioLife({ doc, win, nav: {}, now: () => 0, ctxState: () => 'running' })
    const cb = vi.fn()
    const un = onGameAudioReturn(cb)
    doc.visibilityState = 'visible'; docL.visibilitychange.forEach(f => f())
    expect(cb).not.toHaveBeenCalled() // ухода не было
    doc.visibilityState = 'hidden'; docL.visibilitychange.forEach(f => f())
    doc.visibilityState = 'visible'; docL.visibilitychange.forEach(f => f())
    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb.mock.calls[0][0]).toContain('visibility visible')
    un()
    doc.visibilityState = 'hidden'; docL.visibilitychange.forEach(f => f())
    doc.visibilityState = 'visible'; docL.visibilitychange.forEach(f => f())
    expect(cb).toHaveBeenCalledTimes(1)
    off()
  })
})

describe('подключение', () => {
  it('тап «Начать» перед prefetch сбрасывает недоверенные отметки; карточка перепроверяет прогрев при возврате из фона', async () => {
    const { readFileSync } = await import('node:fs')
    const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')
    const start = read('./wordLaneStart.js')
    expect(start.indexOf('reviveWarm(warmItems(plan))')).toBeGreaterThan(0)
    expect(start.indexOf('reviveWarm(warmItems(plan))')).toBeLessThan(start.indexOf('prefetch(warmItems(plan))'))
    expect(read('./wordLaneWarm.js')).toContain('onGameAudioReturn(')
  })
})
