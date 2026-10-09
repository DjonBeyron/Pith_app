import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fakeCaches, gzBytes, rangeServer, hangingFetch } from './voskTestKit.js'
import { startBackground, abortBackground, resetBackgroundCache } from './voskBackground.js'
import { getBgStatus, resetBgStatus, subscribeBgStatus } from './voskBgStatus.js'
import { setStopped, POLL_MS, SLOW_POLL_MS } from './voskBgPolicy.js'
import { saveModel, peekCached } from './voskStorage.js'
import { PARTS_CACHE } from './voskParts.js'
import { VoskError } from './voskErrors.js'

const URL1 = 'https://models.example.com/vosk.tar.gz'
const bytes = gzBytes(100)
const mem = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k) } }

// Окружение запуска: всё подставное; flags.* — «что сейчас происходит в приложении»; onSleep вызывается вместо реального ожидания
function env(over = {}) {
  const flags = { net: false, feed: false, video: false }
  const delays = []
  const e = {
    url: URL1, cachesApi: fakeCaches(), store: mem(), fetchFn: rangeServer(bytes), chunkBytes: 30,
    nav: { onLine: true, connection: undefined }, doc: { visibilityState: 'visible' },
    busy: { net: () => flags.net, feed: () => flags.feed, video: () => flags.video }, watchBusy: () => () => {},
    lock: vi.fn(async () => () => {}), persist: vi.fn(), log: vi.fn(), rand: () => 0,
    flags, delays, onSleep: null,
    sleep: async (ms, signal) => {
      delays.push(ms)
      if (signal?.aborted) throw new VoskError('cancelled')
      await e.onSleep?.(ms)
    },
    ...over,
  }
  return e
}
const run = e => startBackground(e)
const states = () => { const out = []; const off = subscribeBgStatus(() => out.push(getBgStatus().state + (getBgStatus().reason ? `:${getBgStatus().reason}` : ''))); return { out, off } }

beforeEach(async () => { await abortBackground(); resetBgStatus() })

describe('планировщик: модель уже в кэше / стоп / замок', () => {
  it('модель в кэше — ничего не делаем: ни запросов, ни замка, ни persist', async () => {
    const e = env()
    await saveModel(URL1, new Blob([bytes]), e.cachesApi)
    await run(e)
    expect(getBgStatus().state).toBe('cached')
    expect(e.fetchFn.calls).toHaveLength(0)
    expect(e.lock).not.toHaveBeenCalled()
    expect(e.persist).not.toHaveBeenCalled()
  })
  it('флаг «остановить» от админа — не стартуем', async () => {
    const e = env()
    setStopped(true, e.store)
    await run(e)
    expect(getBgStatus().state).toBe('off')
    expect(e.fetchFn.calls).toHaveLength(0)
  })
  it('другая вкладка уже ведёт загрузку (замок занят) — молчим и не качаем', async () => {
    const e = env({ lock: vi.fn(async () => null) })
    await run(e)
    expect(getBgStatus().state).toBe('other')
    expect(e.fetchFn.calls).toHaveLength(0)
  })
  it('повторный запуск, пока идёт первый, возвращает тот же промис (один экземпляр в вкладке)', async () => {
    const e = env()
    const a = run(e), b = run(e)
    expect(a).toBe(b)
    await a
    expect(e.fetchFn.calls.filter(c => c.range === 'bytes=0-29')).toHaveLength(1)
    expect(e.lock).toHaveBeenCalledTimes(1)
  })
  it('нет Cache Storage (http) — тихая ошибка без запросов', async () => {
    const e = env({ cachesApi: undefined })
    await run(e)
    expect(getBgStatus().state).toBe('error')
    expect(e.fetchFn.calls).toHaveLength(0)
  })
})

describe('планировщик: успешная загрузка', () => {
  it('качает кусками, закрепляет хранилище один раз, в итоге модель в кэше под обычным ключом', async () => {
    const e = env()
    const { out, off } = states()
    await run(e)
    off()
    expect(getBgStatus()).toMatchObject({ state: 'cached', pct: 100, mode: 'range' })
    expect(e.persist).toHaveBeenCalledTimes(1)
    expect((await peekCached(URL1, e.cachesApi)).size).toBe(100)
    expect(e.cachesApi.has(PARTS_CACHE)).toBe(false)
    expect(out).toContain('downloading')
    expect(e.log).toHaveBeenCalled()
  })
  it('паузы между кусками 250–400 мс', async () => {
    const e = env({ rand: () => 0.5 })
    await run(e)
    expect(e.delays.filter(d => d === 325)).toHaveLength(3)
  })
})

describe('планировщик: ждёт тишины', () => {
  const waitsFor = async (flag, reason, patch = e => { e.flags[flag] = true }) => {
    const e = env()
    patch(e)
    let polls = 0
    e.onSleep = () => { if (++polls === 2) { e.flags[flag] = false; e.nav.onLine = true; e.nav.connection = undefined } }
    const { out, off } = states()
    await run(e)
    off()
    return { e, out, polls, reason }
  }
  it.each([['feed'], ['video'], ['net']])('пока %s занято — не качаем, проверяем раз в 2,5 с, потом качаем', async flag => {
    const { e, out } = await waitsFor(flag)
    const reason = flag === 'net' ? 'busy' : flag
    expect(out).toContain(`waiting:${reason}`)
    expect(e.delays.slice(0, 2)).toEqual([POLL_MS, POLL_MS])
    expect(e.fetchFn.calls.length).toBeGreaterThan(0)
    expect(getBgStatus().state).toBe('cached')
  })
  it('офлайн — ждём, не стартуем; появилась сеть — качаем', async () => {
    const { e, out } = await waitsFor('x', 'offline', e => { e.nav.onLine = false })
    expect(out).toContain('waiting:offline')
    expect(getBgStatus().state).toBe('cached')
    expect(e.fetchFn.calls[0].range).toBe('bytes=0-29')
  })
  it('экономия трафика и медленная сеть — не качаем, смотрим редко (раз в 30 с)', async () => {
    const a = await waitsFor('x', 'saveData', e => { e.nav.connection = { saveData: true } })
    expect(a.out).toContain('waiting:saveData')
    expect(a.e.delays[0]).toBe(SLOW_POLL_MS)
    const b = await waitsFor('x', 'slow', e => { e.nav.connection = { effectiveType: '2g' } })
    expect(b.out).toContain('waiting:slow')
  })
  it('приложение в фоне (вкладка скрыта) — ждём возврата', async () => {
    const e = env({ doc: { visibilityState: 'hidden' } })
    e.onSleep = () => { e.doc.visibilityState = 'visible' }
    await run(e)
    expect(e.delays[0]).toBe(POLL_MS)
    expect(getBgStatus().state).toBe('cached')
  })
  it('ждали тишину и получили «стоп» от админа — выходим без загрузки', async () => {
    const e = env()
    e.flags.feed = true
    e.onSleep = () => setStopped(true, e.store)
    await run(e)
    expect(getBgStatus().state).toBe('off')
    expect(e.fetchFn.calls).toHaveLength(0)
  })
  it('abort во время ожидания — запуск завершается (idle), в сеть не ходил', async () => {
    const e = env({ sleep: (ms, signal) => new Promise((_, rej) => signal.addEventListener('abort', () => rej(new VoskError('cancelled')), { once: true })) })
    e.flags.feed = true
    const p = run(e)
    await new Promise(r => setTimeout(r, 5))
    expect(getBgStatus()).toMatchObject({ state: 'waiting', reason: 'feed' })
    await abortBackground()
    await p
    expect(getBgStatus().state).toBe('idle')
    expect(e.fetchFn.calls).toHaveLength(0)
  })
})

describe('планировщик: ошибки и повторы', () => {
  const down = () => vi.fn(async () => { throw new TypeError('Failed to fetch') })
  it('обрыв → тихий повтор через 5 с, после второй попытки загрузка успешна', async () => {
    const good = rangeServer(bytes)
    let n = 0
    const e = env({ fetchFn: (u, i) => (++n <= 2 ? Promise.reject(new TypeError('x')) : good(u, i)) })
    await run(e)
    expect(getBgStatus().state).toBe('cached')
    expect(e.delays).toContain(5000)
    expect(e.log.mock.calls.some(([m]) => /ошибка/.test(m))).toBe(true) // ошибка записана в журнал
  })
  it('не больше 5 попыток за сессию: паузы 5/10/20/40 с, статус «ошибка»', async () => {
    const f = down()
    const e = env({ fetchFn: f })
    await run(e)
    expect(e.delays.filter(d => d >= 5000)).toEqual([5000, 10000, 20000, 40000])
    expect(getBgStatus()).toMatchObject({ state: 'error', attempt: 5 })
    expect(f.mock.calls.filter(([, o]) => o?.method !== 'HEAD')).toHaveLength(5)
  })
  it('обрыв из-за офлайна попытку не тратит: после возвращения сети докачиваем и не сдаёмся', async () => {
    const good = rangeServer(bytes)
    let n = 0
    const e = env({
      fetchFn: (u, i) => {
        if (i?.method === 'HEAD') return Promise.reject(new TypeError('x'))
        if (++n <= 7) { e.nav.onLine = false; return Promise.reject(new TypeError('x')) }
        return good(u, i)
      },
    })
    e.onSleep = () => { e.nav.onLine = true }
    await run(e)
    expect(getBgStatus().state).toBe('cached')
  })
  it('404 и подобное не повторяются: одна попытка, статус «ошибка»', async () => {
    const e = env({ fetchFn: async () => new Response('no', { status: 404 }) })
    await run(e)
    expect(getBgStatus()).toMatchObject({ state: 'error', attempt: 1 })
    expect(e.delays).toEqual([])
  })
  it('сервер без Range — тот же результат через обычную загрузку', async () => {
    const e = env({ fetchFn: rangeServer(bytes, { range: false }) })
    await run(e)
    expect(getBgStatus()).toMatchObject({ state: 'cached', mode: 'full' })
  })
  it('зависший запрос не вешает планировщик навсегда: сторож → повтор', async () => {
    let n = 0
    const good = rangeServer(bytes)
    const e = env({ stallMs: 20, fetchFn: (u, i) => (++n === 1 ? hangingFetch()(u, i) : good(u, i)) })
    await run(e)
    expect(getBgStatus().state).toBe('cached')
  })
})

describe('сброс кэша модели (админ)', () => {
  it('стирает модель и куски, статус в начало, затем загрузка стартует заново', async () => {
    const e = env()
    await run(e)
    expect(await peekCached(URL1, e.cachesApi)).not.toBeNull()
    const idb = { deleteDatabase: () => { const r = {}; setTimeout(() => r.onsuccess?.(), 0); return r } }
    await resetBackgroundCache({ ...e, idb })
    await startBackground(e) // идущий после сброса запуск (тот же промис)
    expect(getBgStatus().state).toBe('cached') // скачано заново
    expect(e.fetchFn.calls.filter(c => c.range === 'bytes=0-29').length).toBeGreaterThanOrEqual(2)
  })
  it('при флаге «стоп» после сброса заново не качаем', async () => {
    const e = env()
    await run(e)
    setStopped(true, e.store)
    const calls = e.fetchFn.calls.length
    const idb = { deleteDatabase: () => { const r = {}; setTimeout(() => r.onsuccess?.(), 0); return r } }
    await resetBackgroundCache({ ...e, idb })
    expect(await peekCached(URL1, e.cachesApi)).toBeNull()
    expect(getBgStatus().state).toBe('idle')
    expect(e.fetchFn.calls).toHaveLength(calls)
  })
})
