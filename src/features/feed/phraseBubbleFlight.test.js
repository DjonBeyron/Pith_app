import { describe, it, expect, vi, afterEach } from 'vitest'
import { buildGrid } from './phraseBubbleGrid.js'
import { drawExplode, launchBubbles, shiftBubbles, EXPLODE_MARGIN } from './phraseBubbleDraw.js'
import { flightExtent, limitFlight, thinForLaunch, MAX_PARTICLES, PER_CLOUD_MAX, EXPLODE_POWER_MAX } from './phraseBubbleFlight.js'
import { EXPLODE_MS, EXPLODE_SLOW, MARGIN_X, MARGIN_Y } from './phraseBubbleConsts.js'

// Разлёт частиц взрыва. Облачка взрываются слева направо, а разлёт НЕ ограничен живыми соседями (flightLimits — ±Infinity):
// частицы всех облачков летят во все стороны одинаково, поверх соседей. Гоняем настоящие launchBubbles + drawExplode
// на кадрах разной длины и смотрим положение каждой частицы в каждый момент. Math.random подменён детерминированным
// генератором — оценки экстремумов не флакают.

const word = (x, y, w, h = 20) => ({ x, y, w, h })
const mid = b => ({ x: (Math.min(...b.map(p => p.ax)) + Math.max(...b.map(p => p.ax))) / 2, y: (Math.min(...b.map(p => p.ay)) + Math.max(...b.map(p => p.ay))) / 2 })
const OLD_REACH = 9.5 // прежний предел выноса при зазоре 20px: половина зазора минус 0.5px

// mulberry32: детерминированный Math.random
function seeded(seed) {
  let a = seed
  return () => {
    a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
afterEach(() => vi.restoreAllMocks())

// Холст-самописец: фигуры, которые реально рисуются (в координатах текстового блока); rect — мелкие частицы
function recorder(shapes) {
  const put = (x, y, r) => shapes.push({ x: x - EXPLODE_MARGIN, y: y - EXPLODE_MARGIN, r })
  return { beginPath() {}, moveTo() {}, fill() {}, arc: (x, y, r) => put(x, y, r), rect: (x, y, w) => put(x + w / 2, y + w / 2, w / 2) }
}

// Взрывает облачка по очереди с шагом stepMs (как в финале); после каждого кадра зовёт check(списки по облачкам, фигуры, время)
function simulate(grid, dt, stepMs, check) {
  shiftBubbles(grid, EXPLODE_MARGIN - MARGIN_X, EXPLODE_MARGIN - MARGIN_Y)
  const groups = []
  for (const b of grid) (groups[b.region] ??= []).push(b)
  const lists = []
  const shapes = []
  const launched = new Set()
  for (let clock = 0; clock < groups.length * stepMs + EXPLODE_MS + 200; clock += dt) {
    groups.forEach((list, g) => {
      if (clock >= g * stepMs && !launched.has(g)) {
        const c = mid(list)
        launchBubbles(list, c.x, c.y)
        lists[g] = list.slice()
        launched.add(g)
      }
    })
    shapes.length = 0
    drawExplode(recorder(shapes), lists, dt, 800, 400)
    check(lists, shapes, clock)
  }
  return lists
}

const three = () => [word(0, 0, 40), word(60, 0, 40), word(120, 0, 40)] // зазоры 20px
const X = b => b.ax - EXPLODE_MARGIN
const Y = b => b.ay - EXPLODE_MARGIN

// Разлёт каждого облачка вбок от центра его слова: { left, right } — на сколько px частица ушла влево/вправо
function spreads(regs, dt = 16) {
  const out = regs.map(() => ({ left: 0, right: 0 }))
  const centers = regs.map(r => r.x + r.w / 2)
  simulate(buildGrid(regs[regs.length - 1].x + regs[regs.length - 1].w, 20, regs), dt, 300, lists => {
    lists.forEach((list, g) => {
      if (!list) return
      for (const b of list) {
        out[g].right = Math.max(out[g].right, X(b) - centers[g])
        out[g].left = Math.max(out[g].left, centers[g] - X(b))
      }
    })
  })
  return out
}

describe('взрыв облачка: разлёт во все стороны, живые соседи не преграда', () => {
  for (const dt of [16, 7, 32]) {
    it(`кадры по ${dt}мс: разлёт вбок у ВСЕХ облачков не меньше, чем у последнего (−15%), и не больше (+15%)`, () => {
      vi.spyOn(Math, 'random').mockImplementation(seeded(7))
      const sp = spreads(three(), dt)
      const last = sp[2]
      for (const s of sp.slice(0, 2)) {
        expect(s.right).toBeGreaterThanOrEqual(last.right * 0.85)
        expect(s.right).toBeLessThanOrEqual(last.right * 1.15)
        expect(s.left).toBeGreaterThanOrEqual(last.left * 0.85)
        expect(s.left).toBeLessThanOrEqual(last.left * 1.15)
      }
      expect(last.right).toBeGreaterThan(40 + 2 * OLD_REACH) // и сам выстрел дальнобойный, как и был
    })
  }

  it('симметрия по направлению: у каждого облачка разлёт влево и вправо отличается не больше чем на 15%', () => {
    vi.spyOn(Math, 'random').mockImplementation(seeded(11))
    for (const s of spreads(three())) {
      expect(s.left / s.right).toBeGreaterThan(0.85)
      expect(s.left / s.right).toBeLessThan(1 / 0.85)
    }
  })

  it('частицы первого облачка летят поверх живого соседа справа (тело соседа начинается в x=60)', () => {
    vi.spyOn(Math, 'random').mockImplementation(seeded(3))
    let right0 = -Infinity
    simulate(buildGrid(160, 20, three()), 16, 300, (lists, _s, clock) => {
      if (clock < 300) for (const b of lists[0]) right0 = Math.max(right0, X(b) + b.r)
    })
    expect(right0).toBeGreaterThan(60 + 10) // раньше упирались в 0.75 зазора (55)
  })

  it('вверх и вниз — свободно (в пределах поля вокруг фразы), у верхней и нижней строки одинаково', () => {
    vi.spyOn(Math, 'random').mockImplementation(seeded(5))
    let top = Infinity, bottom = -Infinity, over1 = -Infinity
    simulate(buildGrid(60, 50, [word(0, 0, 60), word(0, 30, 60)]), 16, 300, (lists, _s, clock) => {
      for (const b of lists[0] ?? []) { top = Math.min(top, Y(b) - b.r); over1 = Math.max(over1, clock < 300 ? Y(b) + b.r : -Infinity) }
      for (const b of lists[1] ?? []) bottom = Math.max(bottom, Y(b) + b.r)
    })
    expect(top).toBeLessThan(-2 * OLD_REACH)
    expect(bottom).toBeGreaterThan(50 + 2 * OLD_REACH)
    expect(over1).toBeGreaterThan(20 + 7.5) // верхнее облачко заходит вниз за прежнюю границу 0.75 зазора на живое нижнее
  })

  it('к концу жизни всё догорело: drawExplode сообщает о конце ровно за EXPLODE_MS', () => {
    const grid = buildGrid(100, 20, [word(0, 0, 40), word(60, 0, 40)])
    shiftBubbles(grid, EXPLODE_MARGIN - MARGIN_X, EXPLODE_MARGIN - MARGIN_Y)
    launchBubbles(grid, 100, 100)
    const ctx = recorder([])
    const lists = [grid.slice()]
    let done = false
    let steps = 0
    for (; !done && steps < 500; steps++) done = drawExplode(ctx, lists, 16, 800, 400)
    expect(done).toBe(true)
    expect(steps * 16).toBeGreaterThanOrEqual(EXPLODE_MS)
    expect(steps * 16).toBeLessThan(EXPLODE_MS + 100)
    expect(lists[0]).toHaveLength(0) // догоревшие выброшены
  })

  it('мелкие частицы рисуются квадратиком (rect), крупные — кругом (arc)', () => {
    const calls = { arc: 0, rect: 0 }
    const ctx = { beginPath() {}, moveTo() {}, fill() {}, arc() { calls.arc++ }, rect() { calls.rect++ } }
    const mk = r => ({ ax: 300, ay: 200, r, vx: 0, vy: 0, t: 0, sx: 1, sy: 1 })
    drawExplode(ctx, [[mk(0.5), mk(0.8), mk(2)]], 16, 800, 400)
    expect(calls).toEqual({ arc: 1, rect: 2 })
  })
})

describe('limitFlight и стартовый импульс', () => {
  const mk = lim => ({ ax: 100, ay: 50, r: 1, vx: 8, vy: 0, lim })
  it('упёршаяся в границу скорость не обнуляется: горизонтальная компонента на месте, часть уходит в вертикаль', () => {
    const b = mk({ x0: -Infinity, x1: 110, y0: -Infinity, y1: Infinity })
    limitFlight(b, 50)
    expect(b.sx).toBeLessThan(1)
    expect(b.sy).toBe(1)
    expect(b.vx).toBe(8)
    expect(Math.abs(b.vy)).toBeGreaterThan(0)
    expect(Math.abs(b.vy)).toBeLessThanOrEqual(8 * (1 - b.sx) * 0.5 + 1e-9) // не больше половины потерянного
  })
  it('без конечных границ путь не режется и скорость не трогается', () => {
    const b = mk({ x0: -Infinity, x1: Infinity, y0: -Infinity, y1: Infinity })
    limitFlight(b, 50)
    expect([b.sx, b.sy, b.vx, b.vy]).toEqual([1, 1, 8, 0])
  })
  it('начальный горизонтальный импульс сильнее прежнего максимума (+25%)', () => {
    const grid = buildGrid(60, 20, [word(0, 0, 60)])
    shiftBubbles(grid, EXPLODE_MARGIN - MARGIN_X, EXPLODE_MARGIN - MARGIN_Y)
    const c = mid(grid)
    launchBubbles(grid, c.x, c.y)
    expect(Math.max(...grid.map(b => Math.abs(b.vx)))).toBeGreaterThan(EXPLODE_POWER_MAX)
  })
})

describe('физика полёта', () => {
  it('взрыв в 1.37 раза дольше прежних 750мс, а дальность полёта прежняя (то же растяжение времени)', () => {
    expect(EXPLODE_MS).toBeGreaterThanOrEqual(Math.round(750 * 1.35))
    expect(EXPLODE_MS).toBeLessThanOrEqual(Math.round(750 * 1.4))
    const slow = flightExtent(10 / EXPLODE_SLOW, 0)
    expect(slow.xMax).toBeGreaterThan(70)
    expect(slow.xMax).toBeLessThan(80) // 10 × 0.06 × 125мс ≈ 75px, как при 750мс
  })
})

describe('thinForLaunch: не больше MAX_PARTICLES частиц в воздухе, облачка одинаково плотные', () => {
  const list = n => Array.from({ length: n }, (_, i) => ({ i }))
  it('лимит 320, на облачко — треть лимита', () => {
    expect(MAX_PARTICLES).toBe(320)
    expect(PER_CLOUD_MAX).toBe(106)
  })
  it('мало узлов — список как есть', () => {
    const l = list(80)
    expect(thinForLaunch(l, 100)).toBe(l)
  })
  it('не влезает — прореживание равномерно, суммарно не больше лимита', () => {
    const out = thinForLaunch(list(500), 250)
    expect(250 + out.length).toBeLessThanOrEqual(MAX_PARTICLES)
    expect(out.length).toBeGreaterThan(0)
    expect(out[1].i - out[0].i).toBeGreaterThan(1)
  })
  it('в воздухе уже под завязку — всё равно остаётся минимум на облачко', () => {
    expect(thinForLaunch(list(500), MAX_PARTICLES).length).toBeGreaterThanOrEqual(60)
  })
  it('первое, второе и третье облачко взрываются с наползанием и получают поровну (а не первое — всё, третье — минимум)', () => {
    const sizes = []
    let alive = 0
    for (let i = 0; i < 3; i++) { const n = thinForLaunch(list(232), alive).length; sizes.push(n); alive += n }
    expect(sizes).toEqual([PER_CLOUD_MAX, PER_CLOUD_MAX, PER_CLOUD_MAX])
    expect(alive).toBeLessThanOrEqual(MAX_PARTICLES)
  })
  it('прореживание по индексу не смещено по направлению: слева и справа от центра облачка остаётся поровну', () => {
    const cloud = buildGrid(80, 20, [word(0, 0, 80)])
    const cx = mid(cloud).x
    const out = thinForLaunch(cloud, 0)
    expect(out.length).toBeLessThan(cloud.length)
    const left = out.filter(b => b.ax < cx).length
    expect(Math.abs(left - (out.length - left)) / out.length).toBeLessThan(0.3)
  })
})
