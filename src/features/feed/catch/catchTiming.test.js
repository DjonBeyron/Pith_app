import { describe, it, expect } from 'vitest'
import {
  CATCH_COLLAPSE_MS, CATCH_EXPLODE_STEP_MS, CATCH_EXPLODE_OVERLAP, CATCH_COMPARE_GAP_MS, CATCH_RULE_MS,
  explodeAt, compareDelay, factDelay,
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
})
