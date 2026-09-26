// Линии «Моей памяти» — как связи на схеме модуля: ортогональные, со
// скруглёнными углами, точки на концах, цвет «откуда → куда» градиентом.
// Ствол: от низа шапки «Сегодня» вниз, влево к краю экрана и отводами в
// левый бок каждой ступени; от низа «Родных» — в верх пятиугольника
// постоянной памяти. Шарики — слова сегодняшнего повторения: бегут по
// связи обратно, из ступени к кнопке «Повторить».
// Чистые функции: прямоугольники меряет MemoryLadderWires.jsx.

export const WIRE_COLORS = { accent: '#b6fe3b', levels: ['#8a939e', '#e2cd78', '#b6fe3b'], perm: '#8b5cf6' }

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
