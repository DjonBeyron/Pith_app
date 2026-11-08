import { describe, it, expect } from 'vitest'
import { xpFlightFrames, xpFlightLook, xpPulseFrames, rectCenter } from './WordLaneXpFlight.js'

const pos = f => { const m = f.transform.match(/translate\(([-\d.]+)px, ([-\d.]+)px\)/); return { x: +m[1], y: +m[2] } }
const scale = f => +f.transform.match(/scale\(([-\d.]+)\)$/)[1]

describe('полёт XP в счётчик (WordLaneXpFlight)', () => {
  const from = { x: 200, y: 600 }, to = { x: 40, y: 70 }
  const fr = xpFlightFrames(from, to)

  it('первый кадр — в центре пилюли, невидим; последний — ровно в центре счётчика, растаял и сжат к 0,5', () => {
    expect(pos(fr[0])).toEqual(from)
    expect(fr[0].opacity).toBe(0)
    expect(pos(fr.at(-1))).toEqual(to)
    expect(fr.at(-1).opacity).toBe(0)
    expect(scale(fr.at(-1))).toBeCloseTo(0.5, 2)
  })

  it('в середине полёта видна целиком и масштаб ~1', () => {
    const mid = fr[Math.floor(fr.length / 2)]
    expect(mid.opacity).toBe(1)
    expect(scale(mid)).toBeCloseTo(1, 2)
  })

  it('прозрачность растёт к пику и к концу только убывает (без вспышек)', () => {
    const op = fr.map(f => f.opacity)
    const peak = op.indexOf(Math.max(...op))
    for (let i = 1; i <= peak; i++) expect(op[i]).toBeGreaterThanOrEqual(op[i - 1])
    for (let i = peak + 1; i < op.length; i++) expect(op[i]).toBeLessThanOrEqual(op[i - 1])
  })

  it('изгиб поперёк направления есть (синус), но не больше 36 px от прямой', () => {
    const dx = to.x - from.x, dy = to.y - from.y, len = Math.hypot(dx, dy)
    const dev = fr.map(f => { const p = pos(f); return Math.abs((p.x - from.x) * dy - (p.y - from.y) * dx) / len })
    expect(Math.max(...dev)).toBeGreaterThan(8)
    expect(Math.max(...dev)).toBeLessThanOrEqual(36)
  })

  it('без счётчика — летит вверх до края экрана, как прежде', () => {
    const up = xpFlightFrames(from, null)
    expect(pos(up.at(-1))).toEqual({ x: 200, y: 0 })
  })

  it('xpFlightLook: в начале и в конце 0, у цели масштаб 0,5', () => {
    expect(xpFlightLook(0).opacity).toBe(0)
    expect(xpFlightLook(1).opacity).toBe(0)
    expect(xpFlightLook(1).scale).toBeCloseTo(0.5)
  })

  it('rectCenter: центр прямоугольника, пустой — null', () => {
    expect(rectCenter({ left: 10, top: 20, width: 40, height: 10 })).toEqual({ x: 30, y: 25 })
    expect(rectCenter({ left: 0, top: 0, width: 0, height: 0 })).toBeNull()
    expect(rectCenter(null)).toBeNull()
  })
})

describe('пульс счётчика', () => {
  it('scale = 1 + A·sin(πt): начинается и кончается на 1, пик ~1,2 посередине', () => {
    const p = xpPulseFrames().map(f => +f.transform.match(/scale\(([\d.]+)\)/)[1])
    expect(p[0]).toBe(1)
    expect(p.at(-1)).toBeCloseTo(1, 6)
    expect(Math.max(...p)).toBeCloseTo(1.2, 3)
    expect(p.indexOf(Math.max(...p))).toBe(Math.floor(p.length / 2))
  })
})
