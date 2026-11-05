import { describe, it, expect } from 'vitest'
import { pxPerMs, lineY, trackY, pillBox, layoutScale, centerPct, LINE_Y, PILL_H, MIN_GAP_K, MAX_SCALE } from './game2Geometry.js'
import { SPEED } from '../player/modules/rotate-phone/wordLaneTimeline.js'
import { buildTimeline, estimateTimings } from './timelinePlan.js'

const H = 812
const pill = (i, startMs) => ({ i, text: 'a', startMs, endMs: startMs + 200 })
const gaps = (pills, h, scale) => pills.slice(1).map((p, k) => { const a = pillBox(pills[k], h, scale), b = pillBox(p, h, scale); return a.top - (b.top + b.height) }) // зазор: верх ранней (она ниже) минус низ следующей

describe('раскладка ленты', () => {
  it('скорость — SPEED игры; линия «сейчас» на 55 %', () => {
    expect(pxPerMs(H) * 1000).toBeCloseTo((SPEED / 100) * H)
    expect(lineY(H)).toBe((LINE_Y / 100) * H)
    expect(LINE_Y).toBe(55)
  })
  it('центр пилюли доезжает до линии ровно в startMs; высота у всех одна', () => {
    const b = pillBox(pill(0, 1500), H)
    expect(trackY(1500, H) + b.top + b.height / 2).toBeCloseTo(lineY(H), 0)
    expect(trackY(1000, H) + b.top + b.height / 2).toBeLessThan(lineY(H))
    expect(pillBox(pill(1, 10), H).height).toBe(PILL_H)
  })
  it('редкие слова: лента не растягивается (scale 1), зазор больше минимума', () => {
    const ps = [pill(0, 1500), pill(1, 2500), pill(2, 3500)]
    expect(layoutScale(ps, H)).toBe(1)
    for (const g of gaps(ps, H, 1)) expect(g).toBeGreaterThanOrEqual(PILL_H * MIN_GAP_K)
  })
  it('плотные тайминги: растяжка одна на всю фразу, зазор между любыми соседями ≥ 0,4 высоты пилюли', () => {
    for (const step of [90, 100, 150, 200, 300]) {
      const ps = Array.from({ length: 8 }, (_, k) => pill(k, 1500 + k * step))
      const s = layoutScale(ps, H)
      expect(s).toBeGreaterThanOrEqual(step < 292 ? 1.01 : 1)
      for (const g of gaps(ps, H, s)) expect(g).toBeGreaterThanOrEqual(PILL_H * MIN_GAP_K - 1) // −1: округление top
    }
  })
  it('неравномерная фраза: растяжка по самой тесной паре, потолок MAX_SCALE', () => {
    const ps = [pill(0, 1500), pill(1, 2500), pill(2, 2620), pill(3, 3500)]
    const s = layoutScale(ps, H)
    for (const g of gaps(ps, H, s)) expect(g).toBeGreaterThanOrEqual(PILL_H * MIN_GAP_K - 1)
    expect(layoutScale([pill(0, 1000), pill(1, 1000)], H)).toBe(MAX_SCALE)
  })
  it('оценка таймингов на длинной фразе: зазоры соблюдены, в «Скорости» ×1,2 растяжка не меньше', () => {
    const words = ['I', 'want', 'to', 'go', 'to', 'the', 'park', 'today']
    const tl = rate => buildTimeline({ words, due: [], timings: estimateTimings(words), durationS: 2.5, rate })
    const s1 = layoutScale(tl(1).pills, H), s2 = layoutScale(tl(1.2).pills, H)
    expect(s2).toBeGreaterThanOrEqual(s1)
    for (const g of gaps(tl(1.2).pills, H, s2)) expect(g).toBeGreaterThanOrEqual(PILL_H * MIN_GAP_K - 1)
  })
  it('центр пилюли в % высоты — откуда стартует взлёт', () => {
    const b = pillBox(pill(0, 1500), H)
    expect(centerPct(b, 1500, H)).toBeCloseTo(LINE_Y, 0)
  })
})
