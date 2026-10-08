import { describe, it, expect } from 'vitest'
import {
  padRegions, explodedRegions, hasExplode, regionsKey, REGION_PAD, REGION_VPAD, reachForGap, regionLimits, flightLimits, needsRebuild,
} from './phraseBubbleRegions.js'
import { buildGrid } from './phraseBubbleGrid.js'
import { MARGIN_X } from './phraseBubbleConsts.js'

const word = (x, y, w, h = 20) => ({ x, y, w, h })

describe('padRegions: запас облачка вокруг слова', () => {
  it('слова далеко друг от друга — полный запас по сторонам, по вертикали свой', () => {
    const [a, b] = padRegions([word(0, 0, 40), word(40 + 18, 0, 30)])
    expect(a).toEqual({ x: -REGION_PAD, y: -REGION_VPAD, w: 40 + REGION_PAD * 2, h: 20 + REGION_VPAD * 2 })
    expect(b.x).toBe(40 + 18 - REGION_PAD)
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

describe('reachForGap / regionLimits: на сколько облачко может выйти за слово', () => {
  it('половина зазора минус чистый зазор (1px; с большого зазора ≥ 12px — полпикселя); зазор < 6px — ровно половина (касание на середине); без соседа — без ограничения', () => {
    expect(reachForGap(20)).toBe(9.5)
    expect(reachForGap(14)).toBe(6.5)
    expect(reachForGap(12)).toBe(5.5)
    expect(reachForGap(10)).toBe(4)
    expect(reachForGap(6)).toBe(2)
    expect(reachForGap(5)).toBe(2.5)
    expect(reachForGap(0)).toBe(0)
    expect(reachForGap(-3)).toBe(0)
    expect(reachForGap(null)).toBe(Infinity)
  })

  it('два слова в строке: границы смотрят друг на друга по половине зазора, наружу — без ограничения', () => {
    const [a, b] = regionLimits([word(0, 0, 40), word(60, 0, 40)])
    expect(a.x1).toBe(49.5)
    expect(b.x0).toBe(50.5)
    expect(a.x0).toBe(-Infinity)
    expect(b.x1).toBe(Infinity)
  })

  it('слово на строке ниже ограничивает по вертикали только тех, кто над ним по горизонтали', () => {
    const [a, b, c] = regionLimits([word(0, 0, 40), word(10, 30, 40), word(200, 30, 40)])
    expect(a.y1).toBe(20 + 4) // зазор 10px → 4
    expect(b.y0).toBe(30 - 4)
    expect(c.y0).toBe(-Infinity)
  })

  it('flightLimits: разлёт не ограничен ни в одну сторону — ±Infinity у каждого облачка (живые соседи не преграда)', () => {
    const lims = flightLimits([word(0, 0, 40), word(60, 0, 40), word(120, 0, 40)])
    expect(lims).toHaveLength(3)
    for (const l of lims) expect([l.x0, l.x1, l.y0, l.y1]).toEqual([-Infinity, Infinity, -Infinity, Infinity])
    // и для слов вплотную, и для строк друг под другом
    for (const l of flightLimits([word(0, 0, 40), word(40, 0, 40), word(0, 30, 60)])) expect(l.x1).toBe(Infinity)
    expect(flightLimits([])).toEqual([])
  })

  it('большой промежуток (14px): запас облачка полный с обеих сторон, соседи не пересекаются', () => {
    const [pa, pb] = padRegions([word(0, 0, 40), word(54, 0, 40)])
    expect(pa.x).toBe(-REGION_PAD)
    expect(pa.x + pa.w).toBe(40 + REGION_PAD)
    expect(pb.x).toBe(54 - REGION_PAD)
    expect(pb.x - (pa.x + pa.w)).toBe(14 - REGION_PAD * 2)
  })

  it('padRegions не выходит за допустимый вынос: запас по сторонам ≤ reachForGap', () => {
    const regions = [word(0, 0, 40), word(46, 0, 30)]
    const [pa, pb] = padRegions(regions)
    const [la, lb] = regionLimits(regions)
    expect(pa.x + pa.w).toBeLessThanOrEqual(la.x1)
    expect(pb.x).toBeGreaterThanOrEqual(lb.x0)
  })
})

describe('needsRebuild: когда пересобирать сетку шариков', () => {
  const base = { w: 200, h: 40, sig: 'a' }
  it('первая сборка — нужна; нулевой размер — нет', () => {
    expect(needsRebuild(null, base)).toBe(true)
    expect(needsRebuild(null, { w: 0, h: 40, sig: 'a' })).toBe(false)
  })
  it('те же размер и регионы, шум < 2px — не нужна', () => {
    expect(needsRebuild(base, { w: 201, h: 40.5, sig: 'a' })).toBe(false)
  })
  it('другие регионы при том же размере — нужна (регионы пришли после первого замера)', () => {
    expect(needsRebuild({ ...base, sig: '' }, base)).toBe(true)
    expect(needsRebuild(base, { ...base, sig: regionsKey([word(0, 0, 40)]) })).toBe(true)
  })
  it('подпись другая, а регионы сдвинулись меньше чем на 1px (шум округления) — не нужна', () => {
    const a = { ...base, sig: 'x', regions: [word(10, 0, 40.2)] }
    const b = { ...base, sig: 'y', regions: [word(10.4, 0, 40.6)] }
    expect(needsRebuild(a, b)).toBe(false)
    expect(needsRebuild(a, { ...b, regions: [word(12, 0, 40)] })).toBe(true)
    expect(needsRebuild(a, { ...b, regions: [word(10, 0, 40), word(60, 0, 20)] })).toBe(true)
  })
  it('размер изменился на 2px и больше — нужна', () => {
    expect(needsRebuild(base, { ...base, w: 203 })).toBe(true)
    expect(needsRebuild(base, { ...base, h: 44 })).toBe(true)
  })
})
