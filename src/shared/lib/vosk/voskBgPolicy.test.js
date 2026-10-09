import { describe, it, expect } from 'vitest'
import {
  canStart, pollDelay, nextDelay, chunkPause, startDelayMs, chunkCount, chunkRange, parseContentRange, envSnapshot,
  isStopped, setStopped, STOP_KEY, CHUNK_BYTES, POLL_MS, SLOW_POLL_MS, MAX_ATTEMPTS, RangeUnsupported,
} from './voskBgPolicy.js'

const calm = { cached: false, stopped: false, offline: false, saveData: false, slow: false, hidden: false, feed: false, video: false, busy: false }
const mem = (init = {}) => { const m = new Map(Object.entries(init)); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k) } }

describe('canStart: можно ли качать сейчас', () => {
  it('всё спокойно — можно', () => {
    expect(canStart(calm)).toEqual({ ok: true })
  })
  it.each([
    ['cached', 'cached'], ['stopped', 'off'], ['offline', 'offline'], ['saveData', 'saveData'], ['slow', 'slow'],
    ['hidden', 'hidden'], ['feed', 'feed'], ['video', 'video'], ['busy', 'busy'],
  ])('причина %s → нельзя (%s)', (flag, reason) => {
    expect(canStart({ ...calm, [flag]: true })).toEqual({ ok: false, reason })
  })
  it('несколько причин сразу: главнее «навсегда» (кэш, стоп), потом сеть, потом занятость', () => {
    expect(canStart({ ...calm, cached: true, busy: true }).reason).toBe('cached')
    expect(canStart({ ...calm, stopped: true, feed: true }).reason).toBe('off')
    expect(canStart({ ...calm, offline: true, feed: true }).reason).toBe('offline')
    expect(canStart({ ...calm, saveData: true, video: true }).reason).toBe('saveData')
    expect(canStart({ ...calm, feed: true, video: true, busy: true }).reason).toBe('feed')
    expect(canStart({ ...calm, video: true, busy: true }).reason).toBe('video')
  })
})

describe('задержки и нарезка', () => {
  it('проверка «стало ли тихо»: 2,5 с; при экономии трафика / 2g — раз в 30 с', () => {
    expect(pollDelay('feed')).toBe(POLL_MS)
    expect(pollDelay('offline')).toBe(POLL_MS)
    expect(pollDelay('saveData')).toBe(SLOW_POLL_MS)
    expect(pollDelay('slow')).toBe(SLOW_POLL_MS)
  })
  it('пауза после неудачи растёт вдвое и упирается в минуту; попыток за сессию 5', () => {
    expect([1, 2, 3, 4, 5, 6, 9].map(nextDelay)).toEqual([5000, 10000, 20000, 40000, 60000, 60000, 60000])
    expect(nextDelay(0)).toBe(5000)
    expect(MAX_ATTEMPTS).toBe(5)
  })
  it('пауза между кусками 250–400 мс, старт через 5–8 с', () => {
    expect(chunkPause(0)).toBe(250)
    expect(chunkPause(0.999)).toBeLessThanOrEqual(400)
    expect(startDelayMs(0)).toBe(5000)
    expect(startDelayMs(0.999)).toBeLessThanOrEqual(8000)
  })
  it('нарезка на куски по 2 МБ: границы включительно, последний короче', () => {
    expect(CHUNK_BYTES).toBe(2097152)
    const total = 39 * 1048576 + 123
    const n = chunkCount(total)
    expect(n).toBe(20)
    expect(chunkRange(0, total)).toEqual({ start: 0, end: 2097151, size: 2097152 })
    const last = chunkRange(n - 1, total)
    expect(last.end).toBe(total - 1)
    expect(last.start).toBe(19 * CHUNK_BYTES)
    expect(last.size).toBe(total - 19 * CHUNK_BYTES)
    // куски покрывают файл без дыр и перекрытий
    let next = 0
    for (let i = 0; i < n; i++) { const r = chunkRange(i, total); expect(r.start).toBe(next); next = r.end + 1 }
    expect(next).toBe(total)
    expect(chunkCount(100, 30)).toBe(4)
    expect(chunkRange(3, 100, 30)).toEqual({ start: 90, end: 99, size: 10 })
  })
  it('разбор Content-Range', () => {
    expect(parseContentRange('bytes 0-2097151/40894464')).toEqual({ start: 0, end: 2097151, total: 40894464 })
    expect(parseContentRange('bytes 10-19/*')).toEqual({ start: 10, end: 19, total: null })
    expect(parseContentRange(null)).toBeNull()
    expect(parseContentRange('items 1-2/3')).toBeNull()
  })
})

describe('envSnapshot: снимок среды', () => {
  const busy = (o = {}) => ({ net: () => !!o.net, feed: () => !!o.feed, video: () => !!o.video })
  it('спокойная среда; navigator.connection нет (iPhone) — не мешает', () => {
    expect(envSnapshot({ nav: { onLine: true }, doc: { visibilityState: 'visible' }, busy: busy() })).toEqual({ stopped: false, offline: false, saveData: false, slow: false, hidden: false, feed: false, video: false, busy: false })
  })
  it('офлайн, экономия трафика, 2g и slow-2g, фон, лента, видео, занято', () => {
    const doc = { visibilityState: 'visible' }
    expect(envSnapshot({ nav: { onLine: false }, doc, busy: busy() }).offline).toBe(true)
    expect(envSnapshot({ nav: { connection: { saveData: true } }, doc, busy: busy() }).saveData).toBe(true)
    expect(envSnapshot({ nav: { connection: { effectiveType: '2g' } }, doc, busy: busy() }).slow).toBe(true)
    expect(envSnapshot({ nav: { connection: { effectiveType: 'slow-2g' } }, doc, busy: busy() }).slow).toBe(true)
    expect(envSnapshot({ nav: { connection: { effectiveType: '3g' } }, doc, busy: busy() }).slow).toBe(false)
    expect(envSnapshot({ nav: {}, doc: { visibilityState: 'hidden' }, busy: busy() }).hidden).toBe(true)
    expect(envSnapshot({ nav: {}, doc, busy: busy({ feed: true }) }).feed).toBe(true)
    expect(envSnapshot({ nav: {}, doc, busy: busy({ video: true }) }).video).toBe(true)
    expect(envSnapshot({ nav: {}, doc, busy: busy({ net: true }) }).busy).toBe(true)
    expect(envSnapshot({ nav: {}, doc, busy: busy(), stopped: true }).stopped).toBe(true)
  })
})

describe('флаг «остановить» и ошибка Range', () => {
  it('флаг пишется, читается и снимается; хранилище сломано — просто «не остановлено»', () => {
    const s = mem()
    expect(isStopped(s)).toBe(false)
    setStopped(true, s)
    expect(s.getItem(STOP_KEY)).toBe('1')
    expect(isStopped(s)).toBe(true)
    setStopped(false, s)
    expect(isStopped(s)).toBe(false)
    const broken = { getItem() { throw new Error('x') }, setItem() { throw new Error('x') }, removeItem() { throw new Error('x') } }
    expect(isStopped(broken)).toBe(false)
    expect(() => setStopped(true, broken)).not.toThrow()
  })
  it('RangeUnsupported — свой тип ошибки с кодом range', () => {
    const e = new RangeUnsupported('x')
    expect(e.code).toBe('range')
    expect(e.message).toBe('x')
  })
})
