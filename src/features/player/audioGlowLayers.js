// Слои заливки каймы (AudioGlow.jsx): LAYER_COUNT копий одного контура с
// толщиной, уменьшенной в scale раз (1 … 1/LAYER_COUNT), и малой альфой каждая.
// Накопление source-over даёт спад прозрачности ПО НОРМАЛИ от кромки внутрь:
// у кромки экрана накопленная альфа ≈ ALPHA_EDGE (0.90), у внутренней границы
// самого толстого слоя ≈ ALPHA_INNER (0.05) — у любой толщины каймы, т.к.
// глубина слоя считается от локальной толщины. Без градиентов и швов.
export const LAYER_COUNT = 8
export const ALPHA_EDGE = 0.90
export const ALPHA_INNER = 0.05
const EDGE_RGB = [167, 139, 250]    // #a78bfa у кромки
const INNER_RGB = [139, 92, 246]    // #8b5cf6 внутри
const FALLOFF = 1.4

// Целевая накопленная альфа слоя n (n=0 — самый толстый, внешний)
const target = n => ALPHA_INNER + (ALPHA_EDGE - ALPHA_INNER) * Math.pow(n / (LAYER_COUNT - 1), FALLOFF)

export const LAYERS = Array.from({ length: LAYER_COUNT }, (_, n) => {
  const prevKeep = n === 0 ? 1 : 1 - target(n - 1)
  const alpha = 1 - (1 - target(n)) / prevKeep
  const f = 1 - n / (LAYER_COUNT - 1)   // глубина: 1 — внутренняя граница, 0 — кромка
  const c = EDGE_RGB.map((v, k) => Math.round(v + (INNER_RGB[k] - v) * f))
  return { scale: 1 - n / LAYER_COUNT, color: `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${alpha.toFixed(4)})`, alpha }
})

// Накопленная альфа на глубине depth (0 — кромка … 1 — внутренняя граница
// самого толстого слоя) — для тестов и сверки с макетом
export function accumulatedAlpha(depth) {
  let keep = 1
  for (const l of LAYERS) if (l.scale > depth) keep *= 1 - l.alpha
  return 1 - keep
}
