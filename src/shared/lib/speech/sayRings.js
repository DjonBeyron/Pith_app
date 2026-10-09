// Живой эквалайзер вокруг круга-микрофона («Сказать фразу»): чистая логика, без React и DOM. Уровень голоса 0..1 приходит из источника уровня
// (sayLevelSource.js: синтетический по событиям распознавания, реальный по флагу админа, в будущем RMS из аудиопотока Vosk), здесь — как три круглых
// кольца-волны следуют за ним: внутреннее реагирует мгновенно, внешние запаздывают лишь на 1–2 кадра (RING_ATTACK_MS) и гаснут мягче; пока голоса нет,
// кольца «дышат» (жизнь без событий). ГЛАВНОЕ: радиус любого кольца обрезается по границам контейнера (clampRadius) — волны никогда не выходят за панель.
// Результат кадра (scale/opacity) хук useSayWaves пишет прямо в style колец (transform/opacity, без ререндеров React и без CSS transition на transform).
export const RING_COUNT = 3
export const CIRCLE_R = 58                          // радиус круга-кнопки, px (диаметр 116): кольцо при масштабе 1 лежит ровно по его краю
export const RING_K = [0.75, 0.85, 0.95]            // масштаб кольца = 1 + уровень × k → до 1,75 / 1,85 / 1,95 при уровне 1 (радиус 101 / 107 / 113 px), если контейнер позволяет
export const RING_OPACITY = [0.55, 0.32, 0.16]      // прозрачность при уровне 1: ближнее плотнее, каждое следующее тусклее
export const RING_OPACITY_FLOOR = 0.35              // доля прозрачности при уровне 0 (opacity = base × (floor + (1 − floor) × уровень))
export const RING_ATTACK_MS = [0, 16, 32]           // «инерция» подъёма: внутреннее — сразу, внешние на 1–2 кадра позже
export const RING_DECAY_MS = [100, 180, 300]        // и спада: внешние гаснут мягче
export const BREATH_PERIOD_MS = 1800
export const BREATH_BASE = 0.18                     // уровень «ожидания»: кольца заметно живы и без голоса
export const BREATH_SWING = 0.08
export const TAP_KICK = [0.5, 0.4, 0.3]            // стартовые уровни колец в кадре тапа: мгновенная «вспышка», которая оседает до дыхания за 100–300 мс
export const WAVE_MARGIN = 2                        // запас до края контейнера, px: кольцо не касается края панели

const clamp01 = v => (v > 1 ? 1 : v > 0 ? v : 0)

/** Масштаб кольца i по уровню (без учёта контейнера) */
export const ringScale = (level, i) => 1 + clamp01(level) * RING_K[i]
export const ringOpacity = (level, i) => RING_OPACITY[i] * (RING_OPACITY_FLOOR + (1 - RING_OPACITY_FLOOR) * clamp01(level))

/**
 * Обрезать радиус по контейнеру: не больше расстояния от центра волн до ближайшего края контейнера (минус margin). Чистая функция.
 * box — { width, height, cx, cy } в одних координатах (cx, cy — центр волн внутри контейнера). Нет размеров (контейнер ещё не измерен) — радиус как есть.
 */
export function clampRadius(radius, box, margin = WAVE_MARGIN) {
  const { width = 0, height = 0, cx = 0, cy = 0 } = box ?? {}
  if (!(width > 0) || !(height > 0)) return radius
  const room = Math.min(cx, width - cx, cy, height - cy) - margin
  return Math.max(0, Math.min(radius, room))
}

/** Кадр кольца i: масштаб (внешний радиус кольца обрезан по контейнеру, но не меньше самого круга) и прозрачность */
export function ringFrame(level, i, box) {
  const radius = clampRadius(ringScale(level, i) * CIRCLE_R, box)
  return { scale: Math.max(1, radius / CIRCLE_R), opacity: ringOpacity(level, i) }
}

/** «Ожидание» кольца во время записи: BREATH_BASE ± BREATH_SWING, период BREATH_PERIOD_MS; t — мс одной шкалы с rAF */
export function breath(t) {
  return BREATH_BASE + BREATH_SWING * Math.sin((t / BREATH_PERIOD_MS) * 2 * Math.PI)
}

/** Целевой уровень колец: голос, но не ниже «ожидания» (запись идёт — кольца живы и до первых событий распознавания) */
export function ringTarget({ voice = 0, t = 0 }) {
  return Math.max(clamp01(voice), breath(t))
}

/** Стартовые уровни в кадре тапа: волны отзываются мгновенно, не дожидаясь событий распознавания */
export const kickRings = () => TAP_KICK.slice()

/** Один кадр сглаживания: каждое кольцо тянется к target со своей инерцией подъёма/спада (экспонента). dt — мс с прошлого кадра */
export function ringsStep(prev, target, dt) {
  return prev.map((v, i) => {
    const tau = target > v ? RING_ATTACK_MS[i] : RING_DECAY_MS[i]
    const k = tau <= 0 ? 1 : 1 - Math.exp(-Math.max(0, dt) / tau)
    return v + (target - v) * k
  })
}
