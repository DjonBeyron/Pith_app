// Кадры анимаций XP игры — чистые функции без DOM (тест: wordLaneXpFlight.test.js).
// v3.3.271 (владелец): «вся анимация полёта XP убирается»: пилюля сама летит в счётчик (wordLaneRiseXp.js), прилетела — счётчик распухает (xpPulseFrames), и ОТ НЕГО вверх идёт «+N XP»:
// xpFloatFrames — медленно, по синусоиде (одна с небольшим волна), растёт (XP_FLOAT_SCALE_FROM → XP_FLOAT_SCALE_TO) и растворяется в воздухе.
// xpPulseFrames — «вдох» счётчика в момент прилёта: scale = 1 + A·sin(π·t), без рывка в начале и в конце.

export const XP_FLOAT_MS = 1900
export const XP_PULSE_MS = 520
export const XP_FLOAT_RISE_PX = 110      // на сколько px вверх от счётчика уходит «+N XP»
export const XP_FLOAT_WAVE_PX = 16       // размах синусоиды по x
export const XP_FLOAT_WAVES = 1.25       // периодов синусоиды за подъём
export const XP_FLOAT_SCALE_FROM = 0.85  // число растёт, пока поднимается
export const XP_FLOAT_SCALE_TO = 1.7
const STEPS = 40      // ключевых кадров: изгиб гладкий, кадры считаются один раз (летит компоузер, не rAF)
const PULSE_A = 0.38  // счётчик «распухает» заметно, но ненадолго

const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v)
const smooth = t => { const x = clamp01(t); return x * x * (3 - 2 * x) }

/** Прозрачность на доле подъёма u: проявляется за первые 10 %, держится до 45 %, дальше растворяется до нуля */
export const xpFloatOpacity = u => smooth(u / 0.1) * (1 - smooth((u - 0.45) / 0.55))

/** Кадры подъёма «+N XP» от точки from {x, y} (центр счётчика): вверх с замедлением к концу, по x — синусоида (старт без сдвига), масштаб растёт, число тает. Запускать с easing 'linear' */
export function xpFloatFrames(from, { steps = STEPS, rise = XP_FLOAT_RISE_PX, amp = XP_FLOAT_WAVE_PX } = {}) {
  const frames = []
  for (let i = 0; i <= steps; i++) {
    const u = i / steps
    const p = 1 - (1 - u) * (1 - u)                                    // ease-out: первые метры быстрее, дальше «медленно растворяется»
    const x = from.x + amp * Math.sin(2 * Math.PI * XP_FLOAT_WAVES * u)
    const y = from.y - rise * p
    const scale = XP_FLOAT_SCALE_FROM + (XP_FLOAT_SCALE_TO - XP_FLOAT_SCALE_FROM) * u
    frames.push({ transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%) scale(${scale.toFixed(3)})`, opacity: +xpFloatOpacity(u).toFixed(3) })
  }
  return frames
}

/** Центр прямоугольника (getBoundingClientRect) или null */
export function rectCenter(r) {
  return r && (r.width || r.height || r.left || r.top) ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null
}

/** Пульс счётчика: scale = 1 + A·sin(π·t), равномерные кадры (easing 'linear') */
export function xpPulseFrames(a = PULSE_A, steps = 12) {
  const frames = []
  for (let i = 0; i <= steps; i++) frames.push({ transform: `scale(${(1 + a * Math.sin(Math.PI * i / steps)).toFixed(4)})` })
  return frames
}
