// Геометрия ленты «Таймлайна игры»: масштаб, видимое окно времени, слияние мелких отрезков, деления оси. Чистые функции — экран рисует только то, что попало в окно (длинная игра — тысячи событий,
// а в DOM одновременно сотни узлов): отрезки вне окна не рендерятся, а соседние отрезки уже MIN_PX при мелком масштабе сливаются в один блок «×N».
export const MAX_SCALE = 0.4     // px на мс (400 px на секунду) — крупнее не нужно
export const MIN_PX = 3          // отрезок уже — сливается с соседями
export const PAD_PX = 300        // запас окна по краям (прокрутка не показывает пустоту)
const STEPS = [200, 500, 1000, 2000, 5000, 10000, 15000, 30000, 60000, 120000, 300000, 600000]

/** Масштаб «всё прохождение» в ширину width px (не мельче, чем 1 px на 2 с) */
export const fitScale = (durMs, width) => Math.min(MAX_SCALE, Math.max(0.0005, (Math.max(200, width) - 8) / Math.max(1000, durMs)))
/** Следующий масштаб: dir +1 крупнее, −1 мельче; не мельче fit и не крупнее MAX_SCALE */
export const zoom = (scale, dir, fit) => Math.min(MAX_SCALE, Math.max(fit, scale * (dir > 0 ? 2 : 0.5)))
/** Окно времени (мс) по прокрутке: { from, to } с запасом */
export const windowOf = (scrollLeft, width, scale) => ({ from: Math.max(0, (scrollLeft - PAD_PX) / scale), to: (scrollLeft + width + PAD_PX) / scale })

/** Отрезки (по возрастанию t), попавшие в окно; узкие соседние слиты: → [{ t, end, item (один отрезок) | n (сколько слито), first }] */
export function visible(items, win, scale, minPx = MIN_PX, keep = null) { // keep(it) — отрезок не сливать никогда (долгая пауза видна при любом масштабе)
  const out = []
  let agg = null
  for (const it of items) {
    const end = it.end ?? it.t
    if (end < win.from) continue
    if (it.t > win.to) break
    const w = (end - it.t) * scale
    if (w >= minPx || keep?.(it)) { agg = null; out.push({ t: it.t, end, item: it }); continue }
    if (agg && (it.t - agg.end) * scale <= minPx) { agg.end = Math.max(agg.end, end); agg.n += 1; agg.item = null; continue }
    agg = { t: it.t, end, item: it, n: 1, first: it }; out.push(agg)
  }
  return out
}

/** Деления оси в окне: шаг — первый из STEPS, при котором между делениями ≥ minGap px. → { step, ticks: [мс] } */
export function axisTicks(win, scale, durMs, minGap = 64) {
  const step = STEPS.find(s => s * scale >= minGap) ?? STEPS[STEPS.length - 1]
  const ticks = []
  for (let t = Math.floor(win.from / step) * step; t <= Math.min(win.to, durMs); t += step) if (t >= 0) ticks.push(t)
  return { step, ticks }
}

/** Прокрутка, при которой момент t (мс) стоит на трети ширины окна */
export const scrollFor = (t, width, scale) => Math.max(0, t * scale - width / 3)
