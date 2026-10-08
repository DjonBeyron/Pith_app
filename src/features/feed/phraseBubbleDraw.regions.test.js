import { describe, it, expect } from 'vitest'
import { buildGrid } from './phraseBubbleGrid.js'
import { drawFloat } from './phraseBubbleDraw.js'
import { MARGIN_X, MARGIN_Y } from './phraseBubbleConsts.js'
import { REGION_PAD } from './phraseBubbleRegions.js'

// Почему «Ловля» слипалась в единую массу: зазор между словами фразы 5-9px, а шарик на пике (радиус с дыханием +
// размах покачивания + бахрома) выходил за слово на 5-6px — облачка соседних слов перекрывались целиком. Эти тесты
// гоняют настоящий drawFloat по фазам и проверяют, что НИ ОДИН нарисованный шарик не заходит за середину зазора.

const word = (x, y, w, h = 20) => ({ x, y, w, h })

// Холст-самописец: собирает все дуги, нарисованные drawFloat, в координатах текстового блока (без MARGIN)
function recorder() {
  const arcs = []
  return { arcs, ctx: { beginPath() {}, moveTo() {}, arc(x, y, r) { arcs.push({ x: x - MARGIN_X, y: y - MARGIN_Y, r }) }, fill() {} } }
}

// Крайние положения каждого шарика за ~40с плавания: min/max по x и y с учётом радиуса (по индексу шарика)
function extents(bubbles) {
  const ext = bubbles.map(() => ({ x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity }))
  for (let step = 0; step < 500; step++) {
    const { ctx, arcs } = recorder()
    drawFloat(ctx, bubbles, step === 0 ? 0 : 80)
    arcs.forEach((a, i) => {
      const e = ext[i]
      e.x0 = Math.min(e.x0, a.x - a.r); e.x1 = Math.max(e.x1, a.x + a.r)
      e.y0 = Math.min(e.y0, a.y - a.r); e.y1 = Math.max(e.y1, a.y + a.r)
    })
  }
  return ext
}

describe('buildGrid: облачка не слипаются', () => {
  it('зазор 20px: ни один шарик (радиус + покачивание + бахрома) не заходит за середину зазора минус полпикселя', () => {
    const grid = buildGrid(100, 20, [word(0, 0, 40), word(60, 0, 40)])
    const ext = extents(grid)
    grid.forEach((b, i) => {
      if (b.region === 0) expect(ext[i].x1).toBeLessThanOrEqual(49.5 + 1e-6)
      else expect(ext[i].x0).toBeGreaterThanOrEqual(50.5 - 1e-6)
    })
    // а значит полоса (49.5…50.5) чиста, и между облачками виден просвет ≥ 1px
    expect(grid.some(b => b.region === 0)).toBe(true)
    expect(grid.some(b => b.region === 1)).toBe(true)
  })

  // Полоска «Ловли»: word-spacing ≈ 0.9em, зазор между словами ≥ ~14px — облачко получает всё, что нарисовано бы без
  // соседа: те же число узлов, та же амплитуда (средняя), бахрома по обе стороны, а нарисованное не пересекает соседа
  it('зазор 14px: облачка не пересекаются, но и не обрезаны — узлов и амплитуды как у одинокого слова, бахрома с обеих сторон', () => {
    const two = [word(0, 0, 40), word(54, 0, 40)]
    const mean = (list, f) => list.reduce((s, b) => s + f(b), 0) / list.length
    let nodes = 0, nodesAlone = 0, amp = 0, ampAlone = 0
    const RUNS = 6
    for (let k = 0; k < RUNS; k++) {
      const alone = buildGrid(40, 20, [word(0, 0, 40)])
      const grid = buildGrid(94, 20, two)
      const left = grid.filter(b => b.region === 0)
      nodes += left.length; nodesAlone += alone.length
      amp += mean(left, b => b.amp); ampAlone += mean(alone, b => b.amp)
      const ext = extents(grid)
      const reachRight = Math.max(...grid.map((b, i) => (b.region === 0 ? ext[i].x1 : -Infinity)))
      const reachLeft = Math.min(...grid.map((b, i) => (b.region === 1 ? ext[i].x0 : Infinity)))
      expect(reachRight).toBeLessThan(reachLeft)               // соседи не пересекаются
      expect(reachRight).toBeLessThanOrEqual(47 + 1e-6)        // и не заходят за середину зазора
      expect(reachRight).toBeGreaterThan(40 + REGION_PAD)      // бахрома и покачивание выходят за запас
      expect(reachLeft).toBeLessThan(54 - REGION_PAD)          // с левой стороны правого облачка — то же самое
      expect(grid.some(b => b.region === 0 && b.ax - MARGIN_X > 40 + REGION_PAD)).toBe(true) // бахрома у соседа справа
      expect(grid.some(b => b.region === 1 && b.ax - MARGIN_X < 54 - REGION_PAD)).toBe(true) // и слева
    }
    expect(nodes / nodesAlone).toBeGreaterThan(0.97)
    expect(amp / ampAlone).toBeGreaterThan(0.97)
  })

  it('реальный зазор между словами ~5px: облачка касаются самое большее на середине, но не заходят дальше', () => {
    const grid = buildGrid(85, 20, [word(0, 0, 40), word(45, 0, 40)])
    const ext = extents(grid)
    grid.forEach((b, i) => {
      if (b.region === 0) expect(ext[i].x1).toBeLessThanOrEqual(42.5 + 1e-6)
      else expect(ext[i].x0).toBeGreaterThanOrEqual(42.5 - 1e-6)
    })
  })

  it('слова вплотную (зазор 0): облачко не выходит за общую границу', () => {
    const grid = buildGrid(80, 20, [word(0, 0, 40), word(40, 0, 40)])
    const ext = extents(grid)
    grid.forEach((b, i) => {
      if (b.region === 0) expect(ext[i].x1).toBeLessThanOrEqual(40 + 1e-6)
      else expect(ext[i].x0).toBeGreaterThanOrEqual(40 - 1e-6)
    })
  })

  it('соседние строки: шарики не заходят за середину вертикального зазора', () => {
    const grid = buildGrid(60, 50, [word(0, 0, 60), word(0, 30, 60)]) // зазор 10px → вынос ≤ 4
    const ext = extents(grid)
    grid.forEach((b, i) => {
      if (b.region === 0) expect(ext[i].y1).toBeLessThanOrEqual(24 + 1e-6)
      else expect(ext[i].y0).toBeGreaterThanOrEqual(26 - 1e-6)
    })
  })

  it('со стороны без соседа бахрома и покачивание остаются прежними (облачко за краем слова не «обрезано»)', () => {
    const grid = buildGrid(40, 20, [word(0, 0, 40)])
    const ext = extents(grid)
    expect(Math.max(...ext.map(e => e.x1))).toBeGreaterThan(40 + REGION_PAD) // запас + бахрома/покачивание
    expect(Math.min(...ext.map(e => e.x0))).toBeLessThan(-REGION_PAD)
  })

  it('плотность внутри слова — как у сплошной ленты, вне облачков — ноль', () => {
    const solid = buildGrid(40, 20, null).filter(b => {
      const x = b.ax - MARGIN_X, y = b.ay - MARGIN_Y
      return x >= 0 && x <= 40 && y >= 0 && y <= 20
    })
    const cloud = buildGrid(200, 20, [word(0, 0, 40), word(160, 0, 40)])
    const inWord = cloud.filter(b => {
      const x = b.ax - MARGIN_X, y = b.ay - MARGIN_Y
      return b.region === 0 && x >= 0 && x <= 40 && y >= 0 && y <= 20
    })
    expect(inWord.length).toBeGreaterThan(solid.length * 0.9)
    expect(inWord.length).toBeLessThan(solid.length * 1.1)
    expect(cloud.filter(b => b.ax - MARGIN_X > 40 + 25 && b.ax - MARGIN_X < 160 - 25)).toHaveLength(0)
  })

  it('число узлов с regions не больше, чем у сплошной сетки того же блока (две строки по 30px, слова 20px, зазоры ~5px)', () => {
    const regions = [
      word(0, 5, 40), word(45, 5, 55), word(105, 5, 30),
      word(0, 35, 50), word(55, 35, 45),
    ]
    const withRegions = buildGrid(135, 60, regions).length
    const solid = buildGrid(135, 60, null).length
    expect(withRegions).toBeLessThanOrEqual(solid)
    expect(withRegions).toBeLessThan(solid * 0.92) // и меньше: просветы между строками и словами пустые
  })

  it('разные regions дают разные наборы узлов (сетка зависит от регионов, а не только от размера)', () => {
    const a = buildGrid(100, 20, [word(0, 0, 40)])
    const b = buildGrid(100, 20, [word(0, 0, 40), word(60, 0, 40)])
    expect(b.length).toBeGreaterThan(a.length)
    expect(new Set(a.map(n => n.region))).toEqual(new Set([0]))
    expect(new Set(b.map(n => n.region))).toEqual(new Set([0, 1]))
  })
})
