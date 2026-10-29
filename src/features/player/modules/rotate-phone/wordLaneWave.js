// Синусоида пути пилюль игры «Повтори за диктором»: и полёт вниз (wordLaneMotion.js), и взлёт (wordLaneRise.js) идут не по прямой, а по мягкой волне по x, а сама пилюля поворачивается вокруг своего ЦЕНТРА
// (якорь — центр пилюли: translate ведёт центр по пути, rotate крутит пилюлю вокруг него) так, чтобы её ось лежала на касательной к пути. Здесь общая математика: положение по x, наклон оси, формат кадра.
// Чистые функции — без DOM, проверяются тестами. Путь задан долей u (0…1) по ходу анимации: y по нему линеен (скорость конвейера постоянна), поэтому угол — это arctan(dx/dy) по ПИКСЕЛЯМ (высота экрана — viewHeightPx()).
// Всё это уходит в те же keyframes WAAPI, что и положение (translate + rotate в одной анимации на композиторе): новых слоёв и анимаций нет.

import { ENTER_Y, EXIT_Y } from './wordLaneTimeline.js'

export const TILT_MAX_DEG = 8 // потолок наклона: на очень коротком пути (взлёт из-под самого верха) касательная была бы почти горизонтальной

/** Высота экрана в пикселях (по ней проценты dvh пути переводятся в пиксели для наклона); без окна (тесты, SSR) — 812, как у iPhone 12 mini */
export const viewHeightPx = () => (typeof window !== 'undefined' && window.innerHeight > 0 ? window.innerHeight : 812)

/** Наклон оси пилюли (градусы, CSS rotate: положительный — по часовой): ось лежит на касательной. dxdu и dydu — скорость по x и по y в пикселях на единицу пути (y вниз). Одинаково для хода вниз и вверх */
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

// ---------- полёт вниз ----------
export const FLIGHT_WAVE_PX = 10          // размах волны по x: у дорожки по бокам от пилюли ≈ 21 px зазора (пилюля 22 % ширины в дорожке 33 %), дрожь промаха ±6 — вместе остаются на дорожке
export const FLIGHT_WAVES = 0.8           // периодов за весь путь ENTER_Y → EXIT_Y (132 % высоты): период длиннее экрана — на видимых 100 % пилюля делает ≈ 0,6 периода, волна «растянутая», не качание
export const FLIGHT_PHASE_STEP = (2 * Math.PI) / 3 // сдвиг фазы между соседними дорожками: три пилюли не качаются в такт

/** Фаза волны дорожки lane */
export const flightPhase = lane => (Number(lane) || 0) * FLIGHT_PHASE_STEP

/** Поза пилюли дорожки lane на доле пути u полёта вниз: x (px) и наклон (градусы); h — высота экрана, px */
export function flightPose(lane, u, h = viewHeightPx()) {
  const { x, dx } = sine(FLIGHT_WAVE_PX, FLIGHT_WAVES, flightPhase(lane), Math.min(1, Math.max(0, u)))
  return { x, deg: tiltDeg(dx, ((EXIT_Y - ENTER_Y) / 100) * h) }
}
