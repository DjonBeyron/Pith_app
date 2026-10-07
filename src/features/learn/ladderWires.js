// Линии «Моей памяти» — как связи на схеме модуля: ортогональные, со
// скруглёнными углами, точки на концах, цвет «откуда → куда» градиентом.
// Путь: из правой части низа шапки «Сегодня» вниз до уровня центра круга-счётчика,
// налево — в круг с его правой стороны; из левой стороны круга — налево к стволу у
// края экрана, вниз и отводами в левый бок каждой ступени; от низа «Усвоенных» — в
// верх пятиугольника постоянной памяти. Внутри круга линия не рисуется (круг —
// непрозрачный блок), но длина пути считается сквозь него: толщина и цвет растут
// по одной функции от шапки до пятиугольника, без скачка на круге.
// Шарики — слова сегодняшнего повторения: бегут по связи обратно, из ступени
// через круг к кнопке «Повторить».
// Чистые функции: прямоугольники меряет MemoryLadderWires.jsx.

// Цвета ступеней — идентичность уровня: Новые — салатовый, Знакомые — небесный, Усвоенные — золотистый,
// Постоянная — фиолетовый (в CSS те же — --lvl1/--lvl2/--lvl3/--lvlP в memory-ladder.css). accent — цвет шапки /
// кнопки «Повторить» (акцент приложения, совпадает с первой ступенью по оттенку, но это не уровень)
export const WIRE_COLORS = { accent: '#b6fe3b', levels: ['#b6fe3b', '#4fb3ee', '#f1bd3c'], perm: '#8b5cf6' }
// Временная память (круг-счётчик): нейтральный серебристо-белый — не спорит ни с цветами ступеней, ни с
// фиолетовой постоянной. В CSS — --temp / --temp-rgb (memory-ladder.css). Связь шапка → круг приходит к этому
// цвету, от круга к стволу уходит от него к цветам ступеней: в круге линия «меняет цвет»
export const TEMP_COLOR = '#dbe6f5'

// Толщина связи растёт плавно по всему пути: от шапки «Повторить» (W_MIN) до
// пятиугольника «Закреплённые слова» (W_MAX) — слово крепнет по дороге вниз
export const W_MIN = 1.25
export const W_MAX = 4.5
export const widthAt = s => f(W_MIN + (W_MAX - W_MIN) * s) // s — доля всего пути (0 — шапка, 1 — пятиугольник)

// Шарик слова к повтору: светлое ядро (BALL_D px) + мягкий ореол (HALO_D px),
// оба во вложенных элементах .memBallDot / .memBallGlow (memory-ladder.css).
// Ядро стартует у ступени размером BALL_GROW (115%) толщины линии, ореол — в
// HALO_GROW раз толще линии (иначе шарик одного цвета с тонкой линией не
// виден); оба сжимаются вместе с линией по дороге к шапке. Масштаб — в тех же
// ключевых кадрах и с той же кривой, что движение по пути (CSS, без JS на кадр)
export const BALL_D = 8
export const BALL_GROW = 1.15
export const HALO_D = 16
export const HALO_GROW = 7
const r3 = x => Math.round(x * 1000) / 1000
export const ballScale = w => r3(BALL_GROW * w / BALL_D)
export const haloScale = w => r3(HALO_GROW * w / HALO_D)

// «Нейрон»: у самого элемента линия плавно раздувается «трубой» (FLARE_L px) и
// кончается кружком-бутоном — шире линии на BULB px с каждой стороны. Так связь
// не просто упирается в блок, а прорастает в него, как отросток нервной клетки
export const FLARE_L = 24
export const BULB = 4.5
const r1 = x => Math.round(x * 10) / 10
export const bulbR = w => r1(w / 2 + BULB)

// Прямой участок перед входом в элемент: раздув (FLARE_L) + скругление угла
export const ENTRY_LEG = FLARE_L + 12

// Ствол — на этом расстоянии от левого края экрана (не зависит от сдвига ступеней)
export const TRUNK_INSET = 11

// Выход из шапки — на этом расстоянии от её правого края (правее круга не меньше ENTRY_LEG)
export const HERO_OUT = 36

// Верх контура пятиугольника — доля высоты его коробки (MemoryPermNode.jsx: фигура заполняет коробку, верх — у самого края)
export const FIN_TOP = 0

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

// Прямоугольники { l, t, r, b } — в координатах слоя линий: hero — шапка, circle —
// круг-счётчик (под шапкой, по центру), blocks — ступени, fin — пятиугольник. edge —
// левый край экрана в тех же координатах (слой правее края — отрицательный):
// ствол идёт вдоль края экрана на расстоянии TRUNK_INSET.
// → [{ pts, from, to }]: [0] шапка → круг (вход справа), [1..3] круг (выход слева) →
// ствол → ступени, [4] «Усвоенные» → пятиугольник
export function ladderLinks({ hero, circle, blocks, fin, edge = 0 }) {
  const trunkX = edge + TRUNK_INSET
  const cy = midY(circle)
  // Выход из шапки — правее круга хотя бы на ENTRY_LEG (раздув + скругление); тесно — зажимаем
  const xOut = Math.max(circle.r + ENTRY_LEG, Math.min(hero.r - HERO_OUT, hero.r - 12))
  const C = WIRE_COLORS
  const links = [{ pts: [[xOut, hero.b], [xOut, cy], [circle.r, cy]], from: C.accent, to: C.accent }]
  blocks.forEach((b, i) => links.push({
    pts: [[circle.l, cy], [trunkX, cy], [trunkX, midY(b)], [b.l, midY(b)]],
    from: C.accent, to: C.levels[i],
  }))
  if (fin) {
    const b3 = blocks[2]
    const top = [midX(fin), fin.t + (fin.b - fin.t) * FIN_TOP]
    // Вход в пятиугольник — с тем же раздувом, что у ступеней: последний прямой
    // участок ENTRY_LEG (раздув + скругление); зазор мал — горизонталь посередине
    const gap = top[1] - b3.b
    const y = gap >= 50 ? top[1] - ENTRY_LEG : b3.b + gap / 2
    links.push({ pts: [[midX(b3), b3.b], [midX(b3), y], [top[0], y], top], from: C.levels[2], to: C.perm })
  }
  return links
}

// Полный путь шапка → ступень одной ломаной: точки входа/выхода круга лежат на
// одной горизонтали с соседями, поэтому выпадают (иначе скругление на прямой)
export const fullPts = (head, link) => [...head.pts.slice(0, -1), ...link.pts.slice(1)]

// Труба раздува: P — точка на элементе, dir — единичный вектор К элементу, w —
// толщина линии у начала трубы, L — её длина, H — радиус бутона у элемента
// (сужается по параболе: раздув нарастает к элементу). → path заливки
export function flarePath(P, dir, w, L, H, n = 10) {
  const nrm = [-dir[1], dir[0]]
  const left = [], right = []
  for (let k = 0; k <= n; k++) {
    const t = k / n
    const c = [P[0] - dir[0] * L * (1 - t), P[1] - dir[1] * L * (1 - t)]
    const h = w / 2 + (H - w / 2) * t * t
    left.push([c[0] + nrm[0] * h, c[1] + nrm[1] * h])
    right.push([c[0] - nrm[0] * h, c[1] - nrm[1] * h])
  }
  return 'M ' + [...left, ...right.reverse()].map(p => `${f(p[0])} ${f(p[1])}`).join(' L ') + ' Z'
}

// Путь шарика — та же связь задом наперёд: из ступени через круг к шапке
export const ballPath = (head, link) => orth(fullPts(head, link).reverse())

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

export const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1])
export const polyLen = poly => poly.slice(1).reduce((n, p, i) => n + dist(poly[i], p), 0)

// Точка P лежит на отрезке a–b (с допуском)
function onSeg(a, b, P) {
  const L2 = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2 || 1
  const t = Math.max(0, Math.min(1, ((P[0] - a[0]) * (b[0] - a[0]) + (P[1] - a[1]) * (b[1] - a[1])) / L2))
  return dist(P, [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]) < 0.05
}

// Длина полилинии от начала до точки P на ней (P не на ломаной — вся длина)
export function lengthTo(poly, P) {
  let acc = 0
  for (let i = 1; i < poly.length; i++) {
    if (onSeg(poly[i - 1], poly[i], P)) return acc + dist(poly[i - 1], P)
    acc += dist(poly[i - 1], poly[i])
  }
  return acc
}

// Вставить точку P в ломаную на тот отрезок, где она лежит (отрезки потом режутся
// ровно по ней — края круга совпадают с концами отрезков)
export function insertOn(poly, P) {
  for (let i = 1; i < poly.length; i++) {
    if (onSeg(poly[i - 1], poly[i], P)) return [...poly.slice(0, i), P, ...poly.slice(i)]
  }
  return poly
}

// Цвет → [r, g, b]: «#rrggbb» или «rgb(r, g, b)» — mixColor сам возвращает rgb(), и этот результат
// подмешивается дальше (отвод от цвета ствола в точке отвода); раньше rgb() давал NaN, stroke «rgb(NaN…)» не
// рисовался, и отводы к «Новым» и «Знакомым» пропадали
const hex = c => (c.startsWith('rgb') ? c.match(/[\d.]+/g).slice(0, 3).map(Number) : [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)))
export function mixColor(a, b, t) {
  const [x, y] = [hex(a), hex(b)]
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(', ')})`
}

// Полилиния → короткие отрезки (не длиннее maxLen) с толщиной и цветом,
// плавно меняющимися по длине: s0 → s1 — доля всего пути (толщина), c0 → c1 — цвет;
// colorAt(len) — вместо c0/c1 цвет по длине от начала ломаной (ствол с «переключением» цвета в круге)
export function taper(poly, { s0, s1, c0, c1, colorAt, maxLen = 8 }) {
  const total = polyLen(poly) || 1
  const pieces = []
  let acc = 0
  for (let i = 1; i < poly.length; i++) {
    const a = poly[i - 1], b = poly[i], L = dist(a, b)
    const n = Math.max(1, Math.ceil(L / maxLen))
    for (let k = 0; k < n; k++) {
      const at = t => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
      const [p, q] = [at(k / n), at((k + 1) / n)]
      const len = acc + L * (k + 0.5) / n
      const t = len / total
      const color = colorAt ? colorAt(len) : mixColor(c0, c1, t)
      pieces.push({ x1: f(p[0]), y1: f(p[1]), x2: f(q[0]), y2: f(q[1]), w: widthAt(s0 + (s1 - s0) * t), color })
    }
    acc += L
  }
  return pieces
}
