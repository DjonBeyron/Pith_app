import { describe, it, expect } from 'vitest'
import {
  padRegions, explodedRegions, hasExplode, regionsKey, REGION_PAD, REGION_VPAD, REGION_MIN_GAP,
} from './phraseBubbleRegions.js'
import { buildGrid, MARGIN_X } from './phraseBubbleDraw.js'

const word = (x, y, w, h = 20) => ({ x, y, w, h })

describe('padRegions: запас облачка вокруг слова', () => {
  it('слова далеко друг от друга — полный запас по сторонам, по вертикали свой', () => {
    const [a, b] = padRegions([word(0, 0, 40), word(40 + REGION_MIN_GAP + 10, 0, 30)])
    expect(a).toEqual({ x: -REGION_PAD, y: -REGION_VPAD, w: 40 + REGION_PAD * 2, h: 20 + REGION_VPAD * 2 })
    expect(b.x).toBe(40 + REGION_MIN_GAP + 10 - REGION_PAD)
  })

  it('слова ближе 8px — запас режется по зазору, облачка не достают друг до друга', () => {
    const regions = [word(0, 0, 40), word(46, 0, 30)] // зазор 6px
    const [a, b] = padRegions(regions)
    const gapBetweenClouds = b.x - (a.x + a.w)
    expect(gapBetweenClouds).toBeGreaterThan(0)
    expect(a.x + a.w).toBeLessThan(46)
    expect(b.x).toBeGreaterThan(40)
  })

  it('слова на разных строках друг на друга не влияют; соседей нет — полный запас', () => {
    const [a, b] = padRegions([word(0, 0, 40), word(42, 40, 30)])
    expect(a.w).toBe(40 + REGION_PAD * 2)
    expect(b.x).toBe(42 - REGION_PAD)
  })

  it('вплотную (зазор 0) — запас 0, порядок и число регионов сохраняются', () => {
    const out = padRegions([word(0, 0, 40), word(40, 0, 30), word(70, 0, 10)])
    expect(out).toHaveLength(3)
    expect(out[0].x + out[0].w).toBeLessThanOrEqual(40)
    expect(out[1].x).toBeGreaterThanOrEqual(40)
  })
})

describe('explodedRegions / hasExplode', () => {
  it('true — все; число n — первые n; массив — как есть (в пределах); иначе пусто', () => {
    expect([...explodedRegions(true, 3)]).toEqual([0, 1, 2])
    expect([...explodedRegions(2, 3)]).toEqual([0, 1])
    expect([...explodedRegions(9, 3)]).toEqual([0, 1, 2])
    expect([...explodedRegions([2, 0, 7], 3)].sort()).toEqual([0, 2])
    expect(explodedRegions(false, 3).size).toBe(0)
    expect(explodedRegions(0, 3).size).toBe(0)
  })
  it('hasExplode: команда есть, только если взорвано хоть что-то', () => {
    expect(hasExplode(false)).toBe(false)
    expect(hasExplode(0)).toBe(false)
    expect(hasExplode([])).toBe(false)
    expect(hasExplode(true)).toBe(true)
    expect(hasExplode(1)).toBe(true)
    expect(hasExplode([3])).toBe(true)
  })
  it('regionsKey: субпиксельный шум не меняет подпись', () => {
    expect(regionsKey([word(0.1, 0, 40.1)])).toBe(regionsKey([word(0.2, 0, 40.2)]))
    expect(regionsKey(null)).toBe('')
  })
})

describe('buildGrid: regions', () => {
  const inside = (b, r) => {
    const x = b.ax - MARGIN_X
    return x >= r.x - 12 && x <= r.x + r.w + 12
  }

  it('без regions — одна сплошная масса, region у шариков null', () => {
    const grid = buildGrid(100, 24)
    expect(grid.length).toBeGreaterThan(100)
    expect(grid.every(b => b.region === null)).toBe(true)
  })

  it('с regions — шарики только возле слов, между далёкими словами пусто; у каждого свой номер облачка', () => {
    const regions = [word(0, 0, 40), word(160, 0, 40)]
    const grid = buildGrid(200, 20, regions)
    expect(new Set(grid.map(b => b.region))).toEqual(new Set([0, 1]))
    const gap = grid.filter(b => b.ax - MARGIN_X > 60 && b.ax - MARGIN_X < 140)
    expect(gap).toHaveLength(0)
    for (const b of grid) expect(inside(b, regions[b.region])).toBe(true)
  })

  it('облачка слабее колеблются, чем сплошная масса (амплитуда ограничена)', () => {
    const solid = buildGrid(100, 20)
    const cloud = buildGrid(100, 20, [word(0, 0, 100)])
    const max = list => Math.max(...list.map(b => b.amp))
    expect(max(cloud)).toBeLessThan(max(solid))
  })

  it('пустой массив regions — режим облачек без слов: шариков нет', () => {
    expect(buildGrid(100, 20, [])).toEqual([])
  })
})
