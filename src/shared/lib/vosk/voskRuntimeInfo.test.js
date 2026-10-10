import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createVoskRuntime, FREE_AFTER_MS } from './voskRuntime.js'
import { onBgCached, setBgStatus, resetBgStatus } from './voskBgStatus.js'

// Подробности для диагностики (info) и повторный прогрев, когда модель докачалась в фоне при открытой панели
function make(over = {}) {
  let t = 1000
  let hasModel = false
  const cbs = []
  const d = {
    url: () => 'https://x/model.tar.gz', peek: vi.fn(async () => (hasModel ? { size: 5 } : null)), read: vi.fn(async () => ({ blob: { size: 5 }, size: 5 })),
    load: vi.fn(async () => ({ model: { id: 'm' }, libMs: 7, modelMs: 9 })), unload: vi.fn(), busy: vi.fn(() => () => {}), now: () => t, log: vi.fn(),
    watchCached: vi.fn(cb => { cbs.push(cb); return () => cbs.splice(cbs.indexOf(cb), 1) }), ...over,
  }
  return { rt: createVoskRuntime(d), d, cbs, tick: ms => { t += ms; return vi.advanceTimersByTimeAsync(ms) }, setCached: v => { hasModel = v } }
}

describe('voskRuntime.info: подробности для диагностики', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('до открытия панели — пусто; после загрузки — метки времени и длительности; после ухода — когда выгрузится', async () => {
    const { rt, tick, setCached } = make()
    setCached(true)
    expect(rt.info()).toMatchObject({ users: 0, warmAt: 0, loadedAt: 0, freeAt: 0, lastError: '', lastLoad: null })
    const release = rt.acquire(); await rt.whenReady()
    expect(rt.info()).toMatchObject({ users: 1, warmAt: 1000, loadedAt: 1000, freeAt: 0, lastLoad: { libMs: 7, modelMs: 9 } })
    await tick(5000)
    release()
    expect(rt.info()).toMatchObject({ users: 0, freeAt: 6000 + FREE_AFTER_MS })
    await tick(FREE_AFTER_MS)
    expect(rt.info()).toMatchObject({ loadedAt: 0, freeAt: 0 })
  })
  it('сбой прогрева записывается в lastError', async () => {
    const { rt, setCached } = make({ load: vi.fn(async () => { throw new Error('нет чанка') }) })
    setCached(true)
    rt.acquire(); await rt.whenReady()
    expect(rt.info().lastError).toBe('нет чанка')
    expect(rt.snapshot().broken).toBe(true)
  })
})

describe('voskRuntime: модель докачалась в фоне, пока панель открыта', () => {
  it('первая проверка «нет в кэше» → когда фоновая загрузка закончилась, модель грузится в память сама (без повторного открытия панели)', async () => {
    const { rt, d, cbs, setCached } = make()
    const release = rt.acquire(); await rt.whenReady()
    expect(rt.snapshot()).toMatchObject({ cached: false, loaded: false }); expect(d.load).not.toHaveBeenCalled()
    expect(cbs).toHaveLength(1)
    setCached(true); cbs[0]()
    await rt.whenReady()
    expect(rt.snapshot()).toMatchObject({ cached: true, loaded: true }); expect(d.load).toHaveBeenCalledTimes(1)
    release()
  })
  it('подписка живёт только пока панель открыта: после release её нет; без панели ничего не греется', async () => {
    const { rt, d, cbs, setCached } = make()
    const release = rt.acquire(); await rt.whenReady()
    release()
    expect(cbs).toHaveLength(0)
    setCached(true)
    expect(d.load).not.toHaveBeenCalled()
  })
  it('onBgCached: срабатывает один раз на переход в «в кэше», а не на каждый шаг прогресса', () => {
    resetBgStatus()
    const fn = vi.fn()
    const off = onBgCached(fn)
    setBgStatus({ state: 'downloading', pct: 10 }); setBgStatus({ state: 'downloading', pct: 50 })
    expect(fn).not.toHaveBeenCalled()
    setBgStatus({ state: 'cached', pct: 100 }); setBgStatus({ state: 'cached', pct: 100 })
    expect(fn).toHaveBeenCalledTimes(1)
    off(); resetBgStatus()
  })
})
