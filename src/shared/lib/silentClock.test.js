import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createSilentClock } from './silentClock.js'

// Часы без озвучки должны уметь то же, что <audio> со скоростью голоса:
// идти быстрее/медленнее и заканчиваться в нужный момент
describe('silentClock: скорость', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('без опции — реальное время, конец по длительности', () => {
    const onEnded = vi.fn()
    const c = createSilentClock(10, { onEnded })
    c.play()
    vi.advanceTimersByTime(4000)
    expect(c.currentTime).toBeCloseTo(4, 1)
    vi.advanceTimersByTime(6000)
    expect(onEnded).toHaveBeenCalledTimes(1)
    expect(c.ended).toBe(true)
  })

  it('rate 2: время таймлайна идёт вдвое быстрее, конец — вдвое раньше', () => {
    const onEnded = vi.fn()
    const c = createSilentClock(10, { onEnded, rate: 2 })
    c.play()
    vi.advanceTimersByTime(2000)
    expect(c.currentTime).toBeCloseTo(4, 1)
    vi.advanceTimersByTime(3000)
    expect(onEnded).toHaveBeenCalledTimes(1)
  })

  it('setRate на ходу: пройденное не теряется, остаток пересчитывается', () => {
    const onEnded = vi.fn()
    const c = createSilentClock(10, { onEnded })
    c.play()
    vi.advanceTimersByTime(2000)          // t = 2
    c.setRate(2)
    expect(c.playbackRate).toBe(2)
    vi.advanceTimersByTime(1000)          // + 2 → t = 4
    expect(c.currentTime).toBeCloseTo(4, 1)
    vi.advanceTimersByTime(3000)          // + 6 → 10, конец
    expect(onEnded).toHaveBeenCalledTimes(1)
  })

  it('setRate на паузе — просто запоминается', () => {
    const c = createSilentClock(10)
    c.setRate(0.75)
    expect(c.paused).toBe(true)
    expect(c.currentTime).toBe(0)
    c.play()
    vi.advanceTimersByTime(4000)
    expect(c.currentTime).toBeCloseTo(3, 1)
  })

  it('мусорная скорость игнорируется', () => {
    const c = createSilentClock(10, { rate: 0 })
    expect(c.playbackRate).toBe(1)
    c.setRate(-1)
    expect(c.playbackRate).toBe(1)
  })
})
