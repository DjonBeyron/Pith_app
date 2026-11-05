// Траектория пилюли заставки «Гонки с Питом» (RaceCharge.jsx) — ОДНА параметрическая кривая по времени t∈[0,1], без DOM и часов (чистые функции, проверяются в консоли):
//   y(t) = −dist · easeOut(t)                                         — от старта за нижним краем до центра бара, быстро в начале и мягко на входе в бар;
//   x(t) = dx · smoothstep(t) + sign · A · sin(2π · k · t) · (1 − t)  — плавный переход к центру бара по x плюс затухающая синусоида (A = WAVE_PX, k = 1,5);
// на t = 0 сдвиг (0, 0), на t = 1 СТРОГО (dx, −dist): центр пилюли в центре бара и по x, и по y. Ключевых кадров PATH_FRAMES + 1 (шаг 1/30 — не 3–5 точек): кривая уже в точках, easing между ними линейный.
// Хвост-шлейф «размытия движения» (без filter и без призраков): растяжение по оси движения stretchAt ≤ STRETCH_MAX, гаснущее к прилёту; сам хвост — отдельный узел ПОД пилюлей (race-charge.css, .raceChargeTail), он начинается от середины пилюли
// и наклоняется по касательной к синусоиде: tailAngle берёт угол из производной этой же кривой (знак меняется вместе с направлением синусоиды), tailFrames даёт ключевые кадры rotate для Web Animations.
export const WAVE_PX = 7          // размах синусоиды по x, px (6–8)
export const PATH_K = 1.5         // периодов синусоиды за полёт
export const PATH_FRAMES = 30     // шагов кривой (кадров на один больше), не меньше 24
export const FADE_FROM = 0.85     // с этой доли пути пилюля гаснет: на t = 1 она в центре бара и уже невидима
export const STRETCH_MAX = 1.08   // растяжение по вертикали не больше

export const TAIL_GAIN = 5        // настоящий угол касательной мал (размах 7 px на сотни px пути ≈ 3°): для видимого наклона хвоста угол усилен в TAIL_GAIN раз (знак и форма те же)
export const TAIL_MAX = 0.38      // рад (≈ 22°): наклон хвоста не больше

const NORM = 0.58 // максимум sin(πt)(1 − t) ≈ 0,578: растяжение нормируется на STRETCH_MAX
const clamp01 = t => Math.min(1, Math.max(0, t))

export const smooth = t => t * t * (3 - 2 * t)
export const easeOut = t => 1 - (1 - t) * (1 - t)

/** Растяжение по оси движения на доле пути t (0…1): 1 на старте, пик STRETCH_MAX в первой трети, затем плавно к 1 к прилёту */
export const stretchAt = t => 1 + (STRETCH_MAX - 1) * Math.min(1, (Math.sin(Math.PI * clamp01(t)) * (1 - clamp01(t))) / NORM)

/** Сдвиг по x (px) на доле пути t: dx — расстояние до центра бара, sign (±1) — в какую сторону первая полуволна */
export const pathX = (dx, sign, t) => dx * smooth(t) + (sign || 0) * WAVE_PX * Math.sin(2 * Math.PI * PATH_K * t) * (1 - t)

/** Сдвиг по y (px, вверх — отрицательный) на доле пути t: dist — расстояние от старта до центра бара */
export const pathY = (dist, t) => -dist * easeOut(t)

/** Прозрачность на доле пути t: 1 до FADE_FROM, затем плавно к 0 (на t = 1 пилюля в баре и скрыта) */
export const pathOpacity = t => (t <= FADE_FROM ? 1 : 1 - smooth((t - FADE_FROM) / (1 - FADE_FROM)))

/** Ключевые кадры WAAPI полёта: [{ transform, opacity, offset, scale? }] с шагом 1 / PATH_FRAMES; trail — добавить растяжение. Первый кадр (0, 0), последний ровно (dx, −dist) */
export function pathFrames({ dx, dist, sign, trail = false, frames = PATH_FRAMES }) {
  return Array.from({ length: frames + 1 }, (_, k) => {
    const t = k / frames
    const last = k === frames // последний кадр — ровно в центр, без накопленной погрешности
    const x = last ? dx : pathX(dx, sign, t)
    const y = last ? -dist : pathY(dist, t)
    return { transform: `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`, ...(trail ? { scale: `1 ${stretchAt(t).toFixed(4)}` } : {}), opacity: +pathOpacity(t).toFixed(3), offset: t }
  })
}

/**
 * Наклон хвоста (рад, по часовой — плюс) на доле пути t: хвост висит от середины пилюли ПРОТИВ скорости, поэтому наклон = угол вектора скорости от вертикали, взятый из производной кривой: vx = dx/dt, vy = −dy/dt (вверх).
 * Пилюля уходит вправо (vx > 0) — хвост отклоняется влево-вниз (положительный rotate), влево — наоборот; знак совпадает со знаком горизонтальной скорости, то есть меняется вместе с направлением синусоиды.
 */
export function tailAngle(dx, dist, sign, t) {
  const u = clamp01(t), w = 2 * Math.PI * PATH_K
  const vx = dx * 6 * u * (1 - u) + (sign || 0) * WAVE_PX * (w * Math.cos(w * u) * (1 - u) - Math.sin(w * u))
  const vy = 2 * dist * (1 - u)
  return Math.max(-TAIL_MAX, Math.min(TAIL_MAX, TAIL_GAIN * Math.atan2(vx, vy)))
}

/** Ключевые кадры rotate хвоста (те же шаги, что у pathFrames): [{ rotate: '0.0123rad', offset }] */
export const tailFrames = ({ dx, dist, sign, frames = PATH_FRAMES }) => Array.from({ length: frames + 1 }, (_, k) => ({ rotate: `${tailAngle(dx, dist, sign, k / frames).toFixed(4)}rad`, offset: k / frames }))
