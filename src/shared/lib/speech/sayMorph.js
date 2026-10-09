// Морфинг кнопки «Нажмите, чтобы говорить» → КВАДРАТ с двумя половинами «Слушаю» / «Стоп» (модуль «Сказать фразу»): ЧИСТЫЕ константы
// и форма по прогрессу. Источник правды для порядка шагов; CSS (styles/player/panels/say-phrase-mic.css, @keyframes sayMorphIn/sayMorphOut)
// обязан совпадать — это проверяет sayMorph.test.js. Порядок «туда» (MORPH_MS, «эффект резины»):
//   ШАГ 1 (0 … SPLIT)  — прямоугольник СУЖАЕТСЯ по ширине до стороны квадрата; высота и скругление не меняются; иконка и текст
//                        прямоугольника не едут, а плавно гаснут (opacity);
//   ШАГ 2 (SPLIT … 1)  — пружина как у окошка по «уху» (popSpringIn, pop-spring.css: быстрый вылет, перелёт, недолёт, покой):
//                        высота и ширина растут до стороны с перелётом, скругление — до радиуса квадрата. Те же кривые и пропорции
//                        времени (перелёт на 42%, недолёт на 72% пружинной части). Содержимое квадрата проступает в начале пружины.
// Обратно (sayMorphOut, MORPH_OUT_MS) — мягко, без пружины: квадрат растекается в прямоугольник.
export const MORPH_MS = 520          // вся анимация «туда» (480–560 мс); столько же ждёт «начали», если движок уже слушает
export const MORPH_OUT_MS = 400      // «обратно»: после неудачи квадрат снова становится кнопкой
export const MORPH_SPLIT = 0.3       // доля времени на шаг 1 (сужение)
export const SQUARE_PX = 116         // сторона квадрата (112–120)
export const RECT_H = 52             // высота кнопки-прямоугольника
export const RECT_RADIUS = 12        // скругление кнопки-прямоугольника
export const SQUARE_RADIUS = 22      // скругление квадрата
export const FAIL_HOLD_MS = 1000     // сколько квадрат с крестиком держится после неудачи, потом снова прямоугольник (900–1100 мс)

// Кривая пружины — значения popSpringIn: 0 → перелёт на 42% → недолёт на 72% → покой; доли пересчитаны на пружинную часть (SPLIT … 1)
const spring = f => MORPH_SPLIT + (1 - MORPH_SPLIT) * f
const S = SQUARE_PX
/** Ключевые кадры «туда» (w: null — ширина кнопки-прямоугольника). Те же числа в @keyframes sayMorphIn; перелёт высоты ≈ 7%, ширины ≈ 5% */
export const MORPH_STOPS = [
  { p: 0, w: null, h: RECT_H, r: RECT_RADIUS },
  { p: MORPH_SPLIT, w: S, h: RECT_H, r: RECT_RADIUS },      // шаг 1 готов: ширина квадрата
  { p: spring(0.42), w: 126, h: 124, r: 24 },                // перелёт
  { p: spring(0.72), w: 113, h: 112, r: 20 },                // недолёт
  { p: 1, w: S, h: S, r: SQUARE_RADIUS },                    // покой
]

const lerp = (a, b, k) => a + (b - a) * k

/**
 * Форма кнопки при прогрессе p (0 — прямоугольник, 1 — квадрат; ключевые кадры соединены линейно — сглаживание делает CSS на каждом
 * участке). rectW — ширина прямоугольника. @returns {{width: number, height: number, radius: number}} в px
 */
export function morphShape(p, rectW) {
  const t = Math.min(1, Math.max(0, p))
  const at = i => ({ ...MORPH_STOPS[i], w: MORPH_STOPS[i].w ?? rectW })
  for (let i = 1; i < MORPH_STOPS.length; i++) {
    if (t > MORPH_STOPS[i].p) continue
    const a = at(i - 1), b = at(i), k = (t - a.p) / (b.p - a.p)
    return { width: lerp(a.w, b.w, k), height: lerp(a.h, b.h, k), radius: lerp(a.r, b.r, k) }
  }
  return { width: S, height: S, radius: SQUARE_RADIUS }
}

/** Сколько ждать завершения морфинга: при «уменьшить движение» анимации нет — сразу */
export function morphDelay(reducedMotion) {
  return reducedMotion ? 0 : MORPH_MS
}
