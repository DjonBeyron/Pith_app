// Морфинг кнопки «Нажмите, чтобы говорить» → круг «Слушаю…» (модуль «Сказать фразу»): ЧИСТЫЕ константы и форма по прогрессу.
// Источник правды для порядка шагов; CSS (styles/player/panels/say-phrase-mic.css, @keyframes sayMorphIn/sayMorphOut) обязан совпадать —
// это проверяет sayPhraseCssWiring.test.js. Порядок:
//   ШАГ 1 (0 … 50% времени) — прямоугольник СУЖАЕТСЯ по ширине до ширины круга; высота и скругление углов не меняются;
//   ШАГ 2 (50 … 100%)       — ширина уже равна кругу; ТОЛЬКО теперь растут скругление углов (до полного) и высота до диаметра круга.
// Обратно — в обратном порядке: круг → высота и углы возвращаются → затем ширина растёт до ширины кнопки.
export const MORPH_MS = 480       // вся анимация (420–520 мс); столько же ждёт «начали», если движок уже слушает
export const MORPH_SPLIT = 0.5    // доля времени на шаг 1
export const CIRCLE_PX = 104      // диаметр круга
export const RECT_H = 52          // высота кнопки-прямоугольника
export const RECT_RADIUS = 12     // скругление кнопки-прямоугольника

const lerp = (a, b, k) => a + (b - a) * k

/**
 * Форма кнопки при прогрессе p (0 — прямоугольник, 1 — круг; линейно, без сглаживания — сглаживание делает CSS на каждом шаге).
 * rectW — ширина прямоугольника. @returns {{width: number, height: number, radius: number}} в px
 */
export function morphShape(p, rectW) {
  const t = Math.min(1, Math.max(0, p))
  if (t <= MORPH_SPLIT) return { width: lerp(rectW, CIRCLE_PX, t / MORPH_SPLIT), height: RECT_H, radius: RECT_RADIUS }
  const k = (t - MORPH_SPLIT) / (1 - MORPH_SPLIT)
  return { width: CIRCLE_PX, height: lerp(RECT_H, CIRCLE_PX, k), radius: lerp(RECT_RADIUS, CIRCLE_PX / 2, k) }
}

/** Сколько ждать завершения морфинга: при «уменьшить движение» анимации нет — сразу */
export function morphDelay(reducedMotion) {
  return reducedMotion ? 0 : MORPH_MS
}
