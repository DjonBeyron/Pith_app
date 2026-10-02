import { describe, it, expect } from 'vitest'
import { ladderLinks, ladderWireSet } from './ladderWires.js'
import { tearWire, TEAR_FROM, TEAR_LEN } from './ladderTear.js'

// Те же прямоугольники, что на телефоне 393 px: шапка на всю ширину, три ступени лесенкой, пятиугольник
const rects = {
  hero: { l: 0, t: 0, r: 354, b: 100 },
  blocks: [{ l: 40, t: 160, r: 260, b: 250 }, { l: 90, t: 270, r: 300, b: 360 }, { l: 140, t: 380, r: 350, b: 470 }],
  fin: { l: 80, t: 520, r: 320, b: 760 },
  edge: 0,
}

describe('tearWire — оборванный кабель в режиме сна', () => {
  const links = ladderLinks(rects)
  const { pieces } = ladderWireSet(rects)
  const tear = tearWire(pieces, links[0].pts)
  const y0 = links[0].pts[1][1]
  const mx = links[0].pts[0][0]

  it('на горизонтали у шапки вырезан разрыв, остальное цело', () => {
    expect(tear.pieces.length).toBeLessThan(pieces.length)
    const removed = pieces.filter(p => !tear.pieces.includes(p))
    expect(removed.length).toBeGreaterThan(0)
    // вырезано только на линии y0 и только в окне разрыва
    for (const p of removed) {
      expect(p.y1).toBeCloseTo(y0, 0)
      expect(p.y2).toBeCloseTo(y0, 0)
      expect(Math.max(p.x1, p.x2)).toBeLessThanOrEqual(mx - TEAR_FROM + 8)
      expect(Math.min(p.x1, p.x2)).toBeGreaterThanOrEqual(mx - TEAR_FROM - TEAR_LEN - 8)
    }
  })

  it('разрыв заметен: не меньше ширины окна минус отрезок', () => {
    const removed = pieces.filter(p => !tear.pieces.includes(p))
    const xs = removed.flatMap(p => [p.x1, p.x2])
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThanOrEqual(TEAR_LEN - 8)
  })

  it('у каждого конца — четыре жилки, в разрыве — молния и искры между концами', () => {
    expect(tear.strands).toHaveLength(8)
    expect(tear.sparks).toHaveLength(2)
    const removed = pieces.filter(p => !tear.pieces.includes(p))
    const xs = removed.flatMap(p => [p.x1, p.x2])
    const gapL = Math.min(...xs)
    const gapR = Math.max(...xs)
    expect(tear.bolt.x).toBeGreaterThan(gapL)
    expect(tear.bolt.x).toBeLessThan(gapR)
    expect(tear.bolt.y).toBeCloseTo(y0, 0)
    for (const sp of tear.sparks) {
      expect(sp.x).toBeGreaterThan(gapL)
      expect(sp.x).toBeLessThan(gapR)
    }
  })

  it('нет отрезков в окне разрыва — ничего не меняется', () => {
    const none = tearWire(pieces.filter(p => Math.abs(p.y1 - y0) > 1), links[0].pts)
    expect(none.strands).toEqual([])
    expect(none.sparks).toEqual([])
    expect(none.bolt).toBe(null)
  })
})
