// Взлёт заполненной пилюли игры «Повтори за диктором». Принятая пилюля (win) не уходит вниз вместе с конвейером: полёт вниз снимается, она на мгновение «набирает дыхание» (щелчок и искры уже были)
// и улетает обратно вверх — с ускорением и мягкой волной (синусоида растянутая, пилюля наклонена по касательной вокруг своего центра, wordLaneWave.js; старт — из x и наклона полёта вниз, без скачка), превращаясь в искру: масштаб падает до RISE_SCALE (0,1) в основном во второй половине пути (своя кривая, smoothstep от RISE_SHRINK_FROM, отдельно от хода по y),
// а на последних 25 % пути пилюля гаснет. Всё ОДНОЙ WAAPI-анимацией на композиторе (translate + rotate + scale + opacity): сдвиг по x — синусоида вдоль пути
// (RISE_WAVE_PX, RISE_WAVES периода), ускорение даёт easing анимации (ease-in), поэтому волна растёт вместе со скоростью. Положение и наклон пилюли берутся из часов её полёта вниз (flightState), сам полёт снимает пул.
// Первый кадр пишет только translate: начальные scale и opacity берутся «из-под анимации» (хлопок щелчка может ещё идти — взлёт его не обрывает), а задержка (fill both) держит пилюлю на месте.
// У диктора взлёта нет: его пилюли уходят вниз как раньше.
import { ENTER_Y, EXIT_Y } from './wordLaneTimeline.js'
import { FLIGHT_MS } from './wordLaneMotion.js'
import { flightPose, sine, tiltDeg, wavePosition, waveRotate, viewHeightPx } from './wordLaneWave.js'

export const RISE_DELAY_MS = 180   // пауза «набрать дыхание» между защёлкиванием и взлётом
export const RISE_MS = 750         // сам взлёт
export const RISE_END_Y = -6       // центр искры в конце, % высоты экрана: к концу пилюля сжалась до RISE_SCALE (≈2 % высоты), так что центр на 6 % выше верхнего края — она целиком за кадром (затемнение сверху 14 %), а на пути видна почти до конца
export const RISE_WAVE_PX = 12     // размах волны по x (чуть больше, чем у полёта вниз: путь короче и быстрее, волна должна читаться)
export const RISE_WAVES = 0.8      // периодов синусоиды за взлёт (раньше 1,5 — частые колебания; теперь растянутая волна, как у полёта вниз)
export const RISE_TILT_BLEND = 0.3 // на какой доле пути гаснет разница между наклоном полёта вниз и касательной взлёта (стык без скачка угла)
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

/** Положение со сдвигом по x в пикселях: тот же формат, что у кадров полёта (wavePosition) */
export const risePosition = wavePosition

/** Поза пилюли по часам полёта вниз: y (% высоты экрана), x (px) и наклон (градусы) на волне её дорожки — отсюда взлёт стартует без скачка */
export function flightState(anim, lane, h = viewHeightPx()) {
  const u = Math.min(1, Math.max(0, (Number(anim?.currentTime) || 0) / FLIGHT_MS))
  return { y: flightY(anim), ...flightPose(lane, u, h) }
}

const smooth = t => { const x = Math.min(1, Math.max(0, t)); return x * x * (3 - 2 * x) }

/**
 * Кадры взлёта из позы from = { y (% высоты экрана), x (px), deg (градусы) } (у числа — только y, x и наклон 0): путь по y линеен по ходу анимации, по x — синусоида, фаза которой подобрана так,
 * чтобы в старте стоять ровно в from.x и идти в ту же сторону, что и полёт вниз (из двух решений sin φ = x/RISE_WAVE_PX берётся то, чей наклон ближе к from.deg); остаток разницы угла гаснет за RISE_TILT_BLEND пути.
 * Наклон оси — по касательной (tiltDeg), масштаб 1 → RISE_SCALE по своей кривой (riseScale, кадр на каждой точке), гашение на последних 25 %.
 */
export function riseFrames(from, h = viewHeightPx()) {
  const { y: y0, x: x0 = 0, deg: deg0 = 0 } = typeof from === 'number' ? { y: from } : from
  const dydo = ((RISE_END_Y - y0) / 100) * h                                         // ход по y, px за весь взлёт (вверх — отрицательный)
  const tiltAt = (phase, o) => tiltDeg(sine(RISE_WAVE_PX, RISE_WAVES, phase, o).dx, dydo)
  const s = Math.min(1, Math.max(-1, x0 / RISE_WAVE_PX))
  const roots = [Math.asin(s), Math.PI - Math.asin(s)]
  const phase = Math.abs(tiltAt(roots[0], 0) - deg0) <= Math.abs(tiltAt(roots[1], 0) - deg0) ? roots[0] : roots[1]
  const gap = deg0 - tiltAt(phase, 0)
  const marks = new Set([RISE_FADE_FROM])
  for (let i = 0; i <= RISE_STEPS; i++) marks.add(i / RISE_STEPS)
  return [...marks].sort((a, b) => a - b).map(o => {
    const f = { offset: o, translate: wavePosition(y0 + (RISE_END_Y - y0) * o, sine(RISE_WAVE_PX, RISE_WAVES, phase, o).x), rotate: waveRotate(tiltAt(phase, o) + gap * (1 - smooth(o / RISE_TILT_BLEND))) }
    if (o > 0) f.scale = Number(riseScale(o).toFixed(4))                            // у первого кадра scale нет: старт «из-под анимации» (хлопок щелчка может ещё идти)
    if (o === RISE_FADE_FROM) f.opacity = 1
    if (o === 1) f.opacity = 0
    return f
  })
}

/** Запустить взлёт пилюли el из позы from (y, x, deg — flightState; у числа только y): после delay (пилюля стоит на месте) — RISE_MS полёта вверх. Возвращает Animation (finished — пилюлю можно вернуть в пул) */
export function startRise(el, from, delay = RISE_DELAY_MS) {
  return el.animate(riseFrames(from), { duration: RISE_MS, delay, easing: RISE_EASING, fill: 'both' })
}
