import { describe, it, expect } from 'vitest'
import { buildGrid } from './phraseBubbleGrid.js'
import { drawExplode, launchBubbles, shiftBubbles, EXPLODE_MARGIN } from './phraseBubbleDraw.js'
import { flightExtent, thinForLaunch, MAX_PARTICLES } from './phraseBubbleFlight.js'
import { EXPLODE_MS, EXPLODE_SLOW, MARGIN_X, MARGIN_Y } from './phraseBubbleConsts.js'

// Разлёт частиц взрыва не должен залетать за границы облачка: середина зазора до соседа минус полпикселя (reachForGap).
// Гоняем настоящие launchBubbles + drawExplode на кадрах разной длины и смотрим положение каждой частицы в каждый момент.

const word = (x, y, w, h = 20) => ({ x, y, w, h })
const mid = b => ({ x: (Math.min(...b.map(p => p.ax)) + Math.max(...b.map(p => p.ax))) / 2, y: (Math.min(...b.map(p => p.ay)) + Math.max(...b.map(p => p.ay))) / 2 })

// Холст-самописец: дуги, которые реально рисуются (в координатах текстового блока)
function recorder(arcs) {
  return { beginPath() {}, moveTo() {}, fill() {}, arc(x, y, r) { arcs.push({ x: x - EXPLODE_MARGIN, y: y - EXPLODE_MARGIN, r }) } }
}

// Взрывает все облачка (по очереди с шагом stepMs, как в финале) и вызывает check(частицы, время) после каждого кадра
function simulate(grid, dt, stepMs, check) {
  shiftBubbles(grid, EXPLODE_MARGIN - MARGIN_X, EXPLODE_MARGIN - MARGIN_Y)
  const groups = []
  for (const b of grid) (groups[b.region] ??= []).push(b)
  const flying = []
  const W = 600, H = 300
  const arcs = []
  let clock = 0
  const launched = new Set()
  for (; clock < groups.length * stepMs + EXPLODE_MS + 200; clock += dt) {
    groups.forEach((list, g) => {
      if (clock >= g * stepMs && !launched.has(g)) {
        const c = mid(list)
        launchBubbles(list, c.x, c.y)
        flying.push(...list)
        launched.add(g)
      }
    })
    arcs.length = 0
    drawExplode(recorder(arcs), flying, dt, W, H)
    check(flying, arcs)
  }
  return flying
}

// Худший случай за весь взрыв (одна проверка в конце — тысячи expect на кадр тормозили бы тест)
const worst = () => ({ over0: -Infinity, over1: -Infinity, arcs: 0 })

describe('взрыв облачка: разлёт ограничен границами облачка', () => {
  for (const dt of [16, 7, 32]) {
    it(`зазор 20px, кадры по ${dt}мс: ни центр, ни нарисованный шарик не пересекают середину зазора`, () => {
      const grid = buildGrid(100, 20, [word(0, 0, 40), word(60, 0, 40)])
      // граница облачков в координатах текстового блока: 49.5 и 50.5 (середина зазора 50 ± 0.5)
      const w = worst()
      simulate(grid, dt, 300, (flying, arcs) => {
        for (const b of flying) {
          const x = b.ax - EXPLODE_MARGIN
          if (b.region === 0) w.over0 = Math.max(w.over0, x + b.r - 49.5)
          else w.over1 = Math.max(w.over1, 50.5 - (x - b.r))
        }
        for (const a of arcs) if (a.x + a.r > 50 && a.x - a.r < 50) w.arcs++ // нарисованное лежит на середине зазора
      })
      expect(w.over0).toBeLessThanOrEqual(1e-6)
      expect(w.over1).toBeLessThanOrEqual(1e-6)
      expect(w.arcs).toBe(0)
    })
  }

  it('слова вплотную (зазор 0): границей служит общий край слов', () => {
    const grid = buildGrid(80, 20, [word(0, 0, 40), word(40, 0, 40)])
    const w = worst()
    simulate(grid, 16, 200, flying => {
      for (const b of flying) {
        const x = b.ax - EXPLODE_MARGIN
        if (b.region === 0) w.over0 = Math.max(w.over0, x + b.r - 40)
        else w.over1 = Math.max(w.over1, 40 - (x - b.r))
      }
    })
    expect(w.over0).toBeLessThanOrEqual(1e-6)
    expect(w.over1).toBeLessThanOrEqual(1e-6)
  })

  it('соседние строки (зазор 10px): частицы не заходят за середину вертикального зазора', () => {
    const grid = buildGrid(60, 50, [word(0, 0, 60), word(0, 30, 60)])
    const w = worst()
    simulate(grid, 16, 300, flying => {
      for (const b of flying) {
        const y = b.ay - EXPLODE_MARGIN
        if (b.region === 0) w.over0 = Math.max(w.over0, y + b.r - 24)
        else w.over1 = Math.max(w.over1, 26 - (y - b.r))
      }
    })
    expect(w.over0).toBeLessThanOrEqual(1e-6)
    expect(w.over1).toBeLessThanOrEqual(1e-6)
  })

  it('у внешних краёв фразы разлёт как раньше: крайние облачка улетают далеко наружу, среднее рассыпается вверх-вниз', () => {
    const grid = buildGrid(140, 20, [word(0, 0, 40), word(50, 0, 40), word(100, 0, 40)])
    let left = Infinity, right = -Infinity, midTop = Infinity, midBottom = -Infinity
    simulate(grid, 16, 300, flying => {
      for (const b of flying) {
        const x = b.ax - EXPLODE_MARGIN, y = b.ay - EXPLODE_MARGIN
        if (b.region === 0) left = Math.min(left, x)
        if (b.region === 2) right = Math.max(right, x)
        if (b.region === 1) { midTop = Math.min(midTop, y); midBottom = Math.max(midBottom, y) }
      }
    })
    expect(left).toBeLessThan(-30)    // слева соседа нет
    expect(right).toBeGreaterThan(140 + 30)
    expect(midTop).toBeLessThan(-20)  // у среднего боковые стороны закрыты — энергия ушла вверх/вниз, а не пропала
    expect(midBottom).toBeGreaterThan(20 + 20)
  })

  it('к концу жизни всё догорело: drawExplode сообщает о конце ровно за EXPLODE_MS', () => {
    const grid = buildGrid(100, 20, [word(0, 0, 40), word(60, 0, 40)])
    shiftBubbles(grid, EXPLODE_MARGIN - MARGIN_X, EXPLODE_MARGIN - MARGIN_Y)
    launchBubbles(grid, 100, 100)
    const ctx = { beginPath() {}, moveTo() {}, arc() {}, fill() {}, globalAlpha: 1 }
    let done = false
    let steps = 0
    for (; !done && steps < 500; steps++) done = drawExplode(ctx, grid, 16, 600, 300)
    expect(done).toBe(true)
    expect(steps * 16).toBeGreaterThanOrEqual(EXPLODE_MS)
    expect(steps * 16).toBeLessThan(EXPLODE_MS + 100)
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
  it('влезает — список как есть', () => {
    const l = list(300)
    expect(thinForLaunch(l, 100)).toBe(l)
  })
  it('не влезает — прореживание равномерно, суммарно не больше лимита (кроме минимума на облачко)', () => {
    const out = thinForLaunch(list(500), 400)
    expect(400 + out.length).toBeLessThanOrEqual(MAX_PARTICLES)
    expect(out.length).toBeGreaterThan(0)
    expect(out[1].i - out[0].i).toBeGreaterThan(1)
  })
  it('в воздухе уже под завязку — всё равно остаётся минимум на облачко', () => {
    expect(thinForLaunch(list(500), MAX_PARTICLES).length).toBeGreaterThanOrEqual(60)
  })
})
