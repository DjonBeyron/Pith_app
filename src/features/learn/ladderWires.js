// Линии «Моей памяти» — как связи на схеме модуля: ортогональные, со
// скруглёнными углами, точки на концах, цвет «откуда → куда» градиентом.
// Ствол: от низа шапки «Сегодня» вниз, влево к краю экрана и отводами в
// левый бок каждой ступени; от низа «Родных» — в верх пятиугольника
// постоянной памяти. Шарики — слова сегодняшнего повторения: бегут по
// связи обратно, из ступени к кнопке «Повторить».
// Чистые функции: прямоугольники меряет MemoryLadderWires.jsx.

export const WIRE_COLORS = { accent: '#b6fe3b', levels: ['#b0b8c2', '#e2cd78', '#b6fe3b'], perm: '#8b5cf6' }

// Толщина связи растёт плавно по всему пути: от шапки «Повторить» (W_MIN) до
// пятиугольника «Закреплённые слова» (W_MAX) — слово крепнет по дороге вниз
export const W_MIN = 1.25
export const W_MAX = 4.5

// Шарик слова к повтору — круг BALL_D px (.memBall, memory-ladder.css). Он
// стартует у ступени размером BALL_GROW (115%) толщины линии и сжимается вместе
// с ней по дороге к шапке: масштаб transform в тех же ключевых кадрах и с той
// же кривой, что offset-distance (CSS, без JS на кадр)
export const BALL_D = 8
export const BALL_GROW = 1.15
export const ballScale = w => Math.round(BALL_GROW * w / BALL_D * 1000) / 1000

// Верх контура пятиугольника — доля высоты его коробки (MemoryPermNode.jsx)
export const FIN_TOP = 4.6 / 212

const f = n => Math.round(n * 10) / 10

// Ломаная по точкам → path с углами-скруглениями радиуса R (на коротком
// отрезке — меньше, чтобы скругления не наезжали друг на друга)
export function orth(pts, R = 12) {
  let d = `M ${f(pts[0][0])} ${f(pts[0][1])}`
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i - 1], [x, y] = pts[i], [nx, ny] = pts[i + 1]
    const r = Math.min(R, Math.hypot(x - px, y - py) / 2, Math.hypot(nx - x, ny - y) / 2)
    const ax = x - Math.sign(x - px) * r, ay = y - Math.sign(y - py) * r
    const bx = x + Math.sign(nx - x) * r, by = y + Math.sign(ny - y) * r
    d += ` L ${f(ax)} ${f(ay)} Q ${f(x)} ${f(y)} ${f(bx)} ${f(by)}`
  }
  const last = pts[pts.length - 1]
  return d + ` L ${f(last[0])} ${f(last[1])}`
}

const midX = r => (r.l + r.r) / 2
const midY = r => (r.t + r.b) / 2

// Прямоугольники { l, t, r, b } — в координатах слоя линий. edge — левый
// край экрана в тех же координатах (слой правее края — отрицательный):
// ствол идёт посередине между краем экрана и ступенями.
// → [{ pts, from, to }]: три отвода в ступени и связь «Родные» → пятиугольник
export function ladderLinks({ hero, blocks, fin, edge = 0 }) {
  const trunkX = (edge + blocks[0].l) / 2
  const y0 = hero.b + 14
  const links = blocks.map((b, i) => ({
    pts: [[midX(hero), hero.b], [midX(hero), y0], [trunkX, y0], [trunkX, midY(b)], [b.l, midY(b)]],
    from: WIRE_COLORS.accent, to: WIRE_COLORS.levels[i],
  }))
  if (fin) {
    const b3 = blocks[2]
    const top = [midX(fin), fin.t + (fin.b - fin.t) * FIN_TOP]
    const y = b3.b + (top[1] - b3.b) / 2
    links.push({ pts: [[midX(b3), b3.b], [midX(b3), y], [top[0], y], top], from: WIRE_COLORS.levels[2], to: WIRE_COLORS.perm })
  }
  return links
}

// Путь шарика — та же связь задом наперёд: из ступени к шапке
export const ballPath = link => orth([...link.pts].reverse())

// Точки той же скруглённой ломаной, что orth: дуга угла — n кусками
export function orthPoints(pts, R = 12, n = 6) {
  const out = [pts[0]]
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i - 1], [x, y] = pts[i], [nx, ny] = pts[i + 1]
    const r = Math.min(R, Math.hypot(x - px, y - py) / 2, Math.hypot(nx - x, ny - y) / 2)
    const ax = x - Math.sign(x - px) * r, ay = y - Math.sign(y - py) * r
    const bx = x + Math.sign(nx - x) * r, by = y + Math.sign(ny - y) * r
    out.push([ax, ay])
    for (let k = 1; k <= n; k++) {
      const t = k / n, u = 1 - t
      out.push([u * u * ax + 2 * u * t * x + t * t * bx, u * u * ay + 2 * u * t * y + t * t * by])
    }
  }
  out.push(pts[pts.length - 1])
  return out
}

const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1])
const polyLen = poly => poly.slice(1).reduce((n, p, i) => n + dist(poly[i], p), 0)
// Длина полилинии от начала до точки (X, Y) на её вертикальном отрезке x = X
function lengthTo(poly, X, Y) {
  let acc = 0
  for (let i = 1; i < poly.length; i++) {
    const a = poly[i - 1], b = poly[i]
    if (Math.abs(a[0] - X) < 0.01 && Math.abs(b[0] - X) < 0.01 && (Y - a[1]) * (Y - b[1]) <= 0) return acc + Math.abs(Y - a[1])
    acc += dist(a, b)
  }
  return acc
}
const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16))
export function mixColor(a, b, t) {
  const [x, y] = [hex(a), hex(b)]
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(', ')})`
}

// Полилиния → короткие отрезки (не длиннее maxLen) с толщиной и цветом,
// плавно меняющимися по длине: s0 → s1 — доля всего пути (толщина), c0 → c1 — цвет
export function taper(poly, { s0, s1, c0, c1, maxLen = 8 }) {
  const total = polyLen(poly) || 1
  const pieces = []
  let acc = 0
  for (let i = 1; i < poly.length; i++) {
    const a = poly[i - 1], b = poly[i], L = dist(a, b)
    const n = Math.max(1, Math.ceil(L / maxLen))
    for (let k = 0; k < n; k++) {
      const at = t => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
      const [p, q] = [at(k / n), at((k + 1) / n)]
      const t = (acc + L * (k + 0.5) / n) / total
      pieces.push({ x1: f(p[0]), y1: f(p[1]), x2: f(q[0]), y2: f(q[1]), w: f(W_MIN + (W_MAX - W_MIN) * (s0 + (s1 - s0) * t)), color: mixColor(c0, c1, t) })
    }
    acc += L
  }
  return pieces
}

// Весь рисунок связей: ствол (от шапки до «Усвоенных»), отводы в «Новые» и
// «Знакомые» (толщина — как у ствола в точке отвода, цвет — к цвету ступени),
// связь «Усвоенные» → пятиугольник (до W_MAX) и точки на концах.
// → { pieces: [{ x1, y1, x2, y2, w, color }], dots: [{ x, y, r, color }],
//      widths: [w0, w1, w2] } — widths: толщина линии там, где шарик каждой
//      ступени стартует (у самой ступени)
export function ladderWireSet(rects) {
  const links = ladderLinks(rects)
  const R = 12
  const trunk = orthPoints(links[2].pts, R)
  const fin = links[3] ? orthPoints(links[3].pts, R) : null
  const trunkLen = polyLen(trunk)
  const total = trunkLen + (fin ? polyLen(fin) : 0)
  const C = WIRE_COLORS
  const pieces = taper(trunk, { s0: 0, s1: trunkLen / total, c0: C.accent, c1: C.levels[2] })
  const dots = [{ x: links[2].pts[0][0], y: links[2].pts[0][1], r: 3.5, color: C.accent }]
  const widths = []
  links.slice(0, 3).forEach((l, i) => {
    const end = l.pts[l.pts.length - 1]
    const trunkX = l.pts[3][0]
    // Отвод начинается там, где ствол доходит до его скругления; «Усвоенные» — конец ствола
    const s = i === 2 ? trunkLen / total : lengthTo(trunk, trunkX, end[1] - R) / total
    if (i < 2) {
      const branch = orthPoints([[trunkX, end[1] - R], [trunkX, end[1]], end], R)
      pieces.push(...taper(branch, { s0: s, s1: s, c0: C.levels[2], c1: C.levels[i] }))
    }
    const w = f(W_MIN + (W_MAX - W_MIN) * s)
    widths.push(w)
    dots.push({ x: end[0], y: end[1], r: Math.max(3.5, w / 2 + 1.5), color: C.levels[i] })
  })
  if (fin) {
    pieces.push(...taper(fin, { s0: trunkLen / total, s1: 1, c0: C.levels[2], c1: C.perm }))
    const [a, z] = [links[3].pts[0], links[3].pts[links[3].pts.length - 1]]
    dots.push({ x: a[0], y: a[1], r: 3.5, color: C.levels[2] }, { x: z[0], y: z[1], r: W_MAX / 2 + 1.5, color: C.perm })
  }
  return { pieces, dots, widths }
}
