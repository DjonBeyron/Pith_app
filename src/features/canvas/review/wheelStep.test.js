import { describe, it, expect } from 'vitest'
import { wheelStep } from './wheelStep.js'

describe('wheelStep: колесо ленты разбора не теряет дробные дельты', () => {
  it('целая дельта проходит как есть, остатка нет', () => {
    expect(wheelStep(0, 100, 0)).toEqual({ px: 100, carry: 0 })
  })
  it('0,4 px много раз подряд складываются: за 100 событий — 40 px', () => {
    let carry = 0, sum = 0
    for (let i = 0; i < 100; i++) { const s = wheelStep(carry, 0.4, 0); carry = s.carry; sum += s.px }
    expect(sum + carry).toBeCloseTo(40, 6)
    expect(sum).toBeGreaterThanOrEqual(39)
  })
  it('вверх (отрицательные дельты) копятся так же', () => {
    let carry = 0, sum = 0
    for (let i = 0; i < 10; i++) { const s = wheelStep(carry, -1.2, 0); carry = s.carry; sum += s.px }
    expect(sum + carry).toBeCloseTo(-12, 6)
    expect(sum).toBeLessThanOrEqual(-11)
  })
  it('строки (deltaMode 1) — по 40 px, страницы (2) — по высоте ленты', () => {
    expect(wheelStep(0, 3, 1).px).toBe(120)
    expect(wheelStep(0, 1, 2, 700).px).toBe(700)
  })
})
