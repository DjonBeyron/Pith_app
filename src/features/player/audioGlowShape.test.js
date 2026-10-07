import { describe, it, expect } from 'vitest'
import { profile, bandWeights, glowContour, contourDelta, POINTS, PROFILE_MIN } from './audioGlowShape.js'

const bands = arr => Float32Array.from(arr)

describe('profile: углы выше центра', () => {
  it('монотонно растёт от центра (PROFILE_MIN) к краю (1)', () => {
    expect(profile(0)).toBeCloseTo(PROFILE_MIN, 5)
    expect(profile(1)).toBeCloseTo(1, 5)
    let prev = -1
    for (let d = 0; d <= 1; d += 0.05) { expect(profile(d)).toBeGreaterThan(prev); prev = profile(d) }
    expect(PROFILE_MIN).toBeGreaterThanOrEqual(0.35)
    expect(PROFILE_MIN).toBeLessThanOrEqual(0.4)
  })
})

describe('bandWeights: низ — к углам, верх — к центру', () => {
  it('низкие полосы растут с d, высокие — с (1−d)', () => {
    const c = bandWeights(0), e = bandWeights(1)
    expect(c[0]).toBeLessThan(e[0]); expect(c[1]).toBeLessThan(e[1])
    expect(c[2]).toBeGreaterThan(e[2]); expect(c[3]).toBeGreaterThan(e[3])
    expect(e[0]).toBeCloseTo(1, 5); expect(e[3]).toBeCloseTo(0, 5)
    expect(c[3]).toBeCloseTo(1, 5); expect(c[0]).toBeCloseTo(0, 5)
  })
})

describe('glowContour', () => {
  it('симметричен, в пределах 0..1, только низ → свет в углах, только верх → в центре', () => {
    const low = glowContour(bands([1, 0.2, 0, 0]), 0)
    const high = glowContour(bands([0, 0, 0.3, 1]), 0)
    for (const c of [low, high]) {
      expect(c.length).toBe(POINTS)
      for (let i = 0; i < POINTS; i++) {
        expect(c[i]).toBeGreaterThanOrEqual(0); expect(c[i]).toBeLessThanOrEqual(1)
      }
    }
    const mid = POINTS / 2
    // Симметрия — одинаковая форма без «дыхания» (t = 0 даёт лёгкую асимметрию, сравниваем ≈)
    expect(Math.abs(low[0] - low[POINTS - 1])).toBeLessThan(0.1)
    expect(low[0]).toBeGreaterThan(low[mid] * 2)       // низ: углы заметно выше центра
    expect(high[mid]).toBeGreaterThan(high[0] * 1.5)    // верх: центр выше углов
    expect(high[mid]).toBeLessThan(low[0])              // но центр не выше пика углов (profile)
  })

  it('тишина — тонкая кромка, полный спектр — пик у углов ≈ 1', () => {
    const silent = glowContour(bands([0, 0, 0, 0]), 1)
    for (let i = 0; i < POINTS; i++) expect(silent[i]).toBeLessThanOrEqual(0.03)
    const full = glowContour(bands([1, 1, 1, 1]), 1)
    expect(full[0]).toBeGreaterThan(0.85)
    expect(full[POINTS / 2]).toBeLessThan(0.45)
  })

  it('contourDelta — наибольший сдвиг', () => {
    const a = bands([0.1, 0.2, 0.3]), b = bands([0.1, 0.25, 0.1])
    expect(contourDelta(a, b)).toBeCloseTo(0.2, 5)
  })
})
