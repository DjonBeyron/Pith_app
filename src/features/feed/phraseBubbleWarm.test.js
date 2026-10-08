import { describe, it, expect, vi, afterEach } from 'vitest'
import { buildGrid } from './phraseBubbleGrid.js'
import { shiftBubbles, EXPLODE_MARGIN } from './phraseBubbleDraw.js'
import { MARGIN_X, MARGIN_Y, PULSE_AMP, WIGGLE_SECOND_RATIO } from './phraseBubbleConsts.js'
import {
  groupByRegion, groupCenter, prepareExplosion, warmUp, buildSprites, drawSprites, freeSprites, spriteBytes, paintExplosion,
} from './phraseBubbleWarm.js'

const word = (x, y, w, h = 20) => ({ x, y, w, h })
const grid = () => {
  const g = buildGrid(160, 20, [word(0, 0, 40), word(60, 0, 40), word(120, 0, 40)])
  shiftBubbles(g, EXPLODE_MARGIN - MARGIN_X, EXPLODE_MARGIN - MARGIN_Y)
  return g
}

afterEach(() => vi.useRealTimers())

describe('заготовки взрыва: скорости заранее', () => {
  it('groupByRegion / groupCenter: узлы по облачкам, центр без spread на сотни аргументов', () => {
    const groups = groupByRegion(grid())
    expect(groups).toHaveLength(3)
    const c = groupCenter(groups[1])
    expect(c.cx).toBeGreaterThan(EXPLODE_MARGIN + 60)
    expect(c.cx).toBeLessThan(EXPLODE_MARGIN + 100)
  })

  it('prepareExplosion выставляет скорости всем узлам, но не запускает полёт; повторный вызов ничего не пересчитывает', () => {
    const g = grid()
    prepareExplosion(g)
    expect(g.every(b => Number.isFinite(b.vx) && Number.isFinite(b.vy))).toBe(true)
    expect(g.some(b => b.vx !== 0)).toBe(true)
    expect(g.some(b => b.flying)).toBe(false)
    const vx = g.map(b => b.vx)
    prepareExplosion(g)
    expect(g.map(b => b.vx)).toEqual(vx)
  })

  it('warmUp готовит по облачку за тик таймера, отмена останавливает', () => {
    vi.useFakeTimers()
    const g = grid()
    warmUp(g)
    expect(g.some(b => b.vx !== 0)).toBe(false)
    vi.advanceTimersByTime(0)
    const first = g.filter(b => b.vx !== 0).length
    expect(first).toBeGreaterThan(0)
    expect(first).toBeLessThan(g.length)
    vi.runAllTimers()
    expect(g.prepared).toBe(true)
    expect(g.every(b => b.vx !== 0 || b.vy !== 0)).toBe(true)

    const h = grid()
    const cancel = warmUp(h)
    cancel()
    vi.runAllTimers()
    expect(h.some(b => b.vx !== 0)).toBe(false)
  })
})

describe('спрайты ещё не взорванных облачек', () => {
  const fakeCanvas = () => {
    const calls = []
    return { calls, width: 0, height: 0, getContext: () => ({
      setTransform: (...a) => calls.push(['t', ...a]), beginPath() {}, moveTo() {}, arc() { calls.push(['arc']) }, fill() {},
    }) }
  }

  it('только для нужных облачек; рамка спрайта вмещает каждый шарик со всем покачиванием и дыханием', () => {
    const groups = groupByRegion(grid())
    const made = []
    const sprites = buildSprites(groups, 2, g => g !== 0, () => { const c = fakeCanvas(); made.push(c); return c })
    expect(sprites[0]).toBeNull()
    expect(made).toHaveLength(2)
    sprites.slice(1).forEach((s, i) => {
      expect(Number.isInteger(s.x) && Number.isInteger(s.y)).toBe(true)
      expect(s.canvas.width).toBe(s.w * 2)
      expect(s.canvas.height).toBe(s.h * 2)
      for (const b of groups[i + 1]) {
        const wander = b.amp * (1 + WIGGLE_SECOND_RATIO)
        const rr = b.r * (1 + PULSE_AMP)
        expect(b.ax - wander - rr).toBeGreaterThanOrEqual(s.x)
        expect(b.ax + wander + rr).toBeLessThanOrEqual(s.x + s.w)
      }
      expect(s.canvas.calls.filter(c => c[0] === 'arc').length).toBe(groups[i + 1].length)
    })
  })

  it('drawSprites: по одному drawImage на ещё не взорванное облачко', () => {
    const drawn = []
    const ctx = { drawImage: (c, x, y, w, h) => drawn.push([c, x, y, w, h]) }
    const sprites = [null, { canvas: 'b', x: 1, y: 2, w: 3, h: 4 }, { canvas: 'c', x: 5, y: 6, w: 7, h: 8 }]
    drawSprites(ctx, sprites, new Set([1, 2]))
    expect(drawn).toEqual([['b', 1, 2, 3, 4], ['c', 5, 6, 7, 8]])
    drawn.length = 0
    drawSprites(ctx, sprites, new Set([2]))
    expect(drawn).toEqual([['c', 5, 6, 7, 8]])
  })
})

describe('порядок слоёв кадра взрыва (paintExplosion)', () => {
  // Холст-самописец: что и в каком порядке рисуется. Частицы облачка g лежат около x = 100·(g+1) — по x видно, чьи они
  const recorder = () => {
    const calls = []
    return {
      calls,
      drawImage: c => calls.push(`sprite:${c}`),
      beginPath() {}, moveTo() {}, rect() {},
      arc: x => calls.push(`p:${Math.round(x / 100)}`),
      fill() { calls.push('fill') },
    }
  }
  const particle = (g, k) => ({ ax: 100 * (g + 1) + k, ay: 200, r: 1.5, vx: 0, vy: 0, t: k * 400, sx: 1, sy: 1 })
  const clouds = n => Array.from({ length: n }, (_, g) => [particle(g, 0), particle(g, 1), particle(g, 2)]) // разные t → разные альфа-бакеты

  it('сначала все ещё не взорванные облачки, потом частицы — от правого облачка к левому, самое левое последним', () => {
    const ctx = recorder()
    const sprites = [null, null, null, { canvas: 'live3', x: 0, y: 0, w: 1, h: 1 }, { canvas: 'live4', x: 0, y: 0, w: 1, h: 1 }]
    paintExplosion(ctx, sprites, new Set([3, 4]), clouds(3), 16, 800, 400)
    const first = ctx.calls.findIndex(c => c.startsWith('p:'))
    expect(ctx.calls.slice(0, first)).toEqual(['sprite:live3', 'sprite:live4']) // живые — до любых частиц
    expect(ctx.calls.slice(first).some(c => c.startsWith('sprite'))).toBe(false)
    const order = ctx.calls.filter(c => c.startsWith('p:')).map(c => Number(c.slice(2)))
    expect(order[0]).toBe(3) // правое облачко (g=2, x≈300) — первым
    expect(order.at(-1)).toBe(1) // левое (g=0, x≈100) — последним, то есть сверху
    for (let i = 1; i < order.length; i++) expect(order[i]).toBeLessThanOrEqual(order[i - 1]) // группы не перемешаны
    expect(new Set(order)).toEqual(new Set([1, 2, 3]))
  })

  it('внутри группы заливки по бакетам альфы, но группы между собой не перемешиваются; пустые облачка пропускаются', () => {
    const ctx = recorder()
    const lists = clouds(3)
    lists[1] = [] // облачко уже догорело
    paintExplosion(ctx, null, new Set(), lists, 16, 800, 400)
    const order = ctx.calls.filter(c => c.startsWith('p:')).map(c => Number(c.slice(2)))
    expect(order).not.toContain(2)
    expect(order.at(-1)).toBe(1)
    expect(ctx.calls.filter(c => c === 'fill').length).toBeGreaterThanOrEqual(2)
  })

  it('freeSprites: освобождает холсты (width = 0) и обнуляет ячейки; spriteBytes считает dpr 1', () => {
    const mk = () => ({ canvas: { width: 10, height: 10 }, x: 0, y: 0, w: 10, h: 5 })
    const sprites = [mk(), null, mk()]
    expect(spriteBytes(sprites)).toBe(2 * 10 * 5 * 4)
    const a = sprites[0].canvas
    freeSprites(sprites, 0)
    expect(a.width).toBe(0)
    expect(sprites[0]).toBeNull()
    expect(sprites[2]).not.toBeNull()
    const c = sprites[2].canvas
    freeSprites(sprites)
    expect(c.width).toBe(0)
    expect(sprites.every(x => x === null)).toBe(true)
    expect(spriteBytes(null)).toBe(0)
  })
})
