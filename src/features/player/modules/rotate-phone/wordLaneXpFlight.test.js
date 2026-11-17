import { describe, it, expect } from 'vitest'
import { xpFloatFrames, xpFloatOpacity, xpPulseFrames, rectCenter, XP_FLOAT_RISE_PX, XP_FLOAT_WAVE_PX, XP_FLOAT_SCALE_FROM, XP_FLOAT_SCALE_TO } from './WordLaneXpFlight.js'
import { riseXpFrames, xpRiseX, XP_SCALE_END, XP_ARRIVE_MS, XP_MIN_PATH, XP_RISE_MS, XP_WAVE_MAX_PX, XP_TILT_MAX, flyToCounter, waveAmp, centerOf } from './wordLaneRiseXp.js'
import { RISE_DELAY_MS } from './wordLaneRise.js'

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

describe('пилюля летит в счётчик XP (wordLaneRiseXp)', () => {
  const fr = riseXpFrames(60, 12, -120, 800)
  it('первый кадр — на месте пилюли (только translate), последний — ровно у счётчика, сжата и растворена', () => {
    expect(Object.keys(fr[0]).sort()).toEqual(['offset', 'rotate', 'translate']); expect(fr[0].translate).toContain('calc(-50% + 0.00px)')
    const last = fr.at(-1); expect(last.translate).toContain('calc(-50% + -120.00px)'); expect(last.translate).toContain('12.000dvh'); expect(last.scale).toBeCloseTo(XP_SCALE_END, 2); expect(last.opacity).toBe(0)
  })
  it('по пути — синусоида поперёк линии (отклонение от прямой есть), на концах сдвиг 0', () => {
    expect(xpRiseX(0, -120)).toBeCloseTo(0, 6); expect(xpRiseX(1, -120)).toBeCloseTo(-120, 6)
    const dev = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8].map(o => Math.abs(xpRiseX(o, -120) - -120 * o)); expect(Math.max(...dev)).toBeGreaterThan(8); expect(Math.max(...dev)).toBeLessThanOrEqual(XP_WAVE_MAX_PX)
  })
  it('прилёт: от принятия до счётчика RISE_DELAY_MS + XP_RISE_MS; centerOf — центр элемента или null', () => {
    expect(XP_ARRIVE_MS).toBe(RISE_DELAY_MS + XP_RISE_MS)
    expect(centerOf({ getBoundingClientRect: () => ({ left: 10, top: 20, width: 40, height: 10 }) })).toEqual({ x: 30, y: 25 }); expect(centerOf(null)).toBeNull(); expect(centerOf({ getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0 }) })).toBeNull()
  })
})

describe('правила полёта в счётчик (v3.3.272)', () => {
  it('осталось меньше XP_MIN_PATH % высоты — просто вверх; иначе в счётчик', () => {
    expect(flyToCounter(60, 12)).toBe(true); expect(flyToCounter(12 + XP_MIN_PATH - 1, 12)).toBe(false); expect(flyToCounter(20, 12)).toBe(false)
  })
  it('волна неглубокая: размах пропорционален пути и не больше потолка (на коротком пути почти прямая)', () => {
    expect(waveAmp(40)).toBeLessThan(waveAmp(300)); expect(waveAmp(2000)).toBe(XP_WAVE_MAX_PX)
  })
  it('наклон следует за путём: на диагонали больше обычных 8°, но не больше XP_TILT_MAX', () => {
    const fr = riseXpFrames(80, 12, -260, 800), rot = fr.map(f => Math.abs(parseFloat(f.rotate)))
    expect(Math.max(...rot)).toBeGreaterThan(8); expect(Math.max(...rot)).toBeLessThanOrEqual(XP_TILT_MAX + 0.01)
  })
})

describe('пульс счётчика', () => {
  it('scale = 1 + A·sin(πt): начинается и кончается на 1, пик посередине (счётчик «распухает» заметно)', () => {
    const p = xpPulseFrames().map(f => +f.transform.match(/scale\(([\d.]+)\)/)[1])
    expect(p[0]).toBe(1); expect(p.at(-1)).toBeCloseTo(1, 6); expect(Math.max(...p)).toBeCloseTo(1.38, 3); expect(p.indexOf(Math.max(...p))).toBe(Math.floor(p.length / 2))
  })
})
