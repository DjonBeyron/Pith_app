import { describe, it, expect } from 'vitest'
import { buildGrid } from './phraseBubbleGrid.js'
import { drawExplode, launchBubbles, shiftBubbles, EXPLODE_MARGIN } from './phraseBubbleDraw.js'
import { flightExtent, limitFlight, thinForLaunch, MAX_PARTICLES, EXPLODE_POWER_MAX } from './phraseBubbleFlight.js'
import { EXPLODE_MS, EXPLODE_SLOW, MARGIN_X, MARGIN_Y } from './phraseBubbleConsts.js'

// Разлёт частиц взрыва. Облачка взрываются слева направо, поэтому ограничен он ТОЛЬКО в сторону ещё живого соседа
// (до 0.75 зазора, flightLimits), в сторону растворившихся и наружу — свободно, вверх-вниз тоже. Гоняем настоящие
// launchBubbles + drawExplode на кадрах разной длины и смотрим положение каждой частицы в каждый момент.

const word = (x, y, w, h = 20) => ({ x, y, w, h })
const mid = b => ({ x: (Math.min(...b.map(p => p.ax)) + Math.max(...b.map(p => p.ax))) / 2, y: (Math.min(...b.map(p => p.ay)) + Math.max(...b.map(p => p.ay))) / 2 })
const OLD_REACH = 9.5 // прежний предел выноса при зазоре 20px: половина зазора минус 0.5px

// Холст-самописец: фигуры, которые реально рисуются (в координатах текстового блока); rect — мелкие частицы
function recorder(shapes) {
  const put = (x, y, r) => shapes.push({ x: x - EXPLODE_MARGIN, y: y - EXPLODE_MARGIN, r })
  return { beginPath() {}, moveTo() {}, fill() {}, arc: (x, y, r) => put(x, y, r), rect: (x, y, w) => put(x + w / 2, y + w / 2, w / 2) }
}

// Взрывает облачка по очереди с шагом stepMs (как в финале); после каждого кадра зовёт check(частицы, фигуры, время)
function simulate(grid, dt, stepMs, check) {
  shiftBubbles(grid, EXPLODE_MARGIN - MARGIN_X, EXPLODE_MARGIN - MARGIN_Y)
  const groups = []
  for (const b of grid) (groups[b.region] ??= []).push(b)
  const flying = []
  const shapes = []
  const launched = new Set()
  for (let clock = 0; clock < groups.length * stepMs + EXPLODE_MS + 200; clock += dt) {
    groups.forEach((list, g) => {
      if (clock >= g * stepMs && !launched.has(g)) {
        const c = mid(list)
        launchBubbles(list, c.x, c.y)
        flying.push(...list)
        launched.add(g)
      }
    })
    shapes.length = 0
    drawExplode(recorder(shapes), flying, dt, 800, 400)
    check(flying, shapes, clock)
  }
  return flying
}

const three = () => [word(0, 0, 40), word(60, 0, 40), word(120, 0, 40)] // зазоры 20px
const X = b => b.ax - EXPLODE_MARGIN
const Y = b => b.ay - EXPLODE_MARGIN

describe('взрыв облачка: ограничен только разлёт в сторону ЖИВОГО соседа', () => {
  for (const dt of [16, 7, 32]) {
    it(`кадры по ${dt}мс: пока сосед справа жив, частицы не заходят в его тело (и в 0.75 зазора от слова)`, () => {
      const regs = three()
      let over = -Infinity, reach0 = -Infinity
      simulate(buildGrid(160, 20, regs), dt, 300, (flying, shapes, clock) => {
        for (const b of flying) {
          if (b.region > 1 || clock >= (b.region + 1) * 300) continue // у последнего соседа нет; сосед уже взорван — не живой
          const right = X(b) + b.r
          over = Math.max(over, right - (regs[b.region + 1].x - 5)) // тело соседа начинается в regs[g+1].x; запас 5px = 0.25 зазора
          if (b.region === 0) reach0 = Math.max(reach0, right)
        }
      })
      expect(over).toBeLessThanOrEqual(1e-6)
      expect(reach0).toBeGreaterThan(40 + OLD_REACH) // и вынос в сторону живого соседа больше прежней половины зазора
    })
  }

  it('слова вплотную (зазор 0): в сторону живого соседа общий край слов — граница', () => {
    let over = -Infinity
    simulate(buildGrid(80, 20, [word(0, 0, 40), word(40, 0, 40)]), 16, 200, (flying, _s, clock) => {
      for (const b of flying) if (b.region === 0 && clock < 200) over = Math.max(over, X(b) + b.r - 40)
    })
    expect(over).toBeLessThanOrEqual(1e-6)
  })

  it('в сторону растворившихся соседей и наружу — свободно: вынос ≥ 2× прежнего (прежний ≤ половина зазора)', () => {
    let left0 = Infinity, right2 = -Infinity, left1 = Infinity, left2 = Infinity
    simulate(buildGrid(160, 20, three()), 16, 300, flying => {
      for (const b of flying) {
        if (b.region === 0) left0 = Math.min(left0, X(b) - b.r)
        if (b.region === 1) left1 = Math.min(left1, X(b) - b.r)
        if (b.region === 2) { right2 = Math.max(right2, X(b) + b.r); left2 = Math.min(left2, X(b) - b.r) }
      }
    })
    expect(left0).toBeLessThan(-2 * OLD_REACH - 30) // слева от первого соседа нет: летят далеко наружу
    expect(right2).toBeGreaterThan(160 + 2 * OLD_REACH + 30)
    expect(left1).toBeLessThan(60 - 2 * OLD_REACH) // вбок в сторону уже растворившегося соседа
    expect(left2).toBeLessThan(120 - 2 * OLD_REACH)
  })

  it('вверх и вниз — свободно (в пределах поля вокруг фразы)', () => {
    let top = Infinity, bottom = -Infinity
    simulate(buildGrid(160, 20, three()), 16, 300, flying => {
      for (const b of flying) { top = Math.min(top, Y(b) - b.r); bottom = Math.max(bottom, Y(b) + b.r) }
    })
    expect(top).toBeLessThan(-2 * OLD_REACH)
    expect(bottom).toBeGreaterThan(20 + 2 * OLD_REACH)
  })

  it('две строки (зазор 10px): верхнее облачко не заходит вниз на живое нижнее, нижнее вверх летит свободно', () => {
    let overDown = -Infinity, up1 = Infinity
    simulate(buildGrid(60, 50, [word(0, 0, 60), word(0, 30, 60)]), 16, 300, (flying, _s, clock) => {
      for (const b of flying) {
        if (b.region === 0 && clock < 300) overDown = Math.max(overDown, Y(b) + b.r - (20 + 7.5)) // 0.75 × 10px
        if (b.region === 1) up1 = Math.min(up1, Y(b) - b.r)
      }
    })
    expect(overDown).toBeLessThanOrEqual(1e-6)
    expect(up1).toBeLessThan(30 - 2 * 4)
  })

  it('к концу жизни всё догорело: drawExplode сообщает о конце ровно за EXPLODE_MS', () => {
    const grid = buildGrid(100, 20, [word(0, 0, 40), word(60, 0, 40)])
    shiftBubbles(grid, EXPLODE_MARGIN - MARGIN_X, EXPLODE_MARGIN - MARGIN_Y)
    launchBubbles(grid, 100, 100)
    const ctx = recorder([])
    let done = false
    let steps = 0
    for (; !done && steps < 500; steps++) done = drawExplode(ctx, grid, 16, 800, 400)
    expect(done).toBe(true)
    expect(steps * 16).toBeGreaterThanOrEqual(EXPLODE_MS)
    expect(steps * 16).toBeLessThan(EXPLODE_MS + 100)
  })

  it('мелкие частицы рисуются квадратиком (rect), крупные — кругом (arc)', () => {
    const calls = { arc: 0, rect: 0 }
    const ctx = { beginPath() {}, moveTo() {}, fill() {}, arc() { calls.arc++ }, rect() { calls.rect++ } }
    const mk = r => ({ ax: 300, ay: 200, r, vx: 0, vy: 0, t: 0, sx: 1, sy: 1 })
    drawExplode(ctx, [mk(0.5), mk(0.8), mk(2)], 16, 800, 400)
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

describe('thinForLaunch: не больше MAX_PARTICLES частиц в воздухе', () => {
  const list = n => Array.from({ length: n }, (_, i) => ({ i }))
  it('лимит 450', () => expect(MAX_PARTICLES).toBe(450))
  it('влезает — список как есть', () => {
    const l = list(300)
    expect(thinForLaunch(l, 100)).toBe(l)
  })
  it('не влезает — прореживание равномерно, суммарно не больше лимита', () => {
    const out = thinForLaunch(list(500), 300)
    expect(300 + out.length).toBeLessThanOrEqual(MAX_PARTICLES)
    expect(out.length).toBeGreaterThan(0)
    expect(out[1].i - out[0].i).toBeGreaterThan(1)
  })
  it('в воздухе уже под завязку — всё равно остаётся минимум на облачко', () => {
    expect(thinForLaunch(list(500), MAX_PARTICLES).length).toBeGreaterThanOrEqual(60)
  })
  it('прореживание по индексу не смещено по направлению: слева и справа от центра облачка остаётся поровну', () => {
    const cloud = buildGrid(80, 20, [word(0, 0, 80)])
    const cx = mid(cloud).x
    const out = thinForLaunch(cloud, 350) // room = 100 из ~250 узлов
    expect(out.length).toBeLessThan(cloud.length)
    const left = out.filter(b => b.ax < cx).length
    expect(Math.abs(left - (out.length - left)) / out.length).toBeLessThan(0.3)
  })
})
