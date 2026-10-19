import { describe, it, expect, vi } from 'vitest'
import { startWatchdog } from './useLaunchWatchdog.js'

describe('сторож карточки запуска', () => {
  it('через warn пишет снимок «что не готово», через force открывает кнопку', () => {
    vi.useFakeTimers()
    const mark = vi.fn(), onForce = vi.fn()
    startWatchdog({ snapshot: () => ({ notWarm: ['circle#3'] }), mark, onForce, warnMs: 100, forceMs: 200 })
    vi.advanceTimersByTime(150)
    expect(mark).toHaveBeenCalledWith(expect.stringContaining('circle#3')); expect(onForce).not.toHaveBeenCalled()
    vi.advanceTimersByTime(100)
    expect(onForce).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })
  it('отмена (кнопка открылась сама) — ничего не пишет и не форсирует', () => {
    vi.useFakeTimers()
    const mark = vi.fn(), onForce = vi.fn()
    const cancel = startWatchdog({ snapshot: () => ({}), mark, onForce, warnMs: 100, forceMs: 200 })
    cancel(); vi.advanceTimersByTime(500)
    expect(mark).not.toHaveBeenCalled(); expect(onForce).not.toHaveBeenCalled()
    vi.useRealTimers()
  })
  it('снимок упал — в лог идёт текст ошибки, форс всё равно срабатывает', () => {
    vi.useFakeTimers()
    const mark = vi.fn(), onForce = vi.fn()
    startWatchdog({ snapshot: () => { throw new Error('x') }, mark, onForce, warnMs: 10, forceMs: 20 })
    vi.advanceTimersByTime(30)
    expect(mark.mock.calls[0][0]).toContain('снимок не собрался'); expect(onForce).toHaveBeenCalled()
    vi.useRealTimers()
  })
})
