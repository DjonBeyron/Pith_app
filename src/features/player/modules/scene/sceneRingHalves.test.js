import { describe, it, expect, vi } from 'vitest'
import { ringAngles, ringKeyframes, setRingValue, animateRing } from './sceneRingHalves.js'

const fakeEl = () => {
  const r = { style: {}, animate: vi.fn(() => ({ cancel: vi.fn() })) }
  const l = { style: {}, animate: vi.fn(() => ({ cancel: vi.fn() })) }
  return { r, l, dataset: {}, querySelector: sel => (sel.includes('"r"') ? r : l) }
}

describe('кольцо из двух половинок (sceneRingHalves.js)', () => {
  it('углы: первая половина крутит правую дугу 0→180, вторая — левую', () => {
    expect(ringAngles(0)).toEqual({ r: 0, l: 0 })
    expect(ringAngles(0.25)).toEqual({ r: 90, l: 0 })
    expect(ringAngles(0.5)).toEqual({ r: 180, l: 0 })
    expect(ringAngles(0.75)).toEqual({ r: 180, l: 90 })
    expect(ringAngles(1)).toEqual({ r: 180, l: 180 })
    expect(ringAngles(1.2)).toEqual({ r: 180, l: 180 })
  })

  it('кадры: шаг через половину режется на два, offset по времени, обе дуги по одной шкале', () => {
    const kf = ringKeyframes(0.3, [{ to: 0.7, ms: 1000 }, { to: 0.9, ms: 500 }])
    expect(kf.total).toBe(1500)
    const offs = kf.right.map(k => k.offset)
    ;[0, 0.5 / 1.5, 1000 / 1500, 1].forEach((v, i) => expect(offs[i]).toBeCloseTo(v, 9))
    expect(kf.right.map(k => k.transform)).toEqual(['rotate(108deg)', 'rotate(180deg)', 'rotate(180deg)', 'rotate(180deg)'])
    expect(kf.left.map(k => k.transform)).toEqual(['rotate(0deg)', 'rotate(0deg)', 'rotate(72deg)', 'rotate(144deg)'])
    expect(ringKeyframes(0.2, []).total).toBe(0)
    expect(ringKeyframes(0.2, [{ to: 0.4, ms: 0 }]).total).toBe(0) // нулевые шаги не идут
  })

  it('setRingValue ставит transform обеим дугам и data-progress; animateRing запускает две анимации с одним временем', () => {
    const el = fakeEl()
    setRingValue(el, 0.75)
    expect(el.r.style.transform).toBe('rotate(180deg)')
    expect(el.l.style.transform).toBe('rotate(90deg)')
    expect(el.dataset.progress).toBe('0.75')
    const h = animateRing(el, 0, [{ to: 1, ms: 2000 }], { lag: 100 })
    expect(el.r.animate).toHaveBeenCalledTimes(1)
    expect(el.l.animate).toHaveBeenCalledTimes(1)
    expect(el.r.animate.mock.calls[0][1]).toEqual({ duration: 2000, easing: 'linear', fill: 'forwards', delay: -100 })
    const fn = () => {}
    h.onfinish = fn
    expect(el.r.animate.mock.results[0].value.onfinish).toBe(fn)
    h.cancel()
    expect(el.l.animate.mock.results[0].value.cancel).toHaveBeenCalled()
    expect(animateRing(el, 0, [], {})).toBeNull()
    expect(animateRing({ querySelector: () => null }, 0, [{ to: 1, ms: 10 }])).toBeNull()
  })
})
