import { describe, it, expect } from 'vitest'
import { fitFor, nextFit, fontPx, FIT_NONE, CATCH_MIN_SCALE } from './catchFit.js'

describe('fitFor', () => {
  it('влезает — масштаб 1, без переноса; нет замера — то же', () => {
    expect(fitFor(300, 350)).toEqual(FIT_NONE)
    expect(fitFor(0, 350)).toEqual(FIT_NONE)
    expect(fitFor(300, 0)).toEqual(FIT_NONE)
  })
  it('не влезает — пропорциональное уменьшение (вниз до сотых), строка получается не шире доступной', () => {
    const f = fitFor(400, 300)
    expect(f.wrap).toBe(false)
    expect(f.scale).toBeLessThan(0.75)
    expect(f.scale * 400).toBeLessThanOrEqual(300)
  })
  it('очень длинная — минимум и перенос как запасной вариант', () => {
    expect(fitFor(900, 300)).toEqual({ scale: CATCH_MIN_SCALE, wrap: true })
  })
})

describe('nextFit', () => {
  it('тот же результат — тот же объект; мелкое увеличение игнорируется, уменьшение и возврат к 1 — нет', () => {
    const cur = { scale: 0.7, wrap: false }
    expect(nextFit(cur, 400, 400 * 0.7 + 2)).toBe(cur)
    expect(nextFit(cur, 400, 400 * 0.71 + 2.5)).toBe(cur)
    expect(nextFit(cur, 400, 400 * 0.66 + 2).scale).toBeLessThan(0.7)
    expect(nextFit(cur, 400, 500)).toEqual(FIT_NONE)
  })
})

describe('fontPx', () => {
  it('масштаб 1 — 17px, пропорционально и с округлением до сотых', () => {
    expect(fontPx(1)).toBe(17)
    expect(fontPx(0.5)).toBe(8.5)
    expect(fontPx(0.77)).toBe(13.09)
  })
})
