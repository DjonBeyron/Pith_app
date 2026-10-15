// Чистая математика ресайза трёх колонок сборщика (настройки / предпросмотр / панель).
// Размеры хранятся долями от ширины окна (сумма 1) — так они переживают смену размера
// окна; при перетаскивании считаем в пикселях от стартовых ширин и переводим обратно.
// Колонка не может исчезнуть: минимум MIN_COL px (если окно шире 3 × MIN_COL; иначе —
// пропорционально). UI — useColumnWidths.js / ColumnResizer.jsx, тест — columnResize.test.js.

export const MIN_COL = 240
export const DEFAULT_FRACTIONS = [0.37, 0.3, 0.33]
export const KEY_STEP = 24 // px за одно нажатие стрелки на разделителе

const sum = arr => arr.reduce((a, b) => a + b, 0)

export function validFractions(v) {
  return Array.isArray(v) && v.length === 3 && v.every(x => Number.isFinite(x) && x > 0) && Math.abs(sum(v) - 1) < 0.01
}

export function normalize(fr) {
  if (!validFractions(fr)) return [...DEFAULT_FRACTIONS]
  const s = sum(fr)
  return fr.map(x => x / s)
}

export const toPx = (fr, total) => normalize(fr).map(x => x * total)
export const toFractions = px => { const s = sum(px); return s > 0 ? px.map(x => x / s) : [...DEFAULT_FRACTIONS] }

// Подтянуть узкие колонки к минимуму за счёт широких, сумма не меняется. Если места
// на три минимума нет — делим пропорционально (min уменьшается до total / 3)
export function clampPx(px, total, min = MIN_COL) {
  const n = px.length
  const m = Math.min(min, total / n)
  let out = toFractions(px).map(x => x * total)
  for (let pass = 0; pass < n; pass++) {
    const low = out.map((w, i) => (w < m - 0.001 ? i : -1)).filter(i => i >= 0)
    if (!low.length) break
    const deficit = sum(low.map(i => m - out[i]))
    const donors = out.map((w, i) => (low.includes(i) ? 0 : Math.max(0, w - m)))
    const spare = sum(donors)
    out = out.map((w, i) => (low.includes(i) ? m : spare > 0 ? w - deficit * (donors[i] / spare) : w))
  }
  return out
}

// Перетаскивание разделителя i (между колонками i и i+1) на dx пикселей от стартовых ширин
export function dragWidths(startPx, i, dx, min = MIN_COL) {
  if (i < 0 || i >= startPx.length - 1) return [...startPx]
  const total = sum(startPx)
  const m = Math.min(min, total / startPx.length)
  const lo = m - startPx[i]
  const hi = startPx[i + 1] - m
  const d = Math.max(lo, Math.min(hi, dx))
  const out = [...startPx]
  out[i] += d
  out[i + 1] -= d
  return out
}

// Пересчёт долей под новую ширину окна (минимумы соблюдены, сумма 1)
export function fitFractions(fr, total, min = MIN_COL) {
  if (!(total > 0)) return normalize(fr)
  return toFractions(clampPx(toPx(fr, total), total, min))
}

export const resetFractions = () => [...DEFAULT_FRACTIONS]

// Для role="separator": положение разделителя в процентах пары соседних колонок
export function ariaFor(px, i, min = MIN_COL) {
  const pair = (px[i] ?? 0) + (px[i + 1] ?? 0)
  if (pair <= 0) return { now: 50, min: 0, max: 100 }
  const m = Math.min(min, pair / 2)
  return {
    now: Math.round((100 * px[i]) / pair),
    min: Math.round((100 * m) / pair),
    max: Math.round(100 - (100 * m) / pair),
  }
}

// CSS-переменные для grid: доли в fr (× 1000, чтобы не было дробных fr < 1)
export function cssVars(fr) {
  const f = normalize(fr)
  return { '--scb-c1': `${Math.round(f[0] * 1000)}fr`, '--scb-c2': `${Math.round(f[1] * 1000)}fr`, '--scb-c3': `${Math.round(f[2] * 1000)}fr` }
}
