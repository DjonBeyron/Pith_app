import { describe, it, expect } from 'vitest'
import {
  CATCH_COLLAPSE_MS, CATCH_EXPLODE_STEP_MS, CATCH_COMPARE_GAP_MS, CATCH_RULE_MS, explodeAt, compareDelay, factDelay,
} from './catchTiming.js'

describe('тайминги финала «Ловли»', () => {
  it('взрывы начинаются только после сворачивания клавиатуры, дальше по шагу слева направо', () => {
    expect(explodeAt(0)).toBe(CATCH_COLLAPSE_MS)
    expect(explodeAt(3) - explodeAt(2)).toBe(CATCH_EXPLODE_STEP_MS)
    expect(CATCH_COLLAPSE_MS).toBeGreaterThanOrEqual(260)
  })
  it('сравнение проявляется после последнего облачка', () => {
    expect(compareDelay(4)).toBe(explodeAt(3) + CATCH_COMPARE_GAP_MS)
    expect(compareDelay(1)).toBe(explodeAt(0) + CATCH_COMPARE_GAP_MS)
    expect(compareDelay(0)).toBe(compareDelay(1))
  })

  it('факт проявляется после линии', () => {
    expect(factDelay(4)).toBe(compareDelay(4) + CATCH_RULE_MS)
    expect(factDelay(4)).toBeGreaterThan(compareDelay(4))
  })
})
