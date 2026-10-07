// Весь рисунок связей «Моей памяти» по прямоугольникам (ladderLinks): отрезки с
// плавной толщиной и цветом, трубы-раздувы и бутоны у элементов, толщина у старта
// шарика каждой ступени и точка обрыва для режима сна. Чистая функция, рисует
// MemoryLadderWires.jsx.
import {
  ladderLinks, fullPts, orthPoints, polyLen, lengthTo, insertOn, dist, taper, flarePath, bulbR, mixColor, widthAt,
  WIRE_COLORS, TEMP_COLOR, W_MIN, W_MAX, FLARE_L,
} from './ladderWires.js'

const R = 12 // радиус скругления углов

// Ствол (шапка → круг → ствол → «Усвоенные»), отводы в «Новые» и «Знакомые»
// (толщина — как у ствола в точке отвода, цвет — от цвета ствола в этой точке к цвету ступени), связь
// «Усвоенные» → пятиугольник (до W_MAX), трубы и точки на концах. Внутри круга
// (между его левым и правым краем на горизонтали центра) отрезков нет: круг —
// непрозрачный блок, а длина сквозь него в толщине учтена. Цвет ствола: шапка (accent) → у входа в круг
// TEMP_COLOR (временная память); от выхода из круга TEMP_COLOR → золотистый «Усвоенных» — в круге линия
// меняет цвет, бутоны входа и выхода — цвета временной памяти.
// → { pieces: [{ x1, y1, x2, y2, w, color }], dots: [{ x, y, r, color }],
//      flares: [{ d, color }] (трубы у элементов), widths: [w0, w1, w2] — толщина там, где шарик каждой ступени
//      стартует (у самой ступени), tearAt: { x, y } — выход из круга слева (от него отсчитывается разрыв сна) }
export function ladderWireSet(rects) {
  const links = ladderLinks(rects)
  const [head, ...rest] = links
  const branches = rest.slice(0, 3)
  const finLink = rest[3]
  const { circle } = rects
  const cy = (circle.t + circle.b) / 2
  const gateR = [circle.r, cy], gateL = [circle.l, cy]
  // Полный путь до «Усвоенных» с точками краёв круга — отрезки режутся ровно по ним
  const trunk = insertOn(insertOn(orthPoints(fullPts(head, branches[2]), R), gateR), gateL)
  const fin = finLink ? orthPoints(finLink.pts, R) : null
  const trunkLen = polyLen(trunk)
  const total = trunkLen + (fin ? polyLen(fin) : 0)
  const C = WIRE_COLORS
  const inCircle = p => Math.abs(p.y1 - cy) < 0.5 && Math.abs(p.y2 - cy) < 0.5 && (p.x1 + p.x2) / 2 > circle.l && (p.x1 + p.x2) / 2 < circle.r
  // Цвет ствола по длине от шапки: до входа в круг accent → TEMP_COLOR, после выхода TEMP_COLOR → золотистый
  const [lenR, lenL] = [lengthTo(trunk, gateR), lengthTo(trunk, gateL)]
  const colorAt = len => (len <= lenR ? mixColor(C.accent, TEMP_COLOR, len / (lenR || 1))
    : len >= lenL ? mixColor(TEMP_COLOR, C.levels[2], (len - lenL) / ((trunkLen - lenL) || 1)) : TEMP_COLOR)
  const pieces = taper(trunk, { s0: 0, s1: trunkLen / total, colorAt }).filter(p => !inCircle(p))
  const flares = []
  // Конец связи у элемента: труба (если прямого участка хватает) → радиус бутона
  const grow = (pts, atEnd, w, color) => {
    const n = pts.length
    const [A, C1, O] = atEnd ? [pts[n - 1], pts[n - 2], pts[n - 3]] : [pts[0], pts[1], pts[2]]
    const seg = dist(A, C1)
    const L = Math.min(FLARE_L, seg - Math.min(R, seg / 2, dist(C1, O) / 2))
    const H = bulbR(w)
    if (L >= 5) flares.push({ d: flarePath(A, [(A[0] - C1[0]) / seg, (A[1] - C1[1]) / seg], w, L, H), color })
    return H
  }
  // Толщина и цвет ствола в точке P
  const at = P => {
    const len = lengthTo(trunk, P)
    return { w: widthAt(len / total), color: colorAt(len) }
  }
  const dots = [{ x: head.pts[0][0], y: head.pts[0][1], r: grow(head.pts, false, W_MIN, C.accent), color: C.accent }]
  // Вход в круг справа и выход слева — трубы смотрят в круг, толщина по длине пути
  const [inR, outL] = [at(gateR), at(gateL)]
  dots.push({ x: gateR[0], y: gateR[1], r: grow(head.pts, true, inR.w, inR.color), color: inR.color })
  dots.push({ x: gateL[0], y: gateL[1], r: grow(branches[2].pts, false, outL.w, outL.color), color: outL.color })
  const widths = []
  branches.forEach((l, i) => {
    const end = l.pts[l.pts.length - 1]
    const trunkX = l.pts[1][0]
    // Отвод начинается там, где ствол доходит до его скругления; «Усвоенные» — конец ствола
    const s = i === 2 ? trunkLen / total : lengthTo(trunk, [trunkX, end[1] - R]) / total
    if (i < 2) {
      const branch = orthPoints([[trunkX, end[1] - R], [trunkX, end[1]], end], R)
      pieces.push(...taper(branch, { s0: s, s1: s, c0: at([trunkX, end[1] - R]).color, c1: C.levels[i] }))
    }
    const w = widthAt(s)
    widths.push(w)
    dots.push({ x: end[0], y: end[1], r: grow(l.pts, true, w, C.levels[i]), color: C.levels[i] })
  })
  if (fin) {
    pieces.push(...taper(fin, { s0: trunkLen / total, s1: 1, c0: C.levels[2], c1: C.perm }))
    const [a, z] = [finLink.pts[0], finLink.pts[finLink.pts.length - 1]]
    const wFin = widthAt(trunkLen / total)
    dots.push({ x: a[0], y: a[1], r: grow(finLink.pts, false, wFin, C.levels[2]), color: C.levels[2] },
      { x: z[0], y: z[1], r: grow(finLink.pts, true, W_MAX, C.perm), color: C.perm })
  }
  return { pieces, dots, flares, widths, tearAt: { x: gateL[0], y: gateL[1] } }
}
