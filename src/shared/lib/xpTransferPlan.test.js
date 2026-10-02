import { describe, it, expect } from 'vitest'
import { MAX_PARTICLES, particleCount, particleShares, departGap } from './xpTransferPlan.js'

describe('XP-перенос: шарики', () => {
  it('шариков столько же, сколько XP, но не больше десяти', () => {
    expect([0, 1, 3, 9, 10, 11, 50, 500].map(particleCount)).toEqual([0, 1, 3, 9, 10, 10, 10, 10])
    expect(MAX_PARTICLES).toBe(10)
    expect(particleCount(-5)).toBe(0)
    expect(particleCount(NaN)).toBe(0)
  })

  it('до десяти XP каждый шарик уносит ровно 1 XP', () => {
    expect(particleShares(3)).toEqual([1, 1, 1])
    expect(particleShares(9)).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1])
  })

  it('больше десяти — награда делится между десятью, сумма всегда равна награде', () => {
    expect(particleShares(11)).toEqual([2, 1, 1, 1, 1, 1, 1, 1, 1, 1])
    expect(particleShares(50)).toEqual(Array(10).fill(5))
    for (const xp of [12, 17, 25, 37, 99, 120, 501]) {
      const shares = particleShares(xp)
      expect(shares).toHaveLength(10)
      expect(shares.reduce((a, b) => a + b, 0)).toBe(xp)
      expect(Math.max(...shares) - Math.min(...shares)).toBeLessThanOrEqual(1) // доли отличаются не больше чем на 1
    }
  })

  it('нет награды — нет шариков', () => {
    expect(particleShares(0)).toEqual([])
  })

  it('пауза между вылетами: от 230 до 420 мс', () => {
    expect(departGap(10)).toBe(230)
    expect(departGap(1)).toBe(420)
    expect(departGap(3)).toBe(420)
    expect(departGap(7)).toBeCloseTo(328.57, 1)
  })
})
