import { describe, it, expect } from 'vitest'
import {
  CATCH_COLLAPSE_MS, CATCH_EXPLODE_STEP_MS, CATCH_EXPLODE_OVERLAP, CATCH_COMPARE_GAP_MS, CATCH_RULE_MS,
  CATCH_COLOR_MS, CATCH_COMPRESS_HOLD_MS, CATCH_FACT_FADE_MS, CATCH_GLINT_IN_MS, CATCH_GLINT_HOLD_MS, CATCH_GLINT_OUT_MS,
  CATCH_FACT_GLINT_MS, explodeAt, compareDelay, factDelay, compressDelay,
} from './catchTiming.js'
import { EXPLODE_MS } from '../phraseBubbleConsts.js'

describe('тайминги финала «Ловли»', () => {
  it('взрывы начинаются только после сворачивания клавиатуры, дальше по шагу слева направо', () => {
    expect(explodeAt(0)).toBe(CATCH_COLLAPSE_MS)
    expect(explodeAt(3) - explodeAt(2)).toBe(CATCH_EXPLODE_STEP_MS)
    expect(CATCH_COLLAPSE_MS).toBeGreaterThanOrEqual(260)
  })

  it('соседние облачка накладываются во времени не больше чем на ~30% длины растворения', () => {
    const overlap = (EXPLODE_MS - CATCH_EXPLODE_STEP_MS) / EXPLODE_MS
    expect(overlap).toBeLessThanOrEqual(CATCH_EXPLODE_OVERLAP + 0.01)
    expect(overlap).toBeGreaterThan(0)
    expect(CATCH_EXPLODE_OVERLAP).toBeLessThanOrEqual(0.6)
  })

  it('сравнение проявляется после последнего облачка', () => {
    expect(compareDelay(4)).toBe(explodeAt(3) + CATCH_COMPARE_GAP_MS)
    expect(compareDelay(1)).toBe(explodeAt(0) + CATCH_COMPARE_GAP_MS)
    expect(compareDelay(0)).toBe(compareDelay(1))
    expect(compareDelay(4)).toBeGreaterThan(explodeAt(3)) // линия — когда последнее облачко уже взорвалось
  })

  it('факт проявляется после линии и после полного растворения последнего облачка', () => {
    for (const n of [1, 2, 4, 7]) {
      expect(factDelay(n)).toBeGreaterThanOrEqual(compareDelay(n) + CATCH_RULE_MS)
      expect(factDelay(n)).toBeGreaterThanOrEqual(explodeAt(n - 1) + EXPLODE_MS)
    }
    expect(factDelay(4)).toBeGreaterThan(compareDelay(4))
    expect(factDelay(0)).toBe(factDelay(1))
  })

  it('сжатие к центру стартует после последнего облачка, цветов сравнения и факта', () => {
    for (const n of [1, 2, 4, 7]) {
      expect(compressDelay(n)).toBeGreaterThanOrEqual(factDelay(n) + CATCH_COMPRESS_HOLD_MS)
      expect(compressDelay(n)).toBeGreaterThanOrEqual(compareDelay(n) + CATCH_COLOR_MS + CATCH_COMPRESS_HOLD_MS)
      expect(compressDelay(n)).toBeGreaterThanOrEqual(explodeAt(n - 1) + EXPLODE_MS)
    }
    expect(compressDelay(4)).toBeGreaterThan(compressDelay(2))
    expect(compressDelay(0)).toBe(compressDelay(1))
  })

  it('блик факта: один проход 120 + 250 + 450 = 820мс, проценты keyframes feed-catch-strip.css соответствуют этим числам', () => {
    expect([CATCH_GLINT_IN_MS, CATCH_GLINT_HOLD_MS, CATCH_GLINT_OUT_MS]).toEqual([120, 250, 450])
    expect(CATCH_FACT_GLINT_MS).toBe(820)
    expect(CATCH_FACT_FADE_MS).toBe(220)
    expect(+(CATCH_GLINT_IN_MS / CATCH_FACT_GLINT_MS * 100).toFixed(2)).toBe(14.63)
    expect(+((CATCH_GLINT_IN_MS + CATCH_GLINT_HOLD_MS) / CATCH_FACT_GLINT_MS * 100).toFixed(2)).toBe(45.12)
  })
})
