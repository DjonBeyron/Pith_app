import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { scheduleBackgroundStart } from './voskBgSchedule.js'

const fakeWin = (o = {}) => {
  const listeners = new Map()
  return {
    addEventListener: (n, f) => listeners.set(n, f), removeEventListener: n => listeners.delete(n),
    emit: n => listeners.get(n)?.(), listeners, ...o,
  }
}
beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('старт фоновой загрузки: через 5–8 с после сплэша и только в простое', () => {
  it('сплэш уже ушёл: ждём задержку, потом простой браузера — и только потом старт', () => {
    const start = vi.fn(), idle = []
    const win = fakeWin({ __pithySplashGone: true, requestIdleCallback: (fn, o) => { idle.push([fn, o]); return 1 } })
    scheduleBackgroundStart(start, { win, rand: () => 0 })
    vi.advanceTimersByTime(4999)
    expect(idle).toHaveLength(0)
    vi.advanceTimersByTime(2)
    expect(idle).toHaveLength(1) // просим простой, ещё не стартуем
    expect(start).not.toHaveBeenCalled()
    idle[0][0]()
    expect(start).toHaveBeenCalledTimes(1)
  })
  it('сплэш ещё на экране: отсчёт начинается по событию pithy:splash-gone', () => {
    const start = vi.fn()
    const win = fakeWin({ requestIdleCallback: fn => { fn(); return 1 } })
    scheduleBackgroundStart(start, { win, rand: () => 0.999 })
    vi.advanceTimersByTime(60000)
    expect(start).not.toHaveBeenCalled()
    win.emit('pithy:splash-gone')
    vi.advanceTimersByTime(7990)
    expect(start).not.toHaveBeenCalled()
    vi.advanceTimersByTime(20)
    expect(start).toHaveBeenCalledTimes(1)
  })
  it('нет requestIdleCallback (Safari) — обычный таймер', () => {
    const start = vi.fn()
    scheduleBackgroundStart(start, { win: fakeWin({ __pithySplashGone: true }), rand: () => 0 })
    vi.advanceTimersByTime(5000)
    expect(start).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1000)
    expect(start).toHaveBeenCalledTimes(1)
  })
  it('отмена в любой момент — старта не будет, слушатель снят', () => {
    const start = vi.fn(), cancelIdle = vi.fn()
    const win = fakeWin({ __pithySplashGone: true, requestIdleCallback: () => 5, cancelIdleCallback: cancelIdle })
    const cancel = scheduleBackgroundStart(start, { win, rand: () => 0 })
    vi.advanceTimersByTime(5100)
    cancel()
    expect(cancelIdle).toHaveBeenCalledWith(5)
    const win2 = fakeWin()
    const cancel2 = scheduleBackgroundStart(start, { win: win2, rand: () => 0 })
    cancel2()
    expect(win2.listeners.size).toBe(0)
    vi.advanceTimersByTime(60000)
    expect(start).not.toHaveBeenCalled()
  })
})
