// Взлёт заполненной пилюли игры «Повтори за диктором». Принятая пилюля (win) не уходит вниз вместе с конвейером: полёт вниз снимается, она на мгновение «набирает дыхание» (щелчок и искры уже были)
// и улетает обратно вверх — с ускорением, уменьшаясь и чуть волной, а на последних 30 % пути гаснет. Всё ОДНОЙ WAAPI-анимацией на композиторе (translate + scale + opacity): сдвиг по x — синусоида вдоль пути
// (RISE_WAVE_PX, RISE_WAVES периода), ускорение даёт easing анимации (ease-in), поэтому волна растёт вместе со скоростью. Положение пилюли берётся из часов её полёта вниз (flightY), сам полёт снимает пул.
// Первый кадр пишет только translate: начальные scale и opacity берутся «из-под анимации» (хлопок щелчка может ещё идти — взлёт его не обрывает), а задержка (fill both) держит пилюлю на месте.
// У диктора взлёта нет: его пилюли уходят вниз как раньше.
import { ENTER_Y, EXIT_Y } from './wordLaneTimeline.js'
import { FLIGHT_MS } from './wordLaneMotion.js'

export const RISE_DELAY_MS = 180   // пауза «набрать дыхание» между защёлкиванием и взлётом
export const RISE_MS = 750         // сам взлёт
export const RISE_END_Y = -24      // центр пилюли в конце, % высоты экрана: целиком выше верхнего края (PILL_H = 20, затемнение сверху 14 %)
export const RISE_WAVE_PX = 8      // размах волны по x
export const RISE_WAVES = 1.5      // периодов синусоиды за взлёт
export const RISE_SCALE = 0.55     // масштаб в конце
export const RISE_FADE_FROM = 0.7  // с какой доли пути пилюля гаснет (последние 30 %)
export const RISE_EASING = 'cubic-bezier(0.25, 0.1, 0.9, 0.55)' // ease-in с живым стартом: взлёт начинается сразу (наклон 0,4), а не из нуля, и к концу разгоняется (наклон 4,5)
const RISE_STEPS = 24              // точек кривой: линейная интерполяция между ними неотличима от синуса

/** Где (центр, % высоты экрана) пилюля сейчас: по часам её полёта вниз, ограниченным путём ENTER_Y → EXIT_Y */
export function flightY(anim) {
  const u = Math.min(1, Math.max(0, (Number(anim?.currentTime) || 0) / FLIGHT_MS))
  return ENTER_Y + (EXIT_Y - ENTER_Y) * u
}

/** Положение со сдвигом по x в пикселях: тот же формат, что flightPosition, плюс волна */
export const risePosition = (y, dx) => `calc(-50% + ${dx.toFixed(2)}px) calc(${y.toFixed(3)}dvh - 50%)`

/** Кадры взлёта из y0 (% высоты экрана): путь по y линеен по ходу анимации, синусоида по x, масштаб 1 → RISE_SCALE, гашение на последних 30 % */
export function riseFrames(y0) {
  const marks = new Set([RISE_FADE_FROM])
  for (let i = 0; i <= RISE_STEPS; i++) marks.add(i / RISE_STEPS)
  return [...marks].sort((a, b) => a - b).map(o => {
    const f = { offset: o, translate: risePosition(y0 + (RISE_END_Y - y0) * o, RISE_WAVE_PX * Math.sin(2 * Math.PI * RISE_WAVES * o)) }
    if (o === RISE_FADE_FROM) f.opacity = 1
    if (o === 1) { f.scale = RISE_SCALE; f.opacity = 0 }
    return f
  })
}

/** Запустить взлёт пилюли el из y0: после delay (пилюля стоит на месте) — RISE_MS полёта вверх. Возвращает Animation (finished — пилюлю можно вернуть в пул) */
export function startRise(el, y0, delay = RISE_DELAY_MS) {
  return el.animate(riseFrames(y0), { duration: RISE_MS, delay, easing: RISE_EASING, fill: 'both' })
}
