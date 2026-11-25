// Синусоида пути пилюль игры «Повтори за диктором»: и полёт вниз (wordLaneMotion.js), и взлёт (wordLaneRise.js) идут не по прямой, а по мягкой волне по x, а сама пилюля поворачивается вокруг своего ЦЕНТРА
// (якорь — центр пилюли: translate ведёт центр по пути, rotate крутит пилюлю вокруг него) так, чтобы её ось лежала на касательной к пути. Здесь общая математика: положение по x, наклон оси, формат кадра.
// Чистые функции — без DOM, проверяются тестами. Путь задан долей u (0…1) по ходу анимации: y по нему линеен (скорость конвейера постоянна), поэтому угол — это arctan(dx/dy) по ПИКСЕЛЯМ (высота экрана — viewHeightPx()).
// Всё это уходит в те же keyframes WAAPI, что и положение (translate + rotate в одной анимации на композиторе): новых слоёв и анимаций нет.

export const TILT_MAX_DEG = 8 // потолок наклона: на очень коротком пути (взлёт из-под самого верха) касательная была бы почти горизонтальной

/** Высота экрана в пикселях (по ней проценты dvh пути переводятся в пиксели для наклона); без окна (тесты, SSR) — 812, как у iPhone 12 mini.
 *  Высота запоминается до события resize: чтение window.innerHeight заставляет браузер пересчитать стили и раскладку, а читали её в кадре верного ответа (взлёт пилюли) — сразу после записей
 *  этого кадра, то есть посреди самого тяжёлого кадра игры (замер 2026-11-25, CPU 4×: пересчёт на 49 элементов) */
let viewH = 0, viewHooked = false
const dropViewH = () => { viewH = 0 }
export const viewHeightPx = () => {
  if (typeof window === 'undefined') return 812
  if (!viewHooked && typeof window.addEventListener === 'function') { viewHooked = true; window.addEventListener('resize', dropViewH); window.visualViewport?.addEventListener?.('resize', dropViewH) }
  if (!viewHooked) return window.innerHeight > 0 ? window.innerHeight : 812 // подставное окно без событий (тесты): не запоминаем
  if (!(viewH > 0)) viewH = window.innerHeight > 0 ? window.innerHeight : 0
  return viewH > 0 ? viewH : 812
}

/** Наклон оси пилюли (градусы, CSS rotate: положительный — по часовой): ось лежит на касательной. dxdu и dydu — скорость по x и по y в пикселях на единицу пути (y вниз). Знак — для хода вверх (взлёт) и вниз */
export function tiltDeg(dxdu, dydu, max = TILT_MAX_DEG) {
  const deg = dydu === 0 ? 0 : (-Math.atan(dxdu / dydu) * 180) / Math.PI
  return Math.max(-max, Math.min(max, deg))
}

/** Положение со сдвигом по x в пикселях: translate пилюли (-50 % по x — центр на дорожке, центр по y в % высоты экрана) */
export const wavePosition = (y, dx) => `calc(-50% + ${dx.toFixed(2)}px) calc(${y.toFixed(3)}dvh - 50%)`

/** Поворот пилюли вокруг центра, значение свойства rotate */
export const waveRotate = deg => `${deg.toFixed(3)}deg`

/** x (px) и производная dx/du синусоиды amp·sin(2π·waves·u + phase) */
export function sine(amp, waves, phase, u) {
  const w = 2 * Math.PI * waves
  const a = w * u + phase
  return { x: amp * Math.sin(a), dx: amp * w * Math.cos(a) }
}
