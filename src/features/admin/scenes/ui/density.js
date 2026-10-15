// Плотность панели по её ширине: compact (узкая колонка — компактные отступы, одна
// колонка полей), normal, roomy (просторно, несколько колонок). Чистая функция;
// Panel.jsx измеряет ширину ResizeObserver'ом (useDensity.js) и ставит data-density
// только при смене класса — CSS читает переменные --gap/--pad/--row по атрибуту.

export const DENSITY_COMPACT_MAX = 360 // ширина < 360px → compact
export const DENSITY_NORMAL_MAX = 640 // 360…639 → normal, ≥ 640 → roomy

export function densityFor(width) {
  const w = Number(width)
  if (!Number.isFinite(w) || w <= 0) return 'normal' // не измерено (SSR, display:none)
  if (w < DENSITY_COMPACT_MAX) return 'compact'
  if (w < DENSITY_NORMAL_MAX) return 'normal'
  return 'roomy'
}

export const DENSITIES = ['compact', 'normal', 'roomy']
