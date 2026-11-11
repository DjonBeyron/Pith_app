// Геометрия уровня жидкости в пилюле (v3.3.186) — один отсчёт для слоя заливки, линии уровня, тёмного текста поверх жидкости и пузырей (wordLanePool.paintFill, wordLaneBubbles.js). Чистые функции.
// Ось заливки: вертикальная пилюля — снизу вверх, широкая «Фраз» — слева направо; a — расстояние вдоль оси от дальнего торца (низ / левый край клипа заливки), L — длина клипа вдоль оси, R — его полуширина.
// Слой заливки длиннее клипа на SOFT_PX (--wl-soft) и едет целиком; ПОВЕРХНОСТЬ жидкости — на SURF_PX (--wl-surf, середина мягкого края) от переднего края слоя: там же линия уровня и граница
// тёмного текста. При заливке 1 поверхность на SURF_PX ЗА торцом клипа — запас, у засчитанной пилюли прозрачной кромки внутри клипа нет.
export const SOFT_PX = 8            // --wl-soft: на столько слой заливки длиннее клипа (word-lane-pill.css)
export const SURF_PX = 4            // --wl-surf: поверхность жидкости от переднего края слоя
export const TIP_PX = 9             // --wl-tip: на столько линия уровня длиннее клипа с каждой стороны (клип отступает от внешнего края пилюли на 4 px — кончик выступает за стенку на ≈ 5 px)
export const FULL_V = 0.999         // заливка не ниже — пилюля полная (data-full: тело и клип цвета жидкости)
export const LINE_FADE = 0.04       // у торцов линия уровня гаснет на этой доле заливки
export const LINE_TOP = 0.985       // выше — линии нет (полная пилюля — без линии)

const clamp01 = v => Math.min(1, Math.max(0, Number(v) || 0))
const axis = ({ w, h, wide = false }) => (wide ? { L: w, R: h / 2 } : { L: h, R: w / 2 })

/** Где поверхность жидкости при заливке v: px вдоль оси от дальнего торца клипа (вертикальная — от низа, широкая — от левого края) */
export const surfaceAt = (v, geo) => clamp01(v) * (axis(geo).L + SOFT_PX) - SURF_PX

/** Полуширина капсулы на расстоянии a от дальнего торца (у скруглённых торцов она уже), px; pad — капсула, ужатая со всех сторон на pad (место для центра частицы радиуса pad) */
export function halfAt(a, geo, pad = 0) {
  const { L, R } = axis(geo), d = Math.min(a, L - a)
  return d >= R ? Math.max(0, R - pad) : Math.sqrt(Math.max(0, (R - pad) ** 2 - (R - d) ** 2))
}

/** Линия уровня вертикальной пилюли: { scale — scaleX линии (она на TIP_PX длиннее клипа с каждой стороны; у торцов поверхность уже — линия короче, кончики всё так же за стенкой), opacity — у дна и у верха гаснет } */
export function lineAt(v, geo) {
  const f = clamp01(v), { R } = axis(geo)
  const scale = R > 0 ? (halfAt(surfaceAt(f, geo), geo) + TIP_PX) / (R + TIP_PX) : 1
  return { scale: Math.round(scale * 1000) / 1000, opacity: Math.round(Math.max(0, Math.min(1, f / LINE_FADE, (LINE_TOP - f) / LINE_FADE)) * 100) / 100 }
}

/** Заливка v → transform слоя заливки: сдвиг из-за дальнего торца (0 — слой целиком за ним, 1 — на месте); широкая — translateX из-за левого края */
export const fillTransform = (v, wide = false) => { const e = (1 - clamp01(v)) * 100; return wide ? `translateX(${(-e).toFixed(1)}%)` : `translateY(${e.toFixed(1)}%)` }

/** Встречный сдвиг тёмного текста внутри слоя заливки (тот же процент с обратным знаком — текст стоит на месте, а окно жидкости едет по нему) */
export const inkTransform = (v, wide = false) => { const e = (1 - clamp01(v)) * 100; return wide ? `translateX(${e.toFixed(1)}%)` : `translateY(${(-e).toFixed(1)}%)` }

/** Слой уровня (линия, пузыри): вертикальная — тот же transform, что у слоя заливки (тот же блок); широкая — translateX(v·100 %) (кромка-веретено, word-lane-wide-fill.css) */
export const levelTransform = (v, wide = false) => (wide ? `translateX(${(clamp01(v) * 100).toFixed(1)}%)` : fillTransform(v, false))
