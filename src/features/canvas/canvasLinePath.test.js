import { describe, it, expect } from 'vitest'
import { connectionPath } from './canvasLinePath.js'

// ── Хелперы: разбор пути и его обмер ────────────────────────────────────
// Путь всегда вида "M x y C ..." — сэмплируем кубики и меряем то, что важно
// глазу: заходит ли линия под ноду и насколько резко поворачивает.

function segments(d) {
  const t = d.trim().split(/[\s,]+/)
  const segs = []
  let i = 0, cur = null
  while (i < t.length) {
    if (t[i] === 'M') { cur = { x: +t[i + 1], y: +t[i + 2] }; i += 3 }
    else if (t[i] === 'C') {
      const p = [cur, { x: +t[i + 1], y: +t[i + 2] }, { x: +t[i + 3], y: +t[i + 4] }, { x: +t[i + 5], y: +t[i + 6] }]
      segs.push(p); cur = p[3]; i += 7
    } else i++
  }
  return segs
}

function at(p, t) {
  const u = 1 - t
  return {
    x: u * u * u * p[0].x + 3 * u * u * t * p[1].x + 3 * u * t * t * p[2].x + t * t * t * p[3].x,
    y: u * u * u * p[0].y + 3 * u * u * t * p[1].y + 3 * u * t * t * p[2].y + t * t * t * p[3].y,
  }
}

// Точки пути с шагом ~step пикселей — метрики не зависят от числа сегментов
function walk(d, step = 10) {
  const dense = []
  for (const s of segments(d)) for (let i = 0; i <= 200; i++) dense.push(at(s, i / 200))
  const out = [dense[0]]
  let acc = 0
  for (let i = 1; i < dense.length; i++) {
    acc += Math.hypot(dense[i].x - dense[i - 1].x, dense[i].y - dense[i - 1].y)
    if (acc >= step) { out.push(dense[i]); acc = 0 }
  }
  return out
}

// Сколько точек пути оказалось внутри тела ноды (края не в счёт: линия
// подходит к порту вплотную)
function inside(d, box, skipEnds = 2) {
  const pts = walk(d, 6)
  let n = 0
  for (let i = skipEnds; i < pts.length - skipEnds; i++) {
    const p = pts[i]
    if (p.x > box.left && p.x < box.right && p.y > box.top && p.y < box.bottom) n++
  }
  return n
}

// Самый резкий поворот пути в градусах на 10px — мера «залома»
function maxTurn(d) {
  const pts = walk(d, 10)
  let max = 0
  for (let i = 1; i < pts.length - 1; i++) {
    const a = { x: pts[i].x - pts[i - 1].x, y: pts[i].y - pts[i - 1].y }
    const b = { x: pts[i + 1].x - pts[i].x, y: pts[i + 1].y - pts[i].y }
    const la = Math.hypot(a.x, a.y), lb = Math.hypot(b.x, b.y)
    if (la < 0.01 || lb < 0.01) continue
    const cos = Math.min(1, Math.max(-1, (a.x * b.x + a.y * b.y) / (la * lb)))
    max = Math.max(max, Math.acos(cos) * 180 / Math.PI)
  }
  return max
}

function length(d) {
  const pts = walk(d, 4)
  let s = 0
  for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
  return s
}

// Тело ноды-цели: начинается сразу справа от точки входа (порт в 8px от края)
const target = (x, y) => ({ left: x + 8, top: y - 30, right: x + 228, bottom: y + 220 })

describe('connectionPath — форма пути', () => {
  it('всегда одна цепочка кубических кривых, без прямых углов', () => {
    const d = connectionPath(100, 380, 900, 400, 'k', null)
    expect(d.startsWith('M ')).toBe(true)
    expect(d).toContain('C ')
    expect(d).not.toContain('L ')
    expect(d).not.toMatch(/NaN|Infinity|undefined/)
  })

  it('без препятствий путь не меняется — прежнее поведение сохранено', () => {
    const plain = connectionPath(100, 380, 900, 400, 'k', null)
    const empty = connectionPath(100, 380, 900, 400, 'k', target(900, 400), [])
    expect(empty).toBe(plain)
  })

  it('один и тот же вход даёт один и тот же путь (линии не дрожат)', () => {
    const box = target(392, 360)
    const a = connectionPath(1200, 900, 392, 360, 'n1:0', box, [box])
    const b = connectionPath(1200, 900, 392, 360, 'n1:0', box, [box])
    expect(a).toBe(b)
  })
})

describe('connectionPath — обход тел нод', () => {
  it('связь «назад» не ныряет под свою же ноду-цель', () => {
    const box = target(392, 360)
    const d = connectionPath(1200, 900, 392, 360, 'k', box, [box])
    expect(inside(d, box)).toBe(0)
  })

  it('обход работает и вверх, и вниз — с какой стороны ни подходи', () => {
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

  it('прямая связь, которой никто не мешает, остаётся прямой и короткой', () => {
    const box = target(500, 400)
    const d = connectionPath(100, 380, 500, 400, 'k', box, [box])
    expect(maxTurn(d)).toBeLessThan(3)
    expect(length(d)).toBeLessThan(500)
  })
})

describe('connectionPath — соседние ноды не получают крюк', () => {
  // Ноды идут подряд по цепочке урока и стоят почти вплотную: выход одной и
  // вход следующей в считаных пикселях друг от друга. Зазор между телами
  // узкий, и раньше линия считалась «ныряющей» — вместо прямой рисовалась
  // петля в семь раз длиннее
  function chainLink(gap) {
    const from = { x: 228, y: 130 }              // выход ноды слева
    const to = { x: gap - 8, y: 130 }            // вход следующей ноды
    const boxes = [
      { left: 0, top: 0, right: 220, bottom: 380 },
      { left: gap, top: 0, right: gap + 220, bottom: 380 },
    ]
    return connectionPath(from.x, from.y, to.x, to.y, 'a:0', boxes[1], boxes, boxes[0])
  }

  it('соседняя нода вплотную — линия остаётся прямой', () => {
    const d = chainLink(240)
    expect(d).toBe(connectionPath(228, 130, 232, 130, 'a:0', null))
    expect(maxTurn(d)).toBeLessThan(5)
  })

  it('при любом типичном шаге сетки крюка нет', () => {
    for (const gap of [240, 260, 300, 360, 420]) {
      const d = chainLink(gap)
      expect(length(d), `шаг ${gap}`).toBeLessThan((gap - 236) * 2 + 120)
      expect(maxTurn(d), `шаг ${gap}`).toBeLessThan(10)
    }
  })

  it('обход в принципе не длиннее прямой более чем в 2.5 раза', () => {
    const box = target(392, 360)
    for (const [x1, y1] of [[1200, 900], [700, 420], [1200, 200], [300, 800]]) {
      const routed = length(connectionPath(x1, y1, 392, 360, 'k', box, [box]))
      const plain = length(connectionPath(x1, y1, 392, 360, 'k', null))
      expect(routed, `из ${x1},${y1}`).toBeLessThanOrEqual(plain * 2.5)
    }
  })
})

describe('connectionPath — нода под нодой обходится сбоку', () => {
  // Расстановка из редактора: #5 сверху, #6 ниже и чуть правее, ноды почти
  // смыкаются по горизонтали, а вход #6 — внизу слева (первая строка «Тогда»
  // у неё в самом низу). Связь идёт почти отвесно вниз. Отклонять её вверх
  // бессмысленно — линия улетала крюком выше обеих нод.
  const from = { x: 261, y: 310 }
  const to = { x: 242, y: 723 }
  const src = { left: 10, top: 20, right: 253, bottom: 360 }
  const dst = { left: 250, top: 415, right: 490, bottom: 760 }
  const path = () => connectionPath(from.x, from.y, to.x, to.y, '5:0', dst, [src, dst], src)

  it('линия не поднимается выше точки выхода', () => {
    const top = Math.min(...walk(path(), 6).map(p => p.y))
    expect(top).toBeGreaterThanOrEqual(from.y - 1)
  })

  it('идёт слева от ноды-цели, а не поверх неё', () => {
    expect(inside(path(), dst)).toBe(0)
  })

  it('остаётся компактной и плавной', () => {
    const d = path()
    const straight = Math.hypot(to.x - from.x, to.y - from.y)
    expect(length(d)).toBeLessThan(straight * 1.6)
    expect(maxTurn(d)).toBeLessThan(45)
  })
})

describe('connectionPath — цель наискось под источником', () => {
  // Вторая расстановка из редактора: #6 ниже и левее, её вход оказывается
  // прямо под телом #5. Пройти можно только по коридору между нодами —
  // линия обязана не нырять ни под источник, ни под цель.
  const src = { left: 78, top: 18, right: 250, bottom: 252 }
  const dst = { left: 130, top: 345, right: 302, bottom: 578 }
  const from = { x: 258, y: 212 }
  const to = { x: 122, y: 560 }
  const path = () => connectionPath(from.x, from.y, to.x, to.y, '5:0', dst, [src, dst], src)

  it('не проходит под своей же нодой-источником', () => {
    expect(inside(path(), src)).toBe(0)
  })

  it('не проходит под нодой-целью', () => {
    expect(inside(path(), dst)).toBe(0)
  })

  it('не заламывается', () => {
    expect(maxTurn(path())).toBeLessThan(45)
  })
})

describe('connectionPath — плавность и компактность', () => {
  it('обход не заламывается: нигде нет поворота под прямым углом', () => {
    const box = target(392, 360)
    for (const y1 of [900, 200, 420, 700]) {
      const d = connectionPath(1200, y1, 392, 360, 'k' + y1, box, [box])
      expect(maxTurn(d), `источник на y=${y1}`).toBeLessThan(60)
    }
  })

  it('обход не раздувается: не длиннее прямой линии в полтора раза', () => {
    const box = target(392, 360)
    const plain = length(connectionPath(1200, 900, 392, 360, 'k', null))
    const routed = length(connectionPath(1200, 900, 392, 360, 'k', box, [box]))
    expect(routed).toBeLessThan(plain * 1.5)
  })

  it('у входа остаётся изгиб — линия не втыкается в порт по прямой', () => {
    const box = target(392, 360)
    const d = connectionPath(1200, 900, 392, 360, 'k', box, [box])
    expect(maxTurn(d)).toBeGreaterThan(5)
  })
})

describe('connectionPath — устойчивость', () => {
  it('вырожденные случаи не ломают путь', () => {
    const cases = [
      [500, 700, 480, 300],   // цель прямо над источником
      [500, 400, 470, 400],   // цель вплотную слева
      [500, 400, 500, 400],   // точки совпадают
      [2000, 100, 100, 1500], // очень длинная связь назад-вниз
    ]
    for (const [x1, y1, x2, y2] of cases) {
      const box = target(x2, y2)
      const d = connectionPath(x1, y1, x2, y2, 'k', box, [box])
      expect(d, `${x1},${y1} → ${x2},${y2}`).not.toMatch(/NaN|Infinity|undefined/)
    }
  })

  it('нода вплотную к порту: чистого пути нет, но линия всё равно строится', () => {
    const box = target(900, 400)
    const blocker = { left: 640, top: 300, right: 860, bottom: 500 }
    const d = connectionPath(100, 380, 900, 400, 'k', box, [box, blocker])
    expect(d).not.toMatch(/NaN/)
    expect(maxTurn(d)).toBeLessThan(60)
  })
})

describe('connectionPath — стоимость расчёта', () => {
  // Граф крупнее реального урока: если пересчёт линий уложился в бюджет,
  // на перетаскивание нод его хватит с запасом
  function buildGraph() {
    const nodes = []
    for (let i = 0; i < 60; i++) nodes.push({ x: 100 + (i % 10) * 260, y: 100 + Math.floor(i / 10) * 300 })
    const boxes = nodes.map(n => ({ left: n.x, top: n.y, right: n.x + 220, bottom: n.y + 280 }))
    const links = []
    for (let i = 0; i < nodes.length - 1; i++) links.push([i, i + 1])
    for (let i = 0; i < nodes.length; i++) links.push([i, (i * 7 + 3) % nodes.length])
    return { nodes, boxes, links }
  }

  function frame({ nodes, boxes, links }, routed) {
    for (const [a, b] of links) {
      const fx = nodes[a].x + 228, fy = nodes[a].y + 130
      const tx = nodes[b].x - 8, ty = nodes[b].y + 130
      if (routed) connectionPath(fx, fy, tx, ty, a + ':0', boxes[b], boxes, boxes[a])
      else connectionPath(fx, fy, tx, ty, a + ':0', null)
    }
  }

  it('кадр перетаскивания (без обхода) — меньше 2 мс на 119 связях', () => {
    const g = buildGraph()
    frame(g, false)
    const t0 = performance.now()
    for (let i = 0; i < 10; i++) { g.nodes[5].x += 2; frame(g, false) }
    expect((performance.now() - t0) / 10).toBeLessThan(2)
  })

  // Порог с запасом: тест ловит регрессию в разы, а не проценты — иначе он
  // мигает, когда машина занята сборкой или линтером
  it('полный пересчёт с обходом — меньше 60 мс на 119 связях', () => {
    const g = buildGraph()
    frame(g, true)
    const t0 = performance.now()
    for (let i = 0; i < 5; i++) { g.nodes[5].x += 2; frame(g, true) }
    expect((performance.now() - t0) / 5).toBeLessThan(60)
  })
})
