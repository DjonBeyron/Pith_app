// Раскладка свечения в нижних углах чата (AudioGlow.jsx) — чистая математика,
// отдельно от компонента (react-refresh не любит не-компонентные экспорты в .jsx).
//
// Свечение — тонкая КАЙМА по краю экрана (серп / crescent), которая идёт по
// СКРУГЛЕНИЮ угла телефона и продолжается прямыми участками вверх по боковой
// кромке и внутрь вдоль нижней. Левый угол; правый — зеркальная копия.
// Координаты в css px, начало — нижний левый угол экрана, y вверх.
//
// Внешняя граница — кромка экрана: от верха боковой полосы (x=0,
// y=SIDE_TOP) вниз до (0, R), дуга скругления радиуса R = SCREEN_CORNER_R с
// центром (R, R) до (R, 0), дальше по низу до x = BOTTOM_REACH (дуга задаёт точки и нормали
// внутренней границы; ЗАЛИВАЕТСЯ кайма до прямого угла, см. ARC_FIRST). Внутренняя
// граница смещена внутрь на толщину t_i в каждой из POINTS точек вдоль этого
// пути (нормаль внутрь): толщина сходит на нет к обоим концам.
//
// Толщина точки: t_i = BASE_i + (FULL_i − BASE_i)·g_i, где
//  • BASE_i — базовая заполненная форма (тихий звук): вся дуга скругления
//    толщиной T_BASE + BASE_LEN прямых участков в обе стороны, плавно на нет;
//  • FULL_i — максимум (громко): до T_MAX у угла, сходит на нет к SIDE_TOP по
//    боковой стороне и к BOTTOM_REACH по низу;
//  • g_i ∈ 0..1 — рост от полос спектра: низкие 0–1 — толщина у самого угла,
//    средняя 2 — вылет вверх по боковой стороне, высокая 3 — верхушка боковой
//    полосы и заход по низу; мягкое объединение (p-норма) band_k^γ · S_k(точка).
// Базовая форма — пол: на тихом звуке «уголок» всегда заполнен, без «лучиков».
export const SCREEN_CORNER_R = 44   // радиус скругления экрана, css px
export const CSS_W = 96             // размер слоя одного угла в css; canvas — в SCALE раз меньше
export const CSS_H = 150
export const SCALE = 0.5
export const CANVAS_W = CSS_W * SCALE
export const CANVAS_H = CSS_H * SCALE
export const SIDE_TOP = 143         // верх боковой полосы при максимуме (от низа экрана)
export const BOTTOM_REACH = 92      // заход по низу при максимуме (от бокового края)
export const T_MAX = 38             // наибольшая толщина каймы у угла, css px
export const T_BASE = 8             // толщина базовой дуги (тихий звук)
export const BASE_LEN = 30          // прямые участки базовой формы за дугой
export const CONTRAST = 1.6         // контраст полос: 1.4–1.8
const SOFT_P = 3                    // жёсткость объединения вкладов полос
const R = SCREEN_CORNER_R
const SIDE_LEN = SIDE_TOP - R
const BOTTOM_LEN = BOTTOM_REACH - R
const NS = 10, NA = 8, NB = 7       // точек: боковая прямая, дуга (+1), нижняя прямая
export const POINTS = NS + (NA + 1) + NB
// Индексы точек дуги скругления в пути: [ARC_FIRST … ARC_LAST]. Внешняя граница каймы при отрисовке идёт НЕ по дуге,
// а по прямому углу экрана (боковая кромка → угол → нижняя кромка): у большинства Android углы вьюпорта прямые, и
// клин между дугой и углом читался как чёрное «скругление»; на телефонах со скруглённым дисплеем угол срезает сам экран
export const ARC_FIRST = NS
export const ARC_LAST = NS + NA

// Точки пути (css px), нормаль внутрь, максимум и база толщины, формы полос S_k
export const OX = new Float32Array(POINTS)
export const OY = new Float32Array(POINTS)
export const NX = new Float32Array(POINTS)
export const NY = new Float32Array(POINTS)
const FULL = new Float32Array(POINTS)
const BASE = new Float32Array(POINTS)
const SHAPES = new Float32Array(POINTS * 4)

const taper = x => (x >= 1 ? 0 : 0.5 * (1 + Math.cos(Math.PI * x)))   // 1 → 0, гладко

// Формы полос в точке: zone 0 — боковая прямая (w = q 0..1 вверх от дуги),
// 1 — дуга (w = 0 у боковой стороны … 1 у низа), 2 — нижняя прямая (w = p 0..1 внутрь)
export function bandShapes(zone, w, out = new Float32Array(4)) {
  if (zone === 0) {
    out[0] = Math.pow(1 - w, 2.5)
    out[1] = 0.55 * Math.pow(1 - w, 2)
    out[2] = 0.10 + 0.88 * Math.pow(w, 1.6)
    out[3] = Math.pow(w, 4)
  } else if (zone === 1) {
    out[0] = 1
    out[1] = 0.55 + 0.45 * Math.sin(Math.PI * w)
    out[2] = 0.35
    out[3] = 0.15
  } else {
    out[0] = Math.pow(1 - w, 2.5)
    out[1] = 0.55 * Math.pow(1 - w, 2)
    out[2] = 0.10
    out[3] = 0.20 + 0.80 * Math.pow(w, 1.5)
  }
  return out
}

;(function build() {
  let i = 0
  for (let j = NS; j >= 1; j--, i++) {           // боковая прямая: сверху вниз к дуге
    const q = Math.pow(j / NS, 1.3)
    OX[i] = 0; OY[i] = R + q * SIDE_LEN; NX[i] = 1; NY[i] = 0
    FULL[i] = T_MAX * Math.pow(1 - q, 1.3)
    BASE[i] = T_BASE * taper(q * SIDE_LEN / BASE_LEN)
    bandShapes(0, q, SHAPES.subarray(i * 4, i * 4 + 4))
  }
  for (let k = 0; k <= NA; k++, i++) {           // дуга скругления: от бока к низу
    const phi = (k / NA) * Math.PI / 2
    OX[i] = R - R * Math.cos(phi); OY[i] = R - R * Math.sin(phi)
    NX[i] = Math.cos(phi); NY[i] = Math.sin(phi)
    FULL[i] = T_MAX
    BASE[i] = T_BASE
    bandShapes(1, k / NA, SHAPES.subarray(i * 4, i * 4 + 4))
  }
  for (let j = 1; j <= NB; j++, i++) {           // нижняя прямая: от дуги внутрь
    const p = Math.pow(j / NB, 1.3)
    OX[i] = R + p * BOTTOM_LEN; OY[i] = 0; NX[i] = 0; NY[i] = 1
    FULL[i] = T_MAX * Math.pow(1 - p, 1.3)
    BASE[i] = T_BASE * taper(p * BOTTOM_LEN / BASE_LEN)
    bandShapes(2, p, SHAPES.subarray(i * 4, i * 4 + 4))
  }
})()

// bands — Float32Array(4) 0..1; t — секунды (лёгкое «дыхание»);
// out — Float32Array(POINTS): толщина каймы в долях T_MAX (0..1) по точкам пути
export function glowContour(bands, t, out = new Float32Array(POINTS)) {
  const b0 = Math.pow(bands[0], CONTRAST), b1 = Math.pow(bands[1], CONTRAST)
  const b2 = Math.pow(bands[2], CONTRAST), b3 = Math.pow(bands[3], CONTRAST)
  for (let i = 0; i < POINTS; i++) {
    const o = i * 4
    const acc = Math.pow(b0 * SHAPES[o], SOFT_P) + Math.pow(b1 * SHAPES[o + 1], SOFT_P)
              + Math.pow(b2 * SHAPES[o + 2], SOFT_P) + Math.pow(b3 * SHAPES[o + 3], SOFT_P)
    const breathe = 0.95 + 0.05 * Math.sin(t * 2.3 + i * 0.43)
    const g = Math.min(1, Math.pow(acc, 1 / SOFT_P) * breathe)
    out[i] = (BASE[i] + (FULL[i] - BASE[i]) * g) / T_MAX
  }
  return out
}

// Внутренняя точка каймы i (css px) при толщине c[i]·scale·T_MAX
export const innerX = (c, i, scale = 1) => OX[i] + NX[i] * c[i] * scale * T_MAX
export const innerY = (c, i, scale = 1) => OY[i] + NY[i] * c[i] * scale * T_MAX

// Вылет каймы: вверх по боковой стороне (от низа экрана) и внутрь по низу
// (от бокового края), css px — до последней точки толщиной ≥ minT px
export function contourReach(c, minT = 1) {
  let up = 0, inward = 0
  for (let i = 0; i < POINTS; i++) {
    if (c[i] * T_MAX < minT) continue
    if (OY[i] > up) up = OY[i]
    if (OX[i] > inward) inward = OX[i]
  }
  return { up, inward }
}

// Наибольший сдвиг контура (для порога перерисовки)
export function contourDelta(a, b) {
  let m = 0
  for (let i = 0; i < a.length; i++) { const dlt = Math.abs(a[i] - b[i]); if (dlt > m) m = dlt }
  return m
}
