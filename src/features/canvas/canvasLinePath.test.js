import { describe, it, expect } from 'vitest'
import { connectionPath, roundedPath, routeLength } from './canvasLinePath.js'

// ── Хелперы: разбор схемного пути ────────────────────────────────────────
// Путь состоит из M / L / Q: прямые участки и скруглённые углы. Сэмплируем
// его и меряем то, что важно глазу: заходит ли линия под ноду и не уходит ли
// в бессмысленный крюк.

function commands(d) {
  const t = d.trim().split(/[\s,]+/)
  const out = []
  let i = 0
  while (i < t.length) {
    const c = t[i]
    if (c === 'M' || c === 'L') { out.push({ c, pts: [{ x: +t[i + 1], y: +t[i + 2] }] }); i += 3 }
    else if (c === 'Q') {
      out.push({ c, pts: [{ x: +t[i + 1], y: +t[i + 2] }, { x: +t[i + 3], y: +t[i + 4] }] })
      i += 5
    } else i++
  }
  return out
}

function walk(d, step = 6) {
  const cmds = commands(d)
  const pts = []
  let cur = null
  for (const cmd of cmds) {
    if (cmd.c === 'M') { cur = cmd.pts[0]; pts.push(cur); continue }
    if (cmd.c === 'L') {
      const to = cmd.pts[0]
      const n = Math.max(1, Math.ceil(Math.hypot(to.x - cur.x, to.y - cur.y) / step))
      for (let i = 1; i <= n; i++) {
        pts.push({ x: cur.x + (to.x - cur.x) * i / n, y: cur.y + (to.y - cur.y) * i / n })
      }
      cur = to
      continue
    }
    // Q: квадратичная — угол
    const [ctrl, to] = cmd.pts
    for (let i = 1; i <= 8; i++) {
      const t = i / 8, u = 1 - t
      pts.push({
        x: u * u * cur.x + 2 * u * t * ctrl.x + t * t * to.x,
        y: u * u * cur.y + 2 * u * t * ctrl.y + t * t * to.y,
      })
    }
    cur = to
  }
  return pts
}

// Точки пути внутри тела ноды; края у портов не в счёт
function inside(d, box, skipEnds = 3) {
  const pts = walk(d)
  let n = 0
  for (let i = skipEnds; i < pts.length - skipEnds; i++) {
    const p = pts[i]
    if (p.x > box.left && p.x < box.right && p.y > box.top && p.y < box.bottom) n++
  }
  return n
}

function length(d) {
  const pts = walk(d, 4)
  let s = 0
  for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
  return s
}

const manhattan = (a, b) => Math.abs(b.x - a.x) + Math.abs(b.y - a.y)

// Тело ноды-цели: начинается сразу справа от точки входа (порт в 8px от края)
const target = (x, y) => ({ left: x + 8, top: y - 30, right: x + 228, bottom: y + 220 })

describe('connectionPath — схемная форма', () => {
  it('путь состоит только из прямых и скруглённых углов', () => {
    const d = connectionPath(100, 380, 900, 400, 'k', null)
    expect(d.startsWith('M ')).toBe(true)
    expect(d).toContain('L ')
    expect(d).toContain('Q ')          // углы скруглены, а не острые
    expect(d).not.toContain('C ')      // кубических кривых больше нет
    expect(d).not.toMatch(/NaN|Infinity|undefined/)
  })

  it('идёт ступенькой: вправо, вертикаль, вправо', () => {
    const d = connectionPath(100, 380, 900, 400, 'k', null)
    const pts = walk(d, 20)
    // по горизонтали монотонно вправо — линия не мечется туда-сюда
    const xs = pts.map(p => p.x)
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(99)
    expect(Math.max(...xs)).toBeLessThanOrEqual(901)
  })

  it('один и тот же вход даёт один и тот же путь (линии не дрожат)', () => {
    const box = target(392, 360)
    const a = connectionPath(1200, 900, 392, 360, 'n1:0', box, [box])
    const b = connectionPath(1200, 900, 392, 360, 'n1:0', box, [box])
    expect(a).toBe(b)
  })

  it('длина близка к манхэттенской — лишних петель нет', () => {
    const d = connectionPath(100, 380, 900, 400, 'k', null)
    const straight = manhattan({ x: 100, y: 380 }, { x: 900, y: 400 })
    expect(length(d)).toBeLessThan(straight * 1.15)
  })
})

describe('roundedPath — скругление углов', () => {
  it('радиус ужимается под короткие сегменты, петель не появляется', () => {
    const d = roundedPath([{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 6 }, { x: 40, y: 6 }])
    expect(d).not.toMatch(/NaN/)
    expect(length(d)).toBeLessThan(60)
  })

  it('точки, стоящие на одном месте, не ломают путь', () => {
    const d = roundedPath([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 50, y: 0 }])
    expect(d).not.toMatch(/NaN/)
  })

  it('длина ломаной считается по сегментам', () => {
    expect(routeLength([{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 40 }])).toBe(70)
  })
})

describe('connectionPath — обход тел нод', () => {
  it('связь «назад» не ныряет под свою же ноду-цель', () => {
    const box = target(392, 360)
    const d = connectionPath(1200, 900, 392, 360, 'k', box, [box])
    expect(inside(d, box)).toBe(0)
  })

  it('обход работает с любой стороны', () => {
    const box = target(392, 360)
    for (const y1 of [900, 200, 420]) {
      const d = connectionPath(1200, y1, 392, 360, 'k' + y1, box, [box])
      expect(inside(d, box), `источник на y=${y1}`).toBe(0)
    }
  })

  it('чужая нода на пути тоже обходится', () => {
    const box = target(900, 400)
    const blocker = { left: 300, top: 300, right: 520, bottom: 560 }
    const d = connectionPath(100, 380, 900, 400, 'k', box, [box, blocker])
    expect(inside(d, blocker)).toBe(0)
    expect(inside(d, box)).toBe(0)
  })

  it('прямая связь, которой никто не мешает, остаётся короткой', () => {
    const box = target(500, 400)
    const d = connectionPath(100, 380, 500, 400, 'k', box, [box])
    expect(length(d)).toBeLessThan(500)
  })
})

describe('connectionPath — соседние ноды не получают крюк', () => {
  function chainLink(gap) {
    const from = { x: 228, y: 130 }
    const to = { x: gap - 8, y: 130 }
    const boxes = [
      { left: 0, top: 0, right: 220, bottom: 380 },
      { left: gap, top: 0, right: gap + 220, bottom: 380 },
    ]
    return connectionPath(from.x, from.y, to.x, to.y, 'a:0', boxes[1], boxes, boxes[0])
  }

  it('соседняя нода вплотную — короткая прямая перемычка', () => {
    const d = chainLink(240)
    expect(length(d)).toBeLessThan(40)
  })

  it('при любом типичном шаге сетки крюка нет', () => {
    for (const gap of [240, 260, 308, 360, 420]) {
      const d = chainLink(gap)
      expect(length(d), `шаг ${gap}`).toBeLessThan((gap - 236) * 1.6 + 60)
    }
  })
})

describe('connectionPath — связь «назад» идёт кратчайшим путём', () => {
  // Ноды в графе высокие, и обход «вокруг обеих целиком» превращался в
  // огромный крюк. Проверяем, что маршрут держится близко к прямому ходу
  const H = 600
  function backLink(from, to) {
    const fromBox = { left: from.x - 308, top: from.y - 60, right: from.x - 8, bottom: from.y - 60 + H }
    const toBox = { left: to.x + 8, top: to.y - 60, right: to.x + 316, bottom: to.y - 60 + H }
    const d = connectionPath(from.x, from.y, to.x, to.y, 'k', toBox, [fromBox, toBox], fromBox)
    return { d, man: manhattan(from, to), fromBox, toBox }
  }

  it('цель левее и вровень — крюк меньше полутора манхэттенов', () => {
    const { d, man } = backLink({ x: 900, y: 200 }, { x: 300, y: 200 })
    expect(length(d)).toBeLessThan(man * 1.5)
  })

  it('цель левее и ниже — почти прямой ход', () => {
    const { d, man } = backLink({ x: 900, y: 200 }, { x: 300, y: 900 })
    expect(length(d)).toBeLessThan(man * 1.2)
  })

  it('маршрут всё так же не задевает ни источник, ни цель', () => {
    const { d, fromBox, toBox } = backLink({ x: 900, y: 200 }, { x: 300, y: 320 })
    expect(inside(d, fromBox)).toBe(0)
    expect(inside(d, toBox)).toBe(0)
  })
})

describe('connectionPath — цель наискось под источником', () => {
  // Расстановка из редактора: #6 ниже и левее, её вход оказывается прямо под
  // телом #5 — пройти можно только по коридору между нодами
  const src = { left: 78, top: 18, right: 250, bottom: 252 }
  const dst = { left: 130, top: 345, right: 302, bottom: 578 }
  const path = () => connectionPath(258, 212, 122, 560, '5:0', dst, [src, dst], src)

  it('не проходит под своей же нодой-источником', () => {
    expect(inside(path(), src)).toBe(0)
  })

  it('не проходит под нодой-целью', () => {
    expect(inside(path(), dst)).toBe(0)
  })

  it('идёт через просвет между нодами, а не вокруг всего', () => {
    // просвет по вертикали: низ источника 252, верх цели 345
    const pts = walk(path(), 8)
    const lane = pts.find(p => p.x < 200 && p.y > 252 && p.y < 345)
    expect(lane, 'маршрут должен проходить в просвете').toBeTruthy()
  })
})

describe('connectionPath — устойчивость', () => {
  it('вырожденные случаи не ломают путь', () => {
    const cases = [
      [500, 700, 480, 300],
      [500, 400, 470, 400],
      [500, 400, 500, 400],
      [2000, 100, 100, 1500],
    ]
    for (const [x1, y1, x2, y2] of cases) {
      const box = target(x2, y2)
      const d = connectionPath(x1, y1, x2, y2, 'k', box, [box])
      expect(d, `${x1},${y1} → ${x2},${y2}`).not.toMatch(/NaN|Infinity|undefined/)
    }
  })
})

describe('connectionPath — стоимость расчёта', () => {
  function buildGraph() {
    const nodes = []
    for (let i = 0; i < 60; i++) nodes.push({ x: 100 + (i % 10) * 260, y: 100 + Math.floor(i / 10) * 300 })
    const boxes = nodes.map(n => ({ left: n.x, top: n.y, right: n.x + 220, bottom: n.y + 280 }))
    const links = []
    for (let i = 0; i < nodes.length - 1; i++) links.push([i, i + 1])
    for (let i = 0; i < nodes.length; i++) links.push([i, (i * 7 + 3) % nodes.length])
    return { nodes, boxes, links }
  }

  function frame({ nodes, boxes, links }) {
    for (const [a, b] of links) {
      connectionPath(nodes[a].x + 228, nodes[a].y + 130, nodes[b].x - 8, nodes[b].y + 130,
        a + ':0', boxes[b], boxes, boxes[a])
    }
  }

  // Порог с запасом: тест ловит регрессию в разы, а не проценты
  it('полный пересчёт — меньше 60 мс на 119 связях', () => {
    const g = buildGraph()
    frame(g)
    const t0 = performance.now()
    for (let i = 0; i < 5; i++) { g.nodes[5].x += 2; frame(g) }
    expect((performance.now() - t0) / 5).toBeLessThan(60)
  })
})
