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

  it('разрыв небольшой: втрое меньше прежних 64 px', () => {
    const removed = pieces.filter(p => !tear.pieces.includes(p))
    const xs = removed.flatMap(p => [p.x1, p.x2])
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThanOrEqual(TEAR_LEN + 12)
    expect(TEAR_LEN).toBeLessThanOrEqual(22)
  })

  it('у каждого конца — три провода цветов ступеней, торчат не сильно и не сходятся в разрыве', () => {
    expect(tear.strands).toHaveLength(6)
    const colors = c => tear.strands.slice(c * 3, c * 3 + 3).map(s => s.color).sort()
    const levels = ['#4fb3ee', '#b6fe3b', '#f1bd3c']
    expect(colors(0)).toEqual(levels) // справа от разрыва: синий, золотистый, салатовый
    expect(colors(1)).toEqual(levels) // слева — тоже все три, но порядок другой
    expect(tear.strands.slice(0, 3).map(s => s.color)).not.toEqual(tear.strands.slice(3).map(s => s.color))
    const removed = pieces.filter(p => !tear.pieces.includes(p))
    const xs = removed.flatMap(p => [p.x1, p.x2])
    const gap = Math.max(...xs) - Math.min(...xs)
    expect(gap).toBeGreaterThan(14)
    // провода одного края короче 10 px — вместе с противоположными не перекрывают разрыв
    const reach = st => { const n = st.d.split(' ').map(Number).filter(v => !Number.isNaN(v)); return Math.hypot(n[4] - n[0], n[5] - n[1]) }
    for (const st of tear.strands) expect(reach(st)).toBeLessThanOrEqual(10)
  })

  it('искры — на кончиках проводов (не на всех), у каждой свой период и сдвиг', () => {
    expect(tear.sparks.length).toBeGreaterThanOrEqual(3)
    expect(tear.sparks.length).toBeLessThan(tear.strands.length)
    const tips = tear.strands.map(s => s.d.split(' ').slice(-2).map(Number))
    for (const sp of tear.sparks) {
      expect(tips.some(([x, y]) => Math.abs(x - sp.x) < 0.2 && Math.abs(y - sp.y) < 0.2)).toBe(true)
    }
    expect(new Set(tear.sparks.map(s => s.period)).size).toBe(tear.sparks.length)
    expect(new Set(tear.sparks.map(s => s.delay)).size).toBe(tear.sparks.length)
  })

  it('нет отрезков в окне разрыва — ничего не меняется', () => {
    const none = tearWire(pieces.filter(p => Math.abs(p.y1 - y0) > 1), links[0].pts)
    expect(none.strands).toEqual([])
    expect(none.sparks).toEqual([])
  })
})
