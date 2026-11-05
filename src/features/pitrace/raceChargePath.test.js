import { describe, it, expect } from 'vitest'
import { pathFrames, pathX, pathY, pathOpacity, WAVE_PX, PATH_FRAMES, FADE_FROM } from './raceChargePath.js'

// Траектория заставки: одна кривая, конец строго в центре бара, x сходится к центру без перегибов больше A.
const pos = f => /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(f.transform).slice(1).map(Number)

describe('траектория пилюли заставки (raceChargePath.js)', () => {
  it('кадров не меньше 24 шагов, офсеты 0…1 растут; первый кадр (0, 0), последний строго (dx, −dist) и прозрачный', () => {
    expect(PATH_FRAMES).toBeGreaterThanOrEqual(24)
    for (const [dx, dist, sign] of [[120, 640, 1], [-85.37, 702.4, -1], [3, 600, 1], [0, 650, -1]]) {
      const fr = pathFrames({ dx, dist, sign })
      expect(fr.length).toBe(PATH_FRAMES + 1); expect(fr.length).toBeGreaterThanOrEqual(25)
      expect(fr[0].offset).toBe(0); expect(fr.at(-1).offset).toBe(1)
      for (let i = 1; i < fr.length; i++) expect(fr[i].offset).toBeGreaterThan(fr[i - 1].offset)
      expect(pos(fr[0]).map(Math.abs)).toEqual([0, 0]); expect(pos(fr.at(-1))).toEqual([+dx.toFixed(2), -+dist.toFixed(2)])
      expect(fr[0].opacity).toBe(1); expect(fr.at(-1).opacity).toBe(0)
    }
  })
  it('y идёт вверх монотонно (ease-out: шаги убывают), у центра бара замедляется', () => {
    const ys = Array.from({ length: PATH_FRAMES + 1 }, (_, k) => -pathY(640, k / PATH_FRAMES))
    for (let i = 1; i < ys.length; i++) { expect(ys[i]).toBeGreaterThan(ys[i - 1]); if (i > 1) expect(ys[i] - ys[i - 1]).toBeLessThanOrEqual(ys[i - 1] - ys[i - 2] + 1e-9) }
  })
  it('x сходится к центру: отклонение от гладкого перехода не больше A, возврат дальше от центра не больше A, конец строго в центре', () => {
    expect(WAVE_PX).toBeGreaterThanOrEqual(6); expect(WAVE_PX).toBeLessThanOrEqual(8)
    for (const dx of [160, -140, 60, -60, 20]) for (const sign of [1, -1]) {
      let worstBack = 0, prev = Infinity
      for (let k = 0; k <= 300; k++) {
        const t = k / 300, x = pathX(dx, sign, t)
        expect(Math.abs(x - dx * t * t * (3 - 2 * t))).toBeLessThanOrEqual(WAVE_PX + 1e-9)
        const d = Math.abs(dx - x) // расстояние до центра бара
        if (Number.isFinite(prev)) worstBack = Math.max(worstBack, d - prev)
        prev = d
      }
      expect(worstBack).toBeLessThanOrEqual(WAVE_PX)
      expect(pathX(dx, sign, 1)).toBeCloseTo(dx, 9); expect(pathX(dx, sign, 0)).toBeCloseTo(0, 9)
    }
    for (const dx of [160, -140]) { // при большом смещении после первой полуволны (t ≥ 0,2) сходимость монотонна
      let prev = Infinity
      for (let k = 60; k <= 300; k++) { const d = Math.abs(dx - pathX(dx, 1, k / 300)); expect(d).toBeLessThanOrEqual(prev + 1e-9); prev = d }
    }
  })
  it('прозрачность: 1 до FADE_FROM, затем плавно к 0; растяжение только при trail', () => {
    expect(pathOpacity(FADE_FROM)).toBe(1); expect(pathOpacity(1)).toBe(0); expect(pathOpacity(0.95)).toBeGreaterThan(0); expect(pathOpacity(0.95)).toBeLessThan(1)
    expect(pathFrames({ dx: 50, dist: 600, sign: 1 })[3].scale).toBeUndefined()
    expect(pathFrames({ dx: 50, dist: 600, sign: 1, trail: true })[3].scale).toMatch(/^1 1\.0\d+$/)
  })
})
