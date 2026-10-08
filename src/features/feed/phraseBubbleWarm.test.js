import { describe, it, expect, vi, afterEach } from 'vitest'
import { buildGrid } from './phraseBubbleGrid.js'
import { shiftBubbles, EXPLODE_MARGIN } from './phraseBubbleDraw.js'
import { MARGIN_X, MARGIN_Y, PULSE_AMP, WIGGLE_SECOND_RATIO } from './phraseBubbleConsts.js'
import { groupByRegion, groupCenter, prepareExplosion, warmUp, buildSprites, drawSprites } from './phraseBubbleWarm.js'

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
