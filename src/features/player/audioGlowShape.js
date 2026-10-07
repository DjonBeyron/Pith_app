// Раскладка свечения снизу чата (AudioGlow.jsx) — чистая математика, отдельно
// от компонента (react-refresh не любит не-компонентные экспорты в .jsx).
//
// Контур h(x) по POINTS точкам, x ∈ [0,1], d = |x − 0.5|·2 (0 — центр, 1 —
// край/угол). Свет «торчит» у левого и правого нижних углов, в центре ниже:
// profile(d) — высота 1 на углах, PROFILE_MIN в центре. Частоты видны по
// месту: низкие полосы (0–1) тянутся к углам (вес растёт с d), средние и
// верхние (2–3) — к центру (вес растёт с 1−d); h = profile · Σ band_k^γ · w_k
// / Σ w_k. Полосы — из audioLevel.js (настоящий спектр или синтез).
export const POINTS = 32
export const PROFILE_MIN = 0.38
export const CONTRAST = 1.6   // контраст полос после нормировки: 1.4–1.8

export function profile(d) {
  return PROFILE_MIN + (1 - PROFILE_MIN) * Math.pow(d, 1.6)
}

// Веса полос в точке d: [низ, низ-середина, середина-верх, верх]
export function bandWeights(d, out = new Float32Array(4)) {
  out[0] = Math.pow(d, 1.6)
  out[1] = 0.25 + 0.75 * d
  out[2] = 1 - d
  out[3] = Math.pow(1 - d, 1.6)
  return out
}

const FLOOR = 0.03   // тонкая кромка, пока звук не совсем стих (0 — пусто)
const w = new Float32Array(4)

// bands — Float32Array(4) 0..1; t — секунды (лёгкое «дыхание» по длине);
// out — Float32Array(POINTS), высоты 0..1 от нижней кромки
export function glowContour(bands, t, out = new Float32Array(POINTS)) {
  const b0 = Math.pow(bands[0], CONTRAST), b1 = Math.pow(bands[1], CONTRAST)
  const b2 = Math.pow(bands[2], CONTRAST), b3 = Math.pow(bands[3], CONTRAST)
  for (let i = 0; i < POINTS; i++) {
    const x = i / (POINTS - 1)
    const d = Math.abs(x - 0.5) * 2
    bandWeights(d, w)
    const mix = (b0 * w[0] + b1 * w[1] + b2 * w[2] + b3 * w[3]) / (w[0] + w[1] + w[2] + w[3])
    const breathe = 0.92 + 0.08 * Math.sin(t * 2.3 + x * 9.4)
    const h = profile(d) * mix * breathe
    out[i] = h > 1 ? 1 : h < FLOOR ? FLOOR : h
  }
  return out
}

// Наибольший сдвиг контура (для порога перерисовки)
export function contourDelta(a, b) {
  let m = 0
  for (let i = 0; i < a.length; i++) { const dlt = Math.abs(a[i] - b[i]); if (dlt > m) m = dlt }
  return m
}
