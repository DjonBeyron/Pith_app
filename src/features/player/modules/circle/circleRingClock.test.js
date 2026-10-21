import { describe, it, expect, vi } from 'vitest'
import { createRingClock, RING_DRIFT_MS } from './circleRingClock.js'

const C = 666
function harness(t = 0) {
  const el = { style: {} }
  const anims = []
  const animate = vi.fn((_el, kf, opts) => { const a = { kf, opts, cancel: vi.fn(), pause: vi.fn() }; anims.push(a); return a })
  const clock = createRingClock(() => el, C, { animate, now: () => t })
  return { el, anims, animate, clock, setT: v => { t = v } }
}

describe('кольцо видео-кружка по часам видео (circleRingClock.js)', () => {
  it('якорь: от текущей позиции до конца за реальный остаток с учётом скорости', () => {
    const h = harness()
    expect(h.clock.anchor({ duration: 10, currentTime: 2.5, playbackRate: 1 })).toBe(true)
    expect(h.el.style.strokeDashoffset).toBe(String(C * 0.75))
    expect(h.anims[0].opts).toEqual({ duration: 7500, easing: 'linear', fill: 'forwards' })
    expect(h.anims[0].kf[1].strokeDashoffset).toBe('0')
    expect(h.clock.anchor({ duration: 10, currentTime: 5, playbackRate: 2 })).toBe(true)
    expect(h.anims[0].cancel).toHaveBeenCalled() // старая снята
    expect(h.anims[1].opts.duration).toBe(2500)
    expect(h.clock.anchor({ duration: NaN, currentTime: 0 })).toBe(false) // метаданных нет
  })

  it('tick: небольшое расхождение терпит, больше RING_DRIFT_MS — новый якорь; без плана — якорь', () => {
    const h = harness(0)
    expect(h.clock.tick({ duration: 4, currentTime: 0 })).toBe(true) // плана не было → якорь (4000 мс)
    h.setT(1000)
    expect(h.clock.tick({ duration: 4, currentTime: 1.0 })).toBe(false) // ровно по часам
    expect(h.clock.tick({ duration: 4, currentTime: 0.95 })).toBe(false) // 50 мс — в допуске
    expect(h.clock.tick({ duration: 4, currentTime: 0.7 })).toBe(true)   // видео отстало на 300 мс → перепривязка
    expect(h.anims.length).toBe(2)
    expect(h.anims[1].opts.duration).toBe(3300)
  })

  it('pause замораживает анимацию и снимает план; end — полное, reset — пустое', () => {
    const h = harness()
    h.clock.anchor({ duration: 3, currentTime: 0 })
    h.clock.pause()
    expect(h.anims[0].pause).toHaveBeenCalled()
    expect(h.clock.planned()).toBeNull()
    h.clock.end()
    expect(h.el.style.strokeDashoffset).toBe('0')
    h.clock.reset()
    expect(h.el.style.strokeDashoffset).toBe(String(C))
    expect(RING_DRIFT_MS).toBe(120)
  })

  it('без элемента — ничего не делает', () => {
    const clock = createRingClock(() => null, C, { animate: vi.fn() })
    expect(clock.anchor({ duration: 3, currentTime: 0 })).toBe(false)
    expect(() => clock.end()).not.toThrow()
  })
})
