import { describe, it, expect } from 'vitest'
import { xpFloatFrames, xpFloatOpacity, xpPulseFrames, rectCenter, XP_FLOAT_RISE_PX, XP_FLOAT_WAVE_PX, XP_FLOAT_SCALE_FROM, XP_FLOAT_SCALE_TO } from './WordLaneXpFlight.js'
import { readFileSync } from 'node:fs'
import { XP_ARRIVE_MS, XP_OFFSCREEN_SHARE } from './wordLaneRiseXp.js'
import { RISE_DELAY_MS, RISE_MS } from './wordLaneRise.js'

const pos = f => { const m = f.transform.match(/translate\(([-\d.]+)px, ([-\d.]+)px\)/); return { x: +m[1], y: +m[2] } }
const scale = f => +f.transform.match(/scale\(([-\d.]+)\)$/)[1]

describe('«+N XP» от счётчика (WordLaneXpFlight)', () => {
  const from = { x: 40, y: 90 }, fr = xpFloatFrames(from)
  it('старт — в центре счётчика, невидим; уходит вверх на XP_FLOAT_RISE_PX и к концу растворяется', () => {
    expect(pos(fr[0])).toEqual(from); expect(fr[0].opacity).toBe(0)
    expect(pos(fr.at(-1)).y).toBeCloseTo(from.y - XP_FLOAT_RISE_PX, 0); expect(fr.at(-1).opacity).toBe(0)
  })
  it('идёт по синусоиде (сдвиг по x не больше размаха) и только вверх', () => {
    const xs = fr.map(f => Math.abs(pos(f).x - from.x)); expect(Math.max(...xs)).toBeGreaterThan(6); expect(Math.max(...xs)).toBeLessThanOrEqual(XP_FLOAT_WAVE_PX + 0.1)
    const ys = fr.map(f => pos(f).y); for (let i = 1; i < ys.length; i++) expect(ys[i]).toBeLessThanOrEqual(ys[i - 1])
  })
  it('число растёт: масштаб от XP_FLOAT_SCALE_FROM до XP_FLOAT_SCALE_TO, не убывая', () => {
    expect(scale(fr[0])).toBeCloseTo(XP_FLOAT_SCALE_FROM, 2); expect(scale(fr.at(-1))).toBeCloseTo(XP_FLOAT_SCALE_TO, 2)
    const sc = fr.map(scale); for (let i = 1; i < sc.length; i++) expect(sc[i]).toBeGreaterThanOrEqual(sc[i - 1])
  })
  it('прозрачность: проявляется, держится, растворяется (после пика только убывает)', () => {
    const op = fr.map(f => f.opacity), peak = op.indexOf(Math.max(...op))
    expect(Math.max(...op)).toBe(1); for (let i = 1; i <= peak; i++) expect(op[i]).toBeGreaterThanOrEqual(op[i - 1]); for (let i = peak + 1; i < op.length; i++) expect(op[i]).toBeLessThanOrEqual(op[i - 1])
    expect(xpFloatOpacity(0)).toBe(0); expect(xpFloatOpacity(1)).toBe(0)
  })
  it('rectCenter: центр прямоугольника, пустой — null', () => {
    expect(rectCenter({ left: 10, top: 20, width: 40, height: 10 })).toEqual({ x: 30, y: 25 })
    expect(rectCenter({ left: 0, top: 0, width: 0, height: 0 })).toBeNull(); expect(rectCenter(null)).toBeNull()
  })
})

describe('награда без полёта в счётчик (wordLaneRiseXp, v3.3.277)', () => {
  it('пульс счётчика и «+N XP» — когда пилюля на 90 % ушла за экран: RISE_DELAY_MS + 0,9 · RISE_MS', () => {
    expect(XP_OFFSCREEN_SHARE).toBe(0.9); expect(XP_ARRIVE_MS).toBe(RISE_DELAY_MS + Math.round(RISE_MS * 0.9)); expect(XP_ARRIVE_MS).toBeLessThan(RISE_DELAY_MS + RISE_MS)
  })
  it('пилюля взлетает старым взлётом вверх (startRise), а не в счётчик', () => {
    const pool = readFileSync(new URL('./wordLanePool.js', import.meta.url), 'utf8')
    expect(pool).toContain('startRise(parts[k].el, scr(l), RISE_DELAY_MS, RISE_END_Y)'); expect(pool).not.toContain('startRiseXp'); expect(pool).toContain('XP_ARRIVE_MS)')
  })
})

describe('пульс счётчика', () => {
  it('scale = 1 + A·sin(πt): начинается и кончается на 1, пик посередине (счётчик «распухает» заметно)', () => {
    const p = xpPulseFrames().map(f => +f.transform.match(/scale\(([\d.]+)\)/)[1])
    expect(p[0]).toBe(1); expect(p.at(-1)).toBeCloseTo(1, 6); expect(Math.max(...p)).toBeCloseTo(1.38, 3); expect(p.indexOf(Math.max(...p))).toBe(Math.floor(p.length / 2))
  })
})
