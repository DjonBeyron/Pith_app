// Кадры анимаций XP игры «Повтори за диктором» — чистые функции без DOM (тест: wordLaneXpFlight.test.js).
// xpFlightFrames — полёт «+N XP» из пилюли в счётчик: по прямой от старта к цели с ease-in-out по времени, поперёк направления —
// одна волна синуса, затухающая к цели (у цели частица ровно в центре счётчика); появление → масштаб ~1 → у цели сжимается к 0,5 и тает.
// xpPulseFrames — «вдох» счётчика в момент прилёта: scale = 1 + A·sin(π·t), без рывка в начале и в конце.

export const XP_FLIGHT_MS = 1000
export const XP_PULSE_MS = 500
const STEPS = 40      // ключевых кадров на полёт: изгиб гладкий, а кадры считаются один раз (летит компоузер, не rAF)
const AMP = 30        // px — размах изгиба поперёк направления
const PULSE_A = 0.2

const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v)
const easeInOut = t => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t))
const smooth = t => { const x = clamp01(t); return x * x * (3 - 2 * x) }

/** Прозрачность и масштаб частицы в доле полёта u: проявляется за первые 12 %, у цели (последние ~22 %) сжимается и тает */
export function xpFlightLook(u) {
  const inK = smooth(u / 0.12)
  const outK = smooth((u - 0.78) / 0.22)
  return { opacity: inK * (1 - outK), scale: (0.6 + 0.4 * inK) * (1 - 0.5 * outK) }
}

/**
 * from, to — точки {x, y} в координатах окна (центр пилюли и центр счётчика). to нет — летит прямо вверх до края экрана (как прежде).
 * Возвращает ключевые кадры Web Animations (transform + opacity), offset равномерный — анимацию запускать с easing 'linear'.
 */
export function xpFlightFrames(from, to, { steps = STEPS, amp = AMP } = {}) {
  const end = to ?? { x: from.x, y: 0 }
  const dx = end.x - from.x, dy = end.y - from.y
  const len = Math.hypot(dx, dy)
  const nx = len > 1 ? -dy / len : 1, ny = len > 1 ? dx / len : 0 // нормаль к направлению полёта
  const frames = []
  for (let i = 0; i <= steps; i++) {
    const u = i / steps
    const p = easeInOut(u)
    const bend = amp * Math.sin(2 * Math.PI * p) * (1 - p) // одна волна, к цели затухает до нуля
    const x = from.x + dx * p + nx * bend
    const y = from.y + dy * p + ny * bend
    const { opacity, scale } = xpFlightLook(u)
    frames.push({ transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%) scale(${scale.toFixed(3)})`, opacity: +opacity.toFixed(3) })
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
