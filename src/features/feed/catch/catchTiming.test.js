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
    expect(css).toMatch(new RegExp(`catchFactGlint ${CATCH_FACT_REVEAL_MS}ms `))
    expect(css).toMatch(new RegExp(`catchFactIn ${CATCH_FACT_FADE_MS}ms `))
  })

  it('блеск строки факта — позже всего: после сжатия фраз к центру, паузы и ещё 400мс; призрак строки проявляется раньше', () => {
    for (const n of [1, 3, 5, 8]) {
      expect(glintDelay(n)).toBe(compressDelay(n) + CATCH_COMPRESS_MS + CATCH_GLINT_GAP_MS + CATCH_FACT_PAUSE_MS)
      expect(glintDelay(n)).toBeGreaterThan(factDelay(n) + CATCH_FACT_FADE_MS) // призрак уже виден, когда блеск стартует
      expect(glintDelay(n)).toBeGreaterThanOrEqual(compressDelay(n) + CATCH_COMPRESS_MS + CATCH_FACT_PAUSE_MS) // сжатие закончилось + пауза
    }
  })
})

describe('CSS блеска факта (feed-catch-fact.css): блестит сам текст, не полоса', () => {
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, '') // без комментариев
  const text = rules.match(/\.catchFactText \{[^}]*\}/)[0]
  const jsx = readFileSync(new URL('./CatchFact.jsx', import.meta.url), 'utf8')

  it('буквы красит градиент: background-clip: text, прозрачный цвет, ничего вне букв', () => {
    expect(text).toMatch(/(?<!-webkit-)background-clip: text/)
    expect(text).toMatch(/-webkit-background-clip: text/)
    expect(text).toMatch(/color: transparent/)
    expect(text).toMatch(/-webkit-text-fill-color: transparent/)
    expect(text).toMatch(/background-image: linear-gradient/)
  })

  it('нет полосы/шторки/бара: ни элементов, ни стилей, ни старого блика', () => {
    expect(rules).not.toMatch(/catchFactSweep|catchFactCurtain|catchFactClip|catchFactLit|catchFactReveal|catchFactBase|\.catchFactGlint/)
    expect(jsx).not.toMatch(/Sweep|Curtain|Clip|Lit|Reveal|Base/)
    expect(rules).not.toMatch(/mask-image|filter:|backdrop-filter|box-shadow|text-shadow|mix-blend-mode|blur\(/)
    expect(rules).not.toMatch(/position: absolute/) // единственный элемент в потоке: высота слота не меняется
    expect(rules).toMatch(/\.catchFactSlot \{ height: 76px; \}/)
  })

  it('градиент: слева итог 0.9, пик ≤ 1.0 у фронта, справа тусклый призрак 0.15-0.2; один проход background-position', () => {
    const alphas = [...text.matchAll(/linear-gradient\(([\s\S]*?)\);/g)][0][1].match(/rgba\(255, 255, 255, ([\d.]+)\)/g).map(c => +c.match(/([\d.]+)\)$/)[1])
    expect(alphas).toEqual([0.9, 1, 0.18])
    expect(alphas[2]).toBeGreaterThanOrEqual(0.15)
    expect(alphas[2]).toBeLessThanOrEqual(0.2)
    expect(text).toMatch(/background-position: 100% 0/) // до блеска фронт за левым краем — строка тусклая
    expect(css).toMatch(/@keyframes catchFactGlint \{\s*from \{ background-position: 100% 0; \}\s*to\s+\{ background-position: 0 0; \}/)
    expect(text).toMatch(/catchFactGlint \d+ms [^;]*var\(--catch-glint-delay[^;]*1 both/) // один проход, ждёт --catch-glint-delay
    expect(text).toMatch(/catchFactIn 220ms ease-out var\(--catch-fact-delay/)
  })

  it('prefers-reduced-motion: без анимации строка сразу яркая (левая, равномерная часть градиента)', () => {
    const rm = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(rm).toMatch(/\.catchFactText \{ animation: none; background-position: 0 0; \}/)
  })
})
