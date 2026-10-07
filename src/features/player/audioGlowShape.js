// Раскладка свечения в нижних углах чата (AudioGlow.jsx) — чистая математика,
// отдельно от компонента (react-refresh не любит не-компонентные экспорты в
// .jsx).
//
// Одно «облако» прижато к нижнему левому углу (правое — его зеркальная копия).
// Контур задан в полярных координатах вокруг угла: r_i ∈ 0..1 по POINTS углам
// θ_i от 0° (вдоль низа внутрь) до 90° (вверх по боковой стороне), u = θ/90°.
// Точка контура: x = r·REACH_X·cosθ (доля ширины canvas), y = r·REACH_Y·sinθ
// (доля высоты canvas от низа) — квадрант эллипса, вытянутый ВВЕРХ: вылет
// вдоль стороны в разы больше захода по низу (REACH_Y·высота ≫ REACH_X·ширина).
//
// Частоты видны по месту: каждая из 4 полос (audioLevel.js) имеет свою форму
// S_k(u) — низкие 0–1: ядро у самого угла (толщина облака), средняя 2: вылет
// вверх вдоль стороны, высокая 3: верхушка вверх + мелкий заход в низ. Форма
// облака — мягкое объединение (p-норма) вкладов band_k^γ · S_k(u).
export const POINTS = 24
export const CANVAS_W = 48    // «пиксели» одного canvas; в CSS растянут до 68×150
export const CANVAS_H = 104
export const REACH_X = 0.86   // доля ширины canvas при r = 1 (≈ 58 css px из 68)
export const REACH_Y = 0.96   // доля высоты canvas при r = 1 (≈ 144 css px из 150)
export const CONTRAST = 1.6   // контраст полос: 1.4–1.8
const SOFT_P = 3              // жёсткость объединения вкладов полос
const FLOOR = 0.02            // тонкая «точка» у угла, пока контур не нулевой

// Формы полос в точке u: [низ, низ-середина, середина-верх, верх]
export function bandShapes(u, out = new Float32Array(4)) {
  out[0] = 0.40 + 0.22 * Math.pow(1 - u, 1.5)             // ядро в углу, чуть больше к низу
  out[1] = 0.34 + 0.28 * Math.sin(Math.PI * u)            // ядро по диагонали
  out[2] = 0.10 + 0.88 * Math.pow(u, 1.6)                 // вылет вверх вдоль стороны
  out[3] = 0.50 * Math.pow(1 - u, 3) + Math.pow(u, 4)     // верхушка + мелкий заход в низ
  return out
}

// Таблицы по углам — считаются один раз
const SHAPES = new Float32Array(POINTS * 4)
const COS = new Float32Array(POINTS)
const SIN = new Float32Array(POINTS)
for (let i = 0; i < POINTS; i++) {
  const u = i / (POINTS - 1)
  bandShapes(u, SHAPES.subarray(i * 4, i * 4 + 4))
  COS[i] = Math.cos(u * Math.PI / 2)
  SIN[i] = Math.sin(u * Math.PI / 2)
}

// Геометрия точки i при радиусе r: доли ширины / высоты canvas от угла
export const pointX = (r, i) => r * REACH_X * COS[i]
export const pointY = (r, i) => r * REACH_Y * SIN[i]

// bands — Float32Array(4) 0..1; t — секунды (лёгкое «дыхание»);
// out — Float32Array(POINTS), радиусы 0..1 по углам от 0° до 90°
export function glowContour(bands, t, out = new Float32Array(POINTS)) {
  const b0 = Math.pow(bands[0], CONTRAST), b1 = Math.pow(bands[1], CONTRAST)
  const b2 = Math.pow(bands[2], CONTRAST), b3 = Math.pow(bands[3], CONTRAST)
  for (let i = 0; i < POINTS; i++) {
    const o = i * 4
    const acc = Math.pow(b0 * SHAPES[o], SOFT_P) + Math.pow(b1 * SHAPES[o + 1], SOFT_P)
              + Math.pow(b2 * SHAPES[o + 2], SOFT_P) + Math.pow(b3 * SHAPES[o + 3], SOFT_P)
    const breathe = 0.95 + 0.05 * Math.sin(t * 2.3 + i * 0.43)
    const r = Math.pow(acc, 1 / SOFT_P) * breathe
    out[i] = r > 1 ? 1 : r < FLOOR ? FLOOR : r
  }
  return out
}

// Верхняя точка контура — доля высоты canvas от низа (для градиента прозрачности)
export function contourPeak(c) {
  let m = 0
  for (let i = 0; i < POINTS; i++) { const y = pointY(c[i], i); if (y > m) m = y }
  return m
}

// Наибольший сдвиг контура (для порога перерисовки)
export function contourDelta(a, b) {
  let m = 0
  for (let i = 0; i < a.length; i++) { const dlt = Math.abs(a[i] - b[i]); if (dlt > m) m = dlt }
  return m
}
