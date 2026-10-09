import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  morphShape, morphDelay, MORPH_STOPS, MORPH_MS, MORPH_OUT_MS, MORPH_SPLIT, SQUARE_PX, RECT_H, RECT_RADIUS, SQUARE_RADIUS, FAIL_HOLD_MS,
} from './sayMorph.js'

const rawCss = readFileSync(new URL('../../../styles/player/panels/say-phrase-mic.css', import.meta.url), 'utf8')
const css = rawCss.replace(/\/\*[\s\S]*?\*\//g, '')
const popCss = readFileSync(new URL('../../../styles/pop-spring.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

describe('морфинг кнопки в квадрат: форма по прогрессу (чистая функция)', () => {
  const W = 311
  it('концы: прямоугольник во всю ширину → квадрат SQUARE_PX со своим скруглением; сторона 112–120 px', () => {
    expect(SQUARE_PX).toBeGreaterThanOrEqual(112)
    expect(SQUARE_PX).toBeLessThanOrEqual(120)
    expect(morphShape(0, W)).toEqual({ width: W, height: RECT_H, radius: RECT_RADIUS })
    expect(morphShape(1, W)).toEqual({ width: SQUARE_PX, height: SQUARE_PX, radius: SQUARE_RADIUS })
  })

  it('ШАГ 1 (до MORPH_SPLIT): ширина сужается до стороны квадрата, высота и скругление НЕ меняются', () => {
    for (let p = 0; p <= MORPH_SPLIT; p += 0.03) {
      const s = morphShape(p, W)
      expect(s.height).toBe(RECT_H)
      expect(s.radius).toBe(RECT_RADIUS)
    }
    expect(morphShape(MORPH_SPLIT / 2, W).width).toBeLessThan(W)
    expect(morphShape(MORPH_SPLIT / 2, W).width).toBeGreaterThan(SQUARE_PX)
    expect(morphShape(MORPH_SPLIT, W).width).toBe(SQUARE_PX)
  })

  it('ШАГ 2 — «резина»: высота и ширина растут с ПЕРЕЛЁТОМ ≥ 3% над стороной, потом недолёт и покой на SQUARE_PX (затухающие колебания)', () => {
    const heights = []
    const widths = []
    for (let p = MORPH_SPLIT; p <= 1 + 1e-9; p += 0.005) {
      const s = morphShape(p, W)
      heights.push(s.height)
      widths.push(s.width)
    }
    for (const arr of [heights, widths]) {
      const max = Math.max(...arr)
      const peakAt = arr.indexOf(max)
      expect(max).toBeGreaterThanOrEqual(SQUARE_PX * 1.03) // перелёт
      expect(Math.min(...arr.slice(peakAt))).toBeLessThan(SQUARE_PX) // недолёт после перелёта
      expect(arr.at(-1)).toBeCloseTo(SQUARE_PX, 6) // покой
    }
    // колебания затухают: перелёт больше недолёта
    const over = Math.max(...heights) - SQUARE_PX
    const under = SQUARE_PX - Math.min(...heights.slice(heights.indexOf(Math.max(...heights))))
    expect(over).toBeGreaterThan(under)
  })

  it('пропорции времени пружины — как у popSpringIn (перелёт на 42%, недолёт на 72% пружинной части)', () => {
    const spring = f => MORPH_SPLIT + (1 - MORPH_SPLIT) * f
    expect(MORPH_STOPS[2].p).toBeCloseTo(spring(0.42), 10)
    expect(MORPH_STOPS[3].p).toBeCloseTo(spring(0.72), 10)
    expect(popCss).toMatch(/42%\s*\{[^}]*scale\(1\.01\)/)
    expect(popCss).toMatch(/72%\s*\{[^}]*scale\(0\.998\)/)
  })

  it('длительность «туда» 480–560 мс (≈ pop-spring 450 мс); «обратно» мягче и короче; при «уменьшить движение» ждать нечего; крестик держится 0,9–1,1 с', () => {
    expect(MORPH_MS).toBeGreaterThanOrEqual(480)
    expect(MORPH_MS).toBeLessThanOrEqual(560)
    expect(MORPH_OUT_MS).toBeLessThan(MORPH_MS)
    expect(morphDelay(false)).toBe(MORPH_MS)
    expect(morphDelay(true)).toBe(0)
    expect(FAIL_HOLD_MS).toBeGreaterThanOrEqual(900)
    expect(FAIL_HOLD_MS).toBeLessThanOrEqual(1100)
  })
})

describe('CSS морфинга совпадает с MORPH_STOPS (одни и те же числа и кривые)', () => {
  const frames = name => {
    const body = css.match(new RegExp(`@keyframes ${name} \\{([\\s\\S]*?)\\n\\}`))[1]
    return [...body.matchAll(/([\d.]+)%\s*\{([^}]*)\}/g)].map(([, pct, decl]) => ({
      pct: Number(pct),
      width: decl.match(/width:\s*([\w.%]+)/)[1],
      height: decl.match(/height:\s*([\w.%]+)/)[1],
      radius: decl.match(/border-radius:\s*([\w.%]+)/)[1],
      ease: decl.match(/animation-timing-function:\s*([^;]+);/)?.[1].trim(),
    }))
  }

  it('sayMorphIn: ключевые кадры = MORPH_STOPS (проценты, width/height/radius)', () => {
    const f = frames('sayMorphIn')
    expect(f).toHaveLength(MORPH_STOPS.length)
    MORPH_STOPS.forEach((stop, i) => {
      expect(f[i].pct).toBeCloseTo(stop.p * 100, 6)
      expect(f[i].width).toBe(stop.w == null ? '100%' : `${stop.w}px`)
      expect(f[i].height).toBe(`${stop.h}px`)
      expect(f[i].radius).toBe(`${stop.r}px`)
    })
  })

  it('кривые пружины — те же, что в popSpringIn: вылет cubic-bezier(.25,.8,.35,1), дальше ease-in-out cubic-bezier(.45,0,.55,1); шаг 1 — стандартное замедление', () => {
    const f = frames('sayMorphIn')
    expect(popCss).toContain('cubic-bezier(0.25, 0.8, 0.35, 1)')
    expect(popCss).toContain('cubic-bezier(0.45, 0, 0.55, 1)')
    expect(f[0].ease).toBe('cubic-bezier(.4, 0, .2, 1)')
    expect(f[1].ease).toBe('cubic-bezier(.25, .8, .35, 1)')
    expect(f[2].ease).toBe('cubic-bezier(.45, 0, .55, 1)')
    expect(f[3].ease).toBe('cubic-bezier(.45, 0, .55, 1)')
  })

  it('sayMorphOut: квадрат → прямоугольник мягко (два кадра, без пружины)', () => {
    const f = frames('sayMorphOut')
    expect(f).toHaveLength(2)
    expect(f[0]).toMatchObject({ width: `${SQUARE_PX}px`, height: `${SQUARE_PX}px`, radius: `${SQUARE_RADIUS}px` })
    expect(f[1]).toMatchObject({ width: '100%', height: `${RECT_H}px`, radius: `${RECT_RADIUS}px` })
  })

  const secs = ms => String(ms / 1000).replace(/^0/, '')
  it('длительности = MORPH_MS / MORPH_OUT_MS; квадрат в конце = SQUARE_PX; reduced-motion — без анимации', () => {
    expect(css).toMatch(new RegExp(`\\.sayMicBtn--in \\{ width: ${SQUARE_PX}px; height: ${SQUARE_PX}px; border-radius: ${SQUARE_RADIUS}px; animation: sayMorphIn ${secs(MORPH_MS)}s`))
    expect(css).toMatch(new RegExp(`\\.sayMicBtn--out \\{ animation: sayMorphOut ${secs(MORPH_OUT_MS)}s`))
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{\s*\.sayPanel \.sayMicBtn--in, \.sayPanel \.sayMicBtn--out \{ animation: none; \}/)
  })
})
