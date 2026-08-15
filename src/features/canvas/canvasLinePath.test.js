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

  it('полный пересчёт с обходом — меньше 25 мс на 119 связях', () => {
    const g = buildGraph()
    frame(g, true)
    const t0 = performance.now()
    for (let i = 0; i < 5; i++) { g.nodes[5].x += 2; frame(g, true) }
    expect((performance.now() - t0) / 5).toBeLessThan(25)
  })
})
