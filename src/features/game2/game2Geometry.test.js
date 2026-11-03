import { describe, it, expect } from 'vitest'
import { pxPerMs, lineY, trackY, pillBox, centerPct, LINE_Y, MIN_PILL_PX, SMALL_PILL_PX, PILL_GAP_PX } from './game2Geometry.js'
import { SPEED } from '../player/modules/rotate-phone/wordLaneTimeline.js'

const H = 800
const pill = (startMs, endMs, extra = {}) => ({ i: 0, text: 'a', startMs, endMs, ...extra })

describe('раскладка ленты', () => {
  it('скорость — SPEED игры; линия «сейчас» на 55 %', () => {
    expect(pxPerMs(H) * 1000).toBeCloseTo((SPEED / 100) * H)
    expect(lineY(H)).toBe((LINE_Y / 100) * H)
    expect(LINE_Y).toBe(55)
  })
  it('нижний край пилюли доезжает до линии ровно в startMs и проходит её, пока звучит слово', () => {
    const b = pillBox(pill(1500, 2000), null, H)
    const bottomAt = t => trackY(t, H) + b.top + b.height
    expect(bottomAt(1500)).toBeCloseTo(lineY(H), 0)
    expect(bottomAt(1000)).toBeLessThan(lineY(H))
    expect(trackY(2000, H) + b.top).toBeCloseTo(lineY(H), -1) // к концу слова линия у верхнего края (длина = слово × скорость)
  })
  it('короткие слова не ниже минимума, служебные ниже обычных, соседи не наезжают друг на друга', () => {
    expect(pillBox(pill(0, 50), null, H).height).toBe(MIN_PILL_PX)
    expect(pillBox(pill(0, 50, { small: true }), null, H).height).toBe(SMALL_PILL_PX)
    const a = pill(1000, 1100), b = pill(1120, 1500)
    const box = pillBox(a, b, H)
    const nb = pillBox(b, null, H)
    expect(box.top - (nb.top + nb.height)).toBeGreaterThanOrEqual(PILL_GAP_PX) // между верхним краем ранней пилюли (она ниже) и нижним краем следующей — зазор
    expect(box.height).toBeLessThan(MIN_PILL_PX) // слова вплотную — пилюля сжата, чтобы не наезжать
  })
  it('центр пилюли в % высоты — откуда стартует взлёт', () => {
    const b = pillBox(pill(1500, 2000), null, H)
    const c = centerPct(b, 1500, H)
    expect(c).toBeLessThan(LINE_Y); expect(c).toBeGreaterThan(30)
  })
})
