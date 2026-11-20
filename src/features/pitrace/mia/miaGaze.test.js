import { describe, it, expect } from 'vitest'
import { GAZE, pickPill, lookOf, stepGaze } from './miaGaze.js'

describe('взгляд Пита в коробке', () => {
  it('следит только с 30 % до 70 % пути пилюли', () => {
    expect(pickPill([{ p: 0.1, dx: -1 }, { p: 0.29, dx: 0 }, { p: 0.71, dx: 1 }])).toBeNull()
    expect(pickPill([{ p: 0.3, dx: -1 }])?.dx).toBe(-1)
    expect(pickPill([{ p: 0.7, dx: 1 }])?.dx).toBe(1)
  })
  it('из нескольких пилюль берёт ту, что ушла дальше', () => {
    expect(pickPill([{ p: 0.35, dx: -1 }, { p: 0.6, dx: 1 }, { p: 0.1, dx: 0 }]).dx).toBe(1)
  })
  it('взгляд по дорожке: влево — минус, по центру — 0, вправо — плюс, не дальше предела', () => {
    expect(lookOf(-1)).toBe(-GAZE.MAX); expect(lookOf(0)).toBe(0); expect(lookOf(1)).toBe(GAZE.MAX); expect(lookOf(5)).toBe(GAZE.MAX)
  })
  it('идёт к цели плавно, а не прыжком', () => {
    let g = { look: 0, w: 0 }
    g = stepGaze(g, { pill: { dx: 1 }, talking: false, dt: 0.05 })
    expect(g.look).toBeGreaterThan(0); expect(g.look).toBeLessThan(GAZE.MAX); expect(g.w).toBeGreaterThan(0); expect(g.w).toBeLessThan(1)
    for (let i = 0; i < 60; i++) g = stepGaze(g, { pill: { dx: 1 }, talking: false, dt: 0.05 })
    expect(g.look).toBeCloseTo(GAZE.MAX, 1); expect(g.w).toBeCloseTo(1, 1)
  })
  it('пилюля прошла — глаза медленно отводятся (дольше, чем идут на неё) и возвращаются к своей жизни', () => {
    let a = { look: GAZE.MAX, w: 1 }, b = { look: 0, w: 0 }
    a = stepGaze(a, { pill: null, talking: false, dt: 0.2 }); b = stepGaze(b, { pill: { dx: 1 }, talking: false, dt: 0.2 })
    expect(1 - a.look / GAZE.MAX).toBeLessThan(b.look / GAZE.MAX) // отвод медленнее наведения
    for (let i = 0; i < 100; i++) a = stepGaze(a, { pill: null, talking: false, dt: 0.05 })
    expect(Math.abs(a.look)).toBeLessThan(0.05); expect(a.w).toBeLessThan(0.05)
  })
  it('когда Пит говорит, он смотрит прямо — по перспективе чуть влево — и не следит за пилюлей', () => {
    let g = { look: 3, w: 0.5 }
    for (let i = 0; i < 60; i++) g = stepGaze(g, { pill: { dx: 1 }, talking: true, dt: 0.05 })
    expect(g.look).toBeCloseTo(GAZE.SPEAK, 1); expect(GAZE.SPEAK).toBeLessThan(0); expect(GAZE.SPEAK).toBeGreaterThan(-GAZE.MAX)
  })
})
