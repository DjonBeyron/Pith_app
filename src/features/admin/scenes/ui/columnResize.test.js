import { describe, it, expect } from 'vitest'
import { MIN_COL, DEFAULT_FRACTIONS, validFractions, normalize, toPx, toFractions, clampPx, dragWidths, fitFractions, resetFractions, ariaFor, cssVars } from './columnResize.js'

// Математика ресайза трёх колонок сборщика
const sum = a => a.reduce((x, y) => x + y, 0)

describe('columnResize', () => {
  it('validFractions / normalize: мусор → доли по умолчанию', () => {
    expect(validFractions([0.4, 0.3, 0.3])).toBe(true)
    expect(validFractions([0.5, 0.5])).toBe(false)
    expect(validFractions([0.5, 0.5, 0.5])).toBe(false)
    expect(validFractions(['a', 0.3, 0.3])).toBe(false)
    expect(normalize(null)).toEqual(DEFAULT_FRACTIONS)
    expect(sum(normalize([0.4, 0.3, 0.3]))).toBeCloseTo(1, 9)
    expect(resetFractions()).toEqual(DEFAULT_FRACTIONS)
    expect(resetFractions()).not.toBe(DEFAULT_FRACTIONS)
  })

  it('toPx / toFractions — туда и обратно', () => {
    const px = toPx([0.5, 0.25, 0.25], 1200)
    expect(px).toEqual([600, 300, 300])
    expect(toFractions(px)).toEqual([0.5, 0.25, 0.25])
    expect(toFractions([0, 0, 0])).toEqual(DEFAULT_FRACTIONS)
  })

  it('clampPx: узкая колонка подтягивается к минимуму за счёт широких, сумма та же', () => {
    const out = clampPx([900, 100, 200], 1200)
    expect(sum(out)).toBeCloseTo(1200, 6)
    expect(Math.min(...out)).toBeGreaterThanOrEqual(MIN_COL - 0.001)
    expect(out[0]).toBeLessThan(900)
    // уже всё в норме — не трогаем
    expect(clampPx([400, 400, 400], 1200)).toEqual([400, 400, 400])
    // окно уже 3 минимумов — делим пропорционально, минимум сжимается до total / 3
    const tight = clampPx([500, 100, 100], 600)
    expect(sum(tight)).toBeCloseTo(600, 6)
    expect(Math.min(...tight)).toBeCloseTo(200, 6)
  })

  it('dragWidths: двигает только пару соседей, не даёт колонке стать меньше минимума', () => {
    const start = [500, 400, 300]
    expect(dragWidths(start, 0, 50)).toEqual([550, 350, 300])
    expect(dragWidths(start, 1, -100)).toEqual([500, 300, 400])
    // упор в минимум правой колонки
    expect(dragWidths(start, 0, 1000)).toEqual([500 + (400 - MIN_COL), MIN_COL, 300])
    // упор в минимум левой
    expect(dragWidths(start, 0, -1000)).toEqual([MIN_COL, 400 + (500 - MIN_COL), 300])
    expect(dragWidths(start, 2, 10)).toEqual(start)
    expect(dragWidths(start, 0, 0)).toEqual(start)
  })

  it('fitFractions: пересчёт при изменении ширины окна соблюдает минимумы', () => {
    const fr = [0.8, 0.1, 0.1] // в узком окне колонки 2 и 3 были бы по 100px
    const fitted = fitFractions(fr, 1000)
    expect(sum(fitted)).toBeCloseTo(1, 9)
    expect(Math.min(...toPx(fitted, 1000))).toBeGreaterThanOrEqual(MIN_COL - 0.001)
    // в широком окне всё помещается — доли не меняются
    expect(fitFractions([0.4, 0.3, 0.3], 3000)).toEqual([0.4, 0.3, 0.3])
    expect(fitFractions([0.4, 0.3, 0.3], 0)).toEqual([0.4, 0.3, 0.3])
  })

  it('ariaFor: положение разделителя в процентах пары; cssVars — fr без дробей', () => {
    const a = ariaFor([600, 300, 300], 0)
    expect(a.now).toBe(67)
    expect(a.min).toBe(Math.round((100 * MIN_COL) / 900))
    expect(a.max).toBe(100 - a.min)
    expect(ariaFor([0, 0, 0], 0)).toEqual({ now: 50, min: 0, max: 100 })
    expect(cssVars([0.37, 0.3, 0.33])).toEqual({ '--scb-c1': '370fr', '--scb-c2': '300fr', '--scb-c3': '330fr' })
  })
})
