import { describe, it, expect, vi, afterEach } from 'vitest'
import { createAudioWarm, SETTLE_QUIET_MS, SETTLE_MAX_MS, SELF_WINDOW_MS } from './gameAudioWarm.js'

// Прогрев звука игры после открытия микрофона и после прерываний аудиосессии (iPhone): ожидание «улеглось», повторный прогрев в жесте или на ближайшем касании
afterEach(() => { vi.useRealTimers() })

function env(over = {}) {
  vi.useFakeTimers()
  const st = { ctx: 'running', session: 'active', active: true, listeners: new Set(), docL: {} }
  const doc = {
    addEventListener: (t, f) => { (st.docL[t] ??= new Set()).add(f) },
    removeEventListener: (t, f) => { st.docL[t]?.delete(f) },
  }
  const notes = []
  const log = []
  const resume = vi.fn()
  const warm = createAudioWarm({
    subscribe: cb => { st.listeners.add(cb); return () => st.listeners.delete(cb) },
    ctxState: () => st.ctx, sessionState: () => st.session, resume, active: () => st.active,
    now: () => Date.now(), doc, note: (k, d) => notes.push([k, d]), log: m => log.push(m), ...over,
  })
  const interrupt = () => { st.ctx = 'interrupted'; st.session = 'interrupted'; st.listeners.forEach(cb => cb()) }
  const recover = () => { st.ctx = 'running'; st.session = 'active' }
  const fire = (type, ev = {}) => (st.docL[type] ?? new Set()).forEach(f => f({ type, target: null, ...ev }))
  const tap = () => fire('pointerup', { pointerType: 'touch' }) // касание пальцем: жестом iOS считает pointerup / touchend / click, а не pointerdown
  return { st, warm, notes, log, resume, interrupt, recover, tap, fire }
}
const kinds = (e, k) => e.notes.filter(n => n[0] === k).map(n => n[1])

describe('settle: ждём, пока аудиосессия уляжется', () => {
  it('прерывания не было — готово через SETTLE_QUIET_MS (не раньше), в журнал уходит settled', async () => {
    const e = env()
    e.warm.begin()
    let done = null
    e.warm.settle().then(r => { done = r })
    await vi.advanceTimersByTimeAsync(SETTLE_QUIET_MS - 1)
    expect(done).toBeNull()
    await vi.advanceTimersByTimeAsync(60)
    expect(done).toMatchObject({ interrupts: 0, ctx: 'running', timedOut: false, activation: true })
    expect(kinds(e, 'audio-warm').map(d => d.step)).toEqual(['begin', 'settled'])
  })

  it('прерывание пришло во время ожидания: ждём, пока контекст вернётся из interrupted, и ещё SETTLE_QUIET_MS без новых прерываний; resume подталкивает контекст', async () => {
    const e = env()
    e.warm.begin()
    let done = null
    e.warm.settle().then(r => { done = r })
    await vi.advanceTimersByTimeAsync(100)
    e.interrupt()
    await vi.advanceTimersByTimeAsync(SETTLE_QUIET_MS + 100) // quiet прошёл, но контекст всё ещё прерван
    expect(done).toBeNull()
    expect(e.resume).toHaveBeenCalled()
    e.recover()
    await vi.advanceTimersByTimeAsync(SETTLE_QUIET_MS + 60)
    expect(done).toMatchObject({ interrupts: 1, ctx: 'running', timedOut: false })
    expect(done.waitedMs).toBeGreaterThan(SETTLE_QUIET_MS)
    const ev = kinds(e, 'audio-interrupt')
    expect(ev).toHaveLength(1)
    expect(ev[0]).toMatchObject({ n: 1, self: true, settling: true, ctx: 'interrupted' }) // прерывание в окне после begin — наше
  })

  it('контекст завис в interrupted — не ждём дольше SETTLE_MAX_MS: звук будим всё равно (timedOut)', async () => {
    const e = env()
    e.warm.begin()
    e.st.ctx = 'interrupted'
    let done = null
    e.warm.settle().then(r => { done = r })
    await vi.advanceTimersByTimeAsync(SETTLE_MAX_MS + 100)
    expect(done).toMatchObject({ timedOut: true, ctx: 'interrupted' })
    expect(done.waitedMs).toBeLessThanOrEqual(SETTLE_MAX_MS + 60)
  })

  it('navigator.audioSession.state = interrupted тоже считается незавершённым прерыванием', async () => {
    const e = env()
    e.warm.begin()
    e.st.session = 'interrupted'
    let done = null
    e.warm.settle().then(r => { done = r })
    await vi.advanceTimersByTimeAsync(SETTLE_QUIET_MS + 100)
    expect(done).toBeNull()
    e.st.session = 'active'
    await vi.advanceTimersByTimeAsync(100)
    expect(done).toMatchObject({ timedOut: false, session: 'active' })
  })
})

describe('«своё» прерывание и подписка', () => {
  it('окно «своё» — SELF_WINDOW_MS после begin / markSelf; вне игры его нет', async () => {
    const e = env()
    expect(e.warm.selfWindow()).toBe(false)
    e.warm.begin()
    expect(e.warm.selfWindow()).toBe(true)
    await vi.advanceTimersByTimeAsync(SELF_WINDOW_MS + 10)
    expect(e.warm.selfWindow()).toBe(false)
    e.warm.markSelf()
    expect(e.warm.selfWindow()).toBe(true)
    e.warm.end()
    expect(e.warm.selfWindow()).toBe(false)
  })

  it('begin подписывается один раз, end отписывается и снимает ожидание касания', () => {
    const e = env()
    e.warm.begin(); e.warm.begin()
    expect(e.st.listeners.size).toBe(1)
    e.warm.end()
    expect(e.st.listeners.size).toBe(0)
    expect(e.warm.status()).toMatchObject({ watching: false, rewarmers: 0, armed: false })
  })
})

describe('прерывание посреди игры: повторный прогрев', () => {
  it('жест жив, контекст вернулся — прогрев сразу (через SETTLE_QUIET_MS + запас), без ожидания касания', async () => {
    const e = env()
    const fn = vi.fn()
    e.warm.begin(); e.warm.onRewarm(fn)
    e.interrupt(); e.recover()
    expect(fn).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(SETTLE_QUIET_MS + 200)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(kinds(e, 'audio-warm').some(d => d.step === 'rewarm')).toBe(true)
  })

  it('жест истёк (userActivation.isActive = false): прогрев ждёт ближайшего касания, срабатывает один раз и снимает слушатели; resume зовётся', async () => {
    const e = env()
    const fn = vi.fn()
    e.warm.begin(); e.warm.onRewarm(fn)
    e.st.active = false
    e.interrupt(); e.recover()
    await vi.advanceTimersByTimeAsync(SETTLE_QUIET_MS + 200)
    expect(fn).not.toHaveBeenCalled()
    expect(e.warm.status().armed).toBe(true)
    e.tap()
    expect(fn).toHaveBeenCalledTimes(1)
    expect(e.resume).toHaveBeenCalled()
    e.tap()
    expect(fn).toHaveBeenCalledTimes(1)
    expect(e.warm.status().armed).toBe(false)
  })

  it('контекст всё ещё прерван (звонок идёт): ждём касания, а не прогреваем в пустоту', async () => {
    const e = env()
    const fn = vi.fn()
    e.warm.begin(); e.warm.onRewarm(fn)
    e.interrupt()
    await vi.advanceTimersByTimeAsync(SETTLE_QUIET_MS + 200)
    expect(fn).not.toHaveBeenCalled()
    expect(e.warm.status().armed).toBe(true)
  })

  it('во время стартового ожидания (settle) прогрев не запускается сам — его сделает стартовая последовательность', async () => {
    const e = env()
    const fn = vi.fn()
    e.warm.begin(); e.warm.onRewarm(fn)
    e.warm.settle()
    e.interrupt(); e.recover()
    await vi.advanceTimersByTimeAsync(SETTLE_QUIET_MS + 400)
    expect(fn).not.toHaveBeenCalled()
  })

  it('ошибка одного из прогревателей не мешает остальным', () => {
    const e = env()
    const bad = vi.fn(() => { throw new Error('boom') })
    const good = vi.fn()
    e.warm.begin(); e.warm.onRewarm(bad); const off = e.warm.onRewarm(good)
    e.warm.rewarm('тест')
    expect(good).toHaveBeenCalledTimes(1)
    off(); e.warm.rewarm('ещё раз')
    expect(good).toHaveBeenCalledTimes(1)
    expect(e.log.some(m => m.includes('boom'))).toBe(true)
  })
})

describe('касание-спаситель: только события, которые iOS считает жестом', () => {
  async function armed() {
    const e = env()
    const fn = vi.fn()
    e.warm.begin(); e.warm.onRewarm(fn)
    e.st.active = false
    e.interrupt(); e.recover()
    await vi.advanceTimersByTimeAsync(SETTLE_QUIET_MS + 200)
    expect(e.warm.status().armed).toBe(true)
    return { e, fn }
  }
  it('pointerdown от пальца — НЕ жест (play() в нём отклоняется): прогрев ждёт pointerup / touchend / click', async () => {
    const { e, fn } = await armed()
    e.fire('pointerdown', { pointerType: 'touch' })
    expect(fn).not.toHaveBeenCalled()
    expect(e.warm.status().armed).toBe(true)
    e.fire('touchend')
    expect(fn).toHaveBeenCalledTimes(1)
    expect(e.notes.find(n => n[1].step === 'rewarm')[1]).toMatchObject({ via: 'touchend' })
  })
  it('pointerdown мыши — жест (десктоп), click — тоже; в журнале прогрева видно, каким событием сработало', async () => {
    const a = await armed()
    a.e.fire('pointerdown', { pointerType: 'mouse' })
    expect(a.fn).toHaveBeenCalledTimes(1)
    const b = await armed()
    b.e.fire('click')
    expect(b.fn).toHaveBeenCalledTimes(1)
    expect(b.e.notes.filter(n => n[1].step === 'rewarm').at(-1)[1].via).toBe('click')
  })
  it('status() отдаёт время последнего прерывания (по нему отличают «слот прерван уже после пробуждения»)', () => {
    const e = env()
    e.warm.begin()
    expect(e.warm.status().lastInterruptAt).toBe(0)
    e.interrupt()
    expect(e.warm.status().lastInterruptAt).toBeGreaterThan(0)
  })
})
