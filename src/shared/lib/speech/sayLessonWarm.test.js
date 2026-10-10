import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { startLessonWarm, QUIET_MAX_MS } from './sayLessonWarm.js'
import { startIdlePrewarm, START_DELAY } from '../idlePrewarm.js'
import { createVoskRuntime, FREE_AFTER_MS, BROKEN_MS } from '../vosk/voskRuntime.js'

// Ранний прогрев при входе в урок с «Сказать фразу»: загрузка модели сразу, прогрев после простоя и тишины сети, отпускание при выходе. Окружение, таймеры, runtime — подставные
function fakeWin() {
  return { __pithySplashGone: true, addEventListener() {}, removeEventListener() {}, requestIdleCallback: cb => setTimeout(cb, 0), cancelIdleCallback: id => clearTimeout(id) }
}
const idleReal = (conn = null) => tasks => startIdlePrewarm(tasks, { window: fakeWin(), document: { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} }, connection: conn })
function netBusyFake() {
  let busy = false
  const subs = new Set()
  return { isBusy: () => busy, subscribe: fn => { subs.add(fn); return () => subs.delete(fn) }, set: v => { busy = v; subs.forEach(f => f()) } }
}
function setup(over = {}) {
  const release = vi.fn()
  const runtime = { acquire: vi.fn(() => release) }
  const busy = netBusyFake()
  const background = vi.fn()
  const d = { runtime, background, idle: idleReal(), busy, getMode: () => 'auto', canWarm: () => true, ...over }
  return { d, runtime, release, busy, background, start: () => startLessonWarm(d) }
}

describe('ранний прогрев: при входе в урок с say_phrase', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('фоновая загрузка модели стартует СРАЗУ (до простоя), а прогрев — только после простоя (START_DELAY + idle)', async () => {
    const t = setup()
    t.start()
    expect(t.background).toHaveBeenCalledTimes(1)
    expect(t.runtime.acquire).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(START_DELAY - 1)
    expect(t.runtime.acquire).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(10)
    expect(t.runtime.acquire).toHaveBeenCalledWith('lesson'); expect(t.runtime.acquire).toHaveBeenCalledTimes(1)
  })

  it('сеть занята файлами урока (netBusy) → ждём тишины; освободилась — греем; не освободилась — не дольше QUIET_MAX_MS', async () => {
    const a = setup(); a.busy.set(true); a.start()
    await vi.advanceTimersByTimeAsync(START_DELAY + 100)
    expect(a.runtime.acquire).not.toHaveBeenCalled()
    a.busy.set(false)
    expect(a.runtime.acquire).toHaveBeenCalledTimes(1)
    const b = setup(); b.busy.set(true); b.start()
    await vi.advanceTimersByTimeAsync(START_DELAY + QUIET_MAX_MS - 100)
    expect(b.runtime.acquire).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(300)
    expect(b.runtime.acquire).toHaveBeenCalledTimes(1)
  })

  it('урок закрыли до простоя — ничего не греется; после прогрева — release() вызван ровно один раз', async () => {
    const a = setup(); const stopA = a.start(); stopA()
    await vi.advanceTimersByTimeAsync(START_DELAY * 3)
    expect(a.runtime.acquire).not.toHaveBeenCalled()
    const b = setup(); const stopB = b.start()
    await vi.advanceTimersByTimeAsync(START_DELAY + 100)
    stopB(); stopB()
    expect(b.release).toHaveBeenCalledTimes(1)
  })

  it('слабая сеть (экономия трафика) — прогрев по простою не стартует (библиотека ≈6 МБ из сети); «Только системное» и запасной режим панели (Firefox / отказ) — не греем и не качаем', async () => {
    const a = setup({ idle: idleReal({ saveData: true }) }); a.start()
    await vi.advanceTimersByTimeAsync(START_DELAY * 3)
    expect(a.runtime.acquire).not.toHaveBeenCalled()
    const b = setup({ getMode: () => 'system' }); b.start()
    await vi.advanceTimersByTimeAsync(START_DELAY * 3)
    expect(b.background).not.toHaveBeenCalled(); expect(b.runtime.acquire).not.toHaveBeenCalled()
    const c = setup({ canWarm: () => false }); c.start()
    await vi.advanceTimersByTimeAsync(START_DELAY * 3)
    expect(c.runtime.acquire).not.toHaveBeenCalled()
  })
})

describe('ранний прогрев с настоящим runtime (подставные кэш и движок)', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })
  function real(over = {}) {
    let now = 1000
    const model = { id: 'm' }
    const d = {
      url: () => 'https://x/m.tar.gz', peek: vi.fn(async () => ({ size: 5 })), read: vi.fn(async () => ({ blob: { size: 5 }, size: 5 })),
      load: vi.fn(async (_b, onStage) => { onStage?.('lib'); onStage?.('model'); return { model, libMs: 1, modelMs: 1 } }),
      unload: vi.fn(), busy: vi.fn(() => () => {}), now: () => now, log: vi.fn(), mode: () => 'auto', ...over,
    }
    const runtime = createVoskRuntime(d)
    const t = setup({ runtime })
    return { ...t, d, runtime, advance: ms => { now += ms; return vi.advanceTimersByTimeAsync(ms) } }
  }

  it('вход → модель в памяти к моменту модуля; повторный вход в урок (в пределах 30 с после выхода) модель заново не грузит', async () => {
    const t = real()
    const stop = t.start()
    await t.advance(START_DELAY + 100); await t.runtime.whenReady()
    expect(t.runtime.snapshot()).toMatchObject({ loaded: true, stage: 'ready' }); expect(t.runtime.info().holds).toEqual({ lesson: 1 })
    stop()
    await t.advance(10000)
    const stop2 = t.start()
    await t.advance(START_DELAY + 100)
    expect(t.d.load).toHaveBeenCalledTimes(1); expect(t.d.unload).not.toHaveBeenCalled()
    stop2()
  })

  it('после выхода из урока модель выгружается через ~30 с, раньше — нет', async () => {
    const t = real()
    const stop = t.start()
    await t.advance(START_DELAY + 100); await t.runtime.whenReady()
    stop()
    await t.advance(FREE_AFTER_MS - 1)
    expect(t.d.unload).not.toHaveBeenCalled()
    await t.advance(2)
    expect(t.d.unload).toHaveBeenCalledTimes(1); expect(t.runtime.snapshot().loaded).toBe(false)
  })

  it('StrictMode (старт → отмена → старт сразу): модель грузится один раз, владелец один', async () => {
    const t = real()
    t.start()()
    const stop = t.start()
    await t.advance(START_DELAY + 100); await t.runtime.whenReady()
    expect(t.d.load).toHaveBeenCalledTimes(1); expect(t.runtime.info().users).toBe(1)
    stop()
  })

  it('ошибка загрузки библиотеки → пауза 1 мин → повтор сам, пока урок открыт', async () => {
    let n = 0
    const t = real({ load: vi.fn(async (_b, onStage) => { n++; onStage?.('lib'); if (n === 1) throw new Error('Failed to fetch'); onStage?.('model'); return { model: { id: 'm' }, libMs: 1, modelMs: 1 } }) })
    t.start()
    await t.advance(START_DELAY + 100); await t.runtime.whenReady()
    expect(t.runtime.snapshot()).toMatchObject({ stage: 'failed', broken: true })
    await t.advance(BROKEN_MS + 100); await t.runtime.whenReady()
    expect(t.d.load).toHaveBeenCalledTimes(2); expect(t.runtime.snapshot()).toMatchObject({ loaded: true, broken: false })
  })

  it('модели нет в кэше: прогрев не греет, но держит подписку — докачалась в фоне → модель сама идёт в память', async () => {
    let cached = false
    const cbs = []
    const t = real({ peek: vi.fn(async () => (cached ? { size: 5 } : null)), watchCached: cb => { cbs.push(cb); return () => cbs.splice(cbs.indexOf(cb), 1) } })
    t.start()
    await t.advance(START_DELAY + 100); await t.runtime.whenReady()
    expect(t.runtime.snapshot()).toMatchObject({ cached: false, loaded: false })
    cached = true; cbs[0](); await t.runtime.whenReady()
    expect(t.runtime.snapshot()).toMatchObject({ cached: true, loaded: true }); expect(t.runtime.info().trigger).toBe('bg-cached')
  })
})
