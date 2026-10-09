import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  CATCH_COLLAPSE_MS, CATCH_EXPLODE_STEP_MS, CATCH_EXPLODE_OVERLAP, CATCH_COMPARE_GAP_MS, CATCH_RULE_MS,
  CATCH_COLOR_MS, CATCH_COMPRESS_HOLD_MS, CATCH_FACT_FADE_MS, CATCH_FACT_REVEAL_MS, CATCH_FACT_PAUSE_MS, CATCH_COMPRESS_MS, CATCH_GLINT_GAP_MS, explodeAt, compareDelay, factDelay, compressDelay, glintDelay,
} from './catchTiming.js'
import { EXPLODE_MS } from '../phraseBubbleConsts.js'

const css = readFileSync(new URL('../../../styles/feed-catch-fact.css', import.meta.url), 'utf8')

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

  it('блеск факта: один проход 800мс, пауза 400мс сверх раскладки; числа совпадают с feed-catch-fact.css', () => {
    expect(CATCH_FACT_REVEAL_MS).toBe(800)
    expect(CATCH_FACT_FADE_MS).toBe(220)
    expect(CATCH_FACT_PAUSE_MS).toBeGreaterThanOrEqual(350)
    expect(CATCH_FACT_PAUSE_MS).toBeLessThanOrEqual(450)
    expect(CATCH_FACT_REVEAL_MS).toBeGreaterThanOrEqual(700)
    expect(CATCH_FACT_REVEAL_MS).toBeLessThanOrEqual(900)
    expect(css).toMatch(new RegExp(`animation: catchFactCurtain ${CATCH_FACT_REVEAL_MS}ms `))
    expect(css).toMatch(new RegExp(`animation: catchFactLit ${CATCH_FACT_REVEAL_MS}ms `))
    expect(css).toMatch(new RegExp(`animation: catchFactIn ${CATCH_FACT_FADE_MS}ms `))
  })

  it('блеск строки факта — позже всего: после сжатия фраз к центру, паузы и ещё 400мс; призрак строки проявляется раньше', () => {
    for (const n of [1, 3, 5, 8]) {
      expect(glintDelay(n)).toBe(compressDelay(n) + CATCH_COMPRESS_MS + CATCH_GLINT_GAP_MS + CATCH_FACT_PAUSE_MS)
      expect(glintDelay(n)).toBeGreaterThan(factDelay(n) + CATCH_FACT_FADE_MS) // призрак уже виден, когда блеск стартует
      expect(glintDelay(n)).toBeGreaterThanOrEqual(compressDelay(n) + CATCH_COMPRESS_MS + CATCH_FACT_PAUSE_MS) // сжатие закончилось + пауза
    }
  })
})

describe('CSS блеска факта (feed-catch-fact.css)', () => {
  const block = css
  const rules = block.replace(/\/\*[\s\S]*?\*\//g, '') // без комментариев

  it('шторка двойным transform: оба слоя анимируются с одной кривой и одним временем, задержка --catch-glint-delay', () => {
    const curtain = rules.match(/\.catchFactCurtain \{[^}]*\}/)[0]
    const lit = rules.match(/\.catchFactLit \{[^}]*\}/)[0]
    const timing = c => c.match(/animation: \w+ (\d+ms) (cubic-bezier\([^)]*\)) var\(--catch-glint-delay/).slice(1).join(' ')
    expect(timing(curtain)).toBe(timing(lit))
    expect(css).toMatch(/@keyframes catchFactCurtain \{\s*from \{ transform: translateX\(calc\(-100% - 20px\)\); \}\s*to\s+\{ transform: translateX\(20px\); \}/)
    expect(css).toMatch(/@keyframes catchFactLit \{\s*from \{ transform: translateX\(calc\(100% \+ 20px\)\); \}\s*to\s+\{ transform: translateX\(-20px\); \}/)
    expect(rules).toMatch(/\.catchFactClip \{[^}]*overflow: hidden/) // режет яркую копию по ДВИЖУЩЕМУСЯ фронту, а не по неподвижной строке
    expect(rules).toMatch(/\.catchFactReveal \{[^}]*overflow: hidden/)
    expect(rules).toMatch(/\.catchFactSweep \{[^}]*right: -20px;[^}]*width: 40px/) // полоса по центру фронта шторки
  })

  it('призрак тусклый (0.15-0.2), без тяжёлых эффектов и без остатков старого блика', () => {
    const ghost = +rules.match(/\.catchFactBase \{[^}]*rgba\(255, 255, 255, ([\d.]+)\)/)[1]
    expect(ghost).toBeGreaterThanOrEqual(0.15)
    expect(ghost).toBeLessThanOrEqual(0.2)
    expect(rules).not.toMatch(/mask-image|background-position|filter:|backdrop-filter|box-shadow|text-shadow/)
    expect(css).not.toMatch(/catchFactGlint/)
    expect(css).not.toMatch(/@keyframes catchFactGlint/)
  })

  it('prefers-reduced-motion: без анимации строка сразу яркая, полосы нет', () => {
    const rm = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(rm).toMatch(/\.catchFactCurtain,\s*\.catchFactLit \{ animation: none; \}/)
    expect(rm).toMatch(/\.catchFactCurtain,\s*\.catchFactLit \{ transform: none; \}/)
    expect(rm).toMatch(/\.catchFactSweep \{ display: none; \}/)
  })
})
