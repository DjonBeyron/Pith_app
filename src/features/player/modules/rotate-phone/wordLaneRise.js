// Взлёт заполненной пилюли игры «Повтори за диктором». Принятая пилюля (win) не уходит вниз вместе с конвейером: полёт вниз снимается, она на мгновение «набирает дыхание» (щелчок и искры уже были)
// и улетает обратно вверх — с ускорением и чуть волной, превращаясь в искру: масштаб падает до RISE_SCALE (0,1) в основном во второй половине пути (своя кривая, smoothstep от RISE_SHRINK_FROM, отдельно от хода по y),
// а на последних 25 % пути пилюля гаснет. Всё ОДНОЙ WAAPI-анимацией на композиторе (translate + scale + opacity): сдвиг по x — синусоида вдоль пути
// (RISE_WAVE_PX, RISE_WAVES периода), ускорение даёт easing анимации (ease-in), поэтому волна растёт вместе со скоростью. Положение пилюли берётся из часов её полёта вниз (flightY), сам полёт снимает пул.
// Первый кадр пишет только translate: начальные scale и opacity берутся «из-под анимации» (хлопок щелчка может ещё идти — взлёт его не обрывает), а задержка (fill both) держит пилюлю на месте.
// У диктора взлёта нет: его пилюли уходят вниз как раньше.
import { ENTER_Y, EXIT_Y } from './wordLaneTimeline.js'
import { FLIGHT_MS } from './wordLaneMotion.js'

export const RISE_DELAY_MS = 180   // пауза «набрать дыхание» между защёлкиванием и взлётом
export const RISE_MS = 750         // сам взлёт
export const RISE_END_Y = -6       // центр искры в конце, % высоты экрана: к концу пилюля сжалась до RISE_SCALE (≈2 % высоты), так что центр на 6 % выше верхнего края — она целиком за кадром (затемнение сверху 14 %), а на пути видна почти до конца
export const RISE_WAVE_PX = 8      // размах волны по x
export const RISE_WAVES = 1.5      // периодов синусоиды за взлёт
export const RISE_SCALE = 0.1      // масштаб в конце: пилюля стала искрой
export const RISE_SHRINK_FROM = 0.15 // с какой доли пути пилюля начинает сжиматься (до неё масштаб 1); сжатие — smoothstep от этой точки до конца: к середине пути меньше 40 % сжатия, остальное — во второй половине (ход по y разгоняется, поэтому «искра» видна до верхнего края)
export const RISE_FADE_FROM = 0.75 // с какой доли пути пилюля гаснет (последние 25 %)
export const RISE_EASING = 'cubic-bezier(0.3, 0.1, 0.75, 0.6)' // ease-in с живым стартом (наклон 0,33 в начале) и умеренным разгоном к концу (наклон 1,6): раньше к концу летела почти мгновенно (наклон 4,5), и сжатие в искру пролетало за кадр-два
const RISE_STEPS = 24              // точек кривой: линейная интерполяция между ними неотличима от синуса

/** Где (центр, % высоты экрана) пилюля сейчас: по часам её полёта вниз, ограниченным путём ENTER_Y → EXIT_Y */
export function flightY(anim) {
  const u = Math.min(1, Math.max(0, (Number(anim?.currentTime) || 0) / FLIGHT_MS))
  return ENTER_Y + (EXIT_Y - ENTER_Y) * u
}

/** Масштаб на доле пути o (0…1): 1 до RISE_SHRINK_FROM, дальше плавно (smoothstep) до RISE_SCALE; ход по y и волна от него не зависят */
export function riseScale(o) {
  const t = Math.min(1, Math.max(0, (o - RISE_SHRINK_FROM) / (1 - RISE_SHRINK_FROM)))
  return 1 - (1 - RISE_SCALE) * t * t * (3 - 2 * t)
}

/** Положение со сдвигом по x в пикселях: тот же формат, что flightPosition, плюс волна */
export const risePosition = (y, dx) => `calc(-50% + ${dx.toFixed(2)}px) calc(${y.toFixed(3)}dvh - 50%)`

/** Кадры взлёта из y0 (% высоты экрана): путь по y линеен по ходу анимации, синусоида по x, масштаб 1 → RISE_SCALE по своей кривой (riseScale, кадр на каждой точке), гашение на последних 25 % */
export function riseFrames(y0) {
  const marks = new Set([RISE_FADE_FROM])
  for (let i = 0; i <= RISE_STEPS; i++) marks.add(i / RISE_STEPS)
  return [...marks].sort((a, b) => a - b).map(o => {
    const f = { offset: o, translate: risePosition(y0 + (RISE_END_Y - y0) * o, RISE_WAVE_PX * Math.sin(2 * Math.PI * RISE_WAVES * o)) }
    if (o > 0) f.scale = Number(riseScale(o).toFixed(4))                            // у первого кадра scale нет: старт «из-под анимации» (хлопок щелчка может ещё идти)
    if (o === RISE_FADE_FROM) f.opacity = 1
    if (o === 1) f.opacity = 0
    return f
  })
}

/** Запустить взлёт пилюли el из y0: после delay (пилюля стоит на месте) — RISE_MS полёта вверх. Возвращает Animation (finished — пилюлю можно вернуть в пул) */
export function startRise(el, y0, delay = RISE_DELAY_MS) {
  return el.animate(riseFrames(y0), { duration: RISE_MS, delay, easing: RISE_EASING, fill: 'both' })
}
