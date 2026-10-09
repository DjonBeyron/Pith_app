import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { morphShape, morphDelay, MORPH_MS, MORPH_SPLIT, CIRCLE_PX, RECT_H, RECT_RADIUS } from './sayMorph.js'

const css = readFileSync(new URL('../../../styles/player/panels/say-phrase-mic.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

describe('морфинг кнопки в круг: порядок шагов (чистая функция)', () => {
  const W = 311
  it('форма в концах: прямоугольник во всю ширину → круг CIRCLE_PX с полным скруглением', () => {
    expect(morphShape(0, W)).toEqual({ width: W, height: RECT_H, radius: RECT_RADIUS })
    expect(morphShape(1, W)).toEqual({ width: CIRCLE_PX, height: CIRCLE_PX, radius: CIRCLE_PX / 2 })
  })

  it('ШАГ 1 (первая половина): ширина сужается до круга, высота и скругление углов НЕ меняются', () => {
    for (let p = 0; p <= MORPH_SPLIT; p += 0.05) {
      const s = morphShape(p, W)
      expect(s.height).toBe(RECT_H)
      expect(s.radius).toBe(RECT_RADIUS)
    }
    expect(morphShape(0.25, W).width).toBeLessThan(W)
    expect(morphShape(0.25, W).width).toBeGreaterThan(CIRCLE_PX)
    expect(morphShape(MORPH_SPLIT, W).width).toBe(CIRCLE_PX)
  })

  it('ШАГ 2: углы и высота меняются, ТОЛЬКО когда ширина уже равна кругу; ширина больше не меняется', () => {
    for (let p = MORPH_SPLIT + 0.05; p <= 1; p += 0.05) {
      const s = morphShape(p, W)
      expect(s.width).toBe(CIRCLE_PX)
      expect(s.height).toBeGreaterThan(RECT_H)
      expect(s.radius).toBeGreaterThan(RECT_RADIUS)
      expect(s.radius).toBeLessThanOrEqual(s.height / 2 + 1e-9) // углы никогда не «шире» половины высоты — получается круг, а не клякса
    }
  })

  it('обратный морфинг — те же формы в обратном порядке (p → 1 − p)', () => {
    expect(morphShape(0.75, W)).toEqual({ width: CIRCLE_PX, height: (RECT_H + CIRCLE_PX) / 2, radius: (RECT_RADIUS + CIRCLE_PX / 2) / 2 })
  })

  it('длительность 420–520 мс; при «уменьшить движение» ждать нечего', () => {
    expect(MORPH_MS).toBeGreaterThanOrEqual(420)
    expect(MORPH_MS).toBeLessThanOrEqual(520)
    expect(morphDelay(false)).toBe(MORPH_MS)
    expect(morphDelay(true)).toBe(0)
  })
})

describe('CSS морфинга совпадает с константами и порядком шагов', () => {
  const frames = name => {
    const body = css.match(new RegExp(`@keyframes ${name} \\{([\\s\\S]*?)\\n\\}`))[1]
    return [...body.matchAll(/(\d+)%\s*\{([^}]*)\}/g)].map(([, pct, decl]) => ({
      pct: Number(pct),
      width: decl.match(/width:\s*([\w.%]+)/)[1],
      height: decl.match(/height:\s*([\w.%]+)/)[1],
      radius: decl.match(/border-radius:\s*([\w.%]+)/)[1],
    }))
  }

  it('sayMorphIn: 0% прямоугольник → 50% ширина круга при той же высоте и радиусе → 100% круг; делит время ровно по MORPH_SPLIT', () => {
    const f = frames('sayMorphIn')
    expect(f.map(x => x.pct)).toEqual([0, MORPH_SPLIT * 100, 100])
    expect(f[0]).toMatchObject({ width: '100%', height: `${RECT_H}px`, radius: `${RECT_RADIUS}px` })
    expect(f[1]).toMatchObject({ width: `${CIRCLE_PX}px`, height: `${RECT_H}px`, radius: `${RECT_RADIUS}px` }) // шаг 1: меняется только ширина
    expect(f[2]).toMatchObject({ width: `${CIRCLE_PX}px`, height: `${CIRCLE_PX}px`, radius: `${CIRCLE_PX / 2}px` }) // шаг 2: ширина та же, растут высота и углы
  })

  it('sayMorphOut — то же в обратном порядке: сперва высота и углы, потом ширина', () => {
    const f = frames('sayMorphOut')
    expect(f[0]).toMatchObject({ width: `${CIRCLE_PX}px`, height: `${CIRCLE_PX}px`, radius: `${CIRCLE_PX / 2}px` })
    expect(f[1]).toMatchObject({ width: `${CIRCLE_PX}px`, height: `${RECT_H}px`, radius: `${RECT_RADIUS}px` })
    expect(f[2]).toMatchObject({ width: '100%', height: `${RECT_H}px`, radius: `${RECT_RADIUS}px` })
  })

  const secs = String(MORPH_MS / 1000).replace(/^0/, '') // .48
  it('длительность анимации = MORPH_MS; круг в конечном состоянии = CIRCLE_PX; reduced-motion — без анимации', () => {
    expect(css).toMatch(new RegExp(`\\.sayMicBtn--in \\{[^}]*width: ${CIRCLE_PX}px; height: ${CIRCLE_PX}px; border-radius: ${CIRCLE_PX / 2}px; animation: sayMorphIn ${secs}s`))
    expect(css).toMatch(new RegExp(`\\.sayMicBtn--out \\{ animation: sayMorphOut ${secs}s`))
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{\s*\.sayPanel \.sayMicBtn--in, \.sayPanel \.sayMicBtn--out \{ animation: none; \}/)
  })
})
