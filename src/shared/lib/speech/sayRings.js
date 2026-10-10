// Живой эквалайзер вокруг круга-микрофона («Сказать фразу»): чистая логика, без React и DOM. Уровень голоса 0..1 приходит из источника уровня
// (sayLevelSource.js: синтетический по событиям распознавания, реальный по флагу админа, в будущем RMS из аудиопотока Vosk), здесь — как три круглых
// кольца-волны следуют за ним: внутреннее реагирует мгновенно, внешние запаздывают лишь на 1–2 кадра (RING_ATTACK_MS) и гаснут мягче; пока голоса нет,
// кольца «дышат» (жизнь без событий). Кольца стартуют с радиуса ВНЕШНЕЙ ОБВОДКИ круга (RING_R0) и идут наружу: внутри обводки волн нет. ГЛАВНОЕ: радиус любого кольца обрезается по границам контейнера (clampRadius) — волны никогда не выходят за панель.
// Старт записи: кольца начинают с уровня «дыхания» и ПЛАВНО проявляются (eqEnvelope: прозрачность × smoothstep за EQ_FADE_MS) — раньше стартовая «вспышка» (kick) падала в первые 100–300 мс и совпадала с волнами активации. Потолок: до края клипа
// волн от центра круга 96 px (круг стоит в центре области между подписью и низом корпуса), радиус не больше 96 − WAVE_MARGIN; самое большое кольцо — 84,9 px.
// Размеры (всё ×0,85 от прежних): круг 85 px, в записи ×1,15 = 97,75 px (CIRCLE_R 48,875); обводка вокруг него — SVG 108,8 px, толщина 4,25 px, внешний край 53,1 px, в записи ×1,15 = 61,1 px (RING_R0).
// Результат кадра (scale/opacity) хук useSayWaves пишет прямо в style колец (transform/opacity, без ререндеров React и без CSS transition на transform).
export const RING_COUNT = 3
export const CIRCLE_R = 48.875                      // радиус круга-кнопки ВО ВРЕМЯ ЗАПИСИ, px (диаметр 85 × 1,15 = 97,75)
export const RING_R0 = 61.09                        // радиус ВНЕШНЕЙ ОБВОДКИ круга во время записи, px: (SVG-обводка 108,8 px → радиус 51 + половина толщины 2,125) × 1,15; отсюда стартуют все волны (кольцо при масштабе 1 лежит ровно по её краю)
export const RING_K = [0.25, 0.32, 0.39]           // масштаб кольца = 1 + уровень × k → до 1,25 / 1,32 / 1,39 при уровне 1 (радиус 76,4 / 80,6 / 84,9 px: +15,3 / +19,6 / +23,8 px от внешнего края обводки — прежние выступы 18 / 23 / 28 px × 0,85; потолок 84,9 px против 112 до края панели, надпись над кругом не перекрывается)
export const RING_OPACITY = [0.55, 0.32, 0.16]      // прозрачность при уровне 1: ближнее плотнее, каждое следующее тусклее
export const RING_OPACITY_FLOOR = 0.25              // доля прозрачности при уровне 0 (opacity = base × (floor + (1 − floor) × уровень))
export const RING_ATTACK_MS = [0, 16, 32]           // «инерция» подъёма: внутреннее — сразу, внешние на 1–2 кадра позже
export const RING_DECAY_MS = [100, 180, 300]        // и спада: внешние гаснут мягче
export const BREATH_PERIOD_MS = 1800
export const BREATH_BASE = 0.1                      // уровень «ожидания»: кольца едва дышат без голоса (≈ +2 px), чтобы голос был заметно выше
export const BREATH_SWING = 0.04
export const NOISE_GATE = 0.04                      // порог шума: уровень ниже него = тишина (кольца не дёргаются от шума микрофона)
export const RESPONSE_GAMMA = 0.5                   // кривая отклика: степень < 1 поднимает тихий голос (0,1 → ≈0,33, 0,2 → ≈0,53), громкий не «потолит» раньше времени
export const RESPONSE_GAIN = 1.3                    // и общее усиление поверх кривой (результат обрезается до 1)
export const EQ_FADE_MS = 500                       // плавное проявление эквалайзера после тапа: прозрачность колец растёт от нуля (smoothstep) за 0,5 с — он не «включается на ходу» поверх волн активации и циклических
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

/** Плавное проявление эквалайзера: 0 → 1 по smoothstep за EQ_FADE_MS с момента тапа (since — мс от старта записи; нет данных — сразу 1) */
export function eqEnvelope(since) {
  if (!(since < EQ_FADE_MS)) return 1
  const x = clamp01(since / EQ_FADE_MS)
  return x * x * (3 - 2 * x)
}

/** Кадр кольца i: масштаб относительно внешней обводки (внешний радиус кольца обрезан по контейнеру, но не меньше самой обводки — внутрь она не заходит) и прозрачность (env — проявление после тапа, eqEnvelope) */
export function ringFrame(level, i, box, env = 1) {
  const radius = clampRadius(ringScale(level, i) * RING_R0, box)
  return { scale: Math.max(1, radius / RING_R0), opacity: ringOpacity(level, i) * env }
}

/** «Ожидание» кольца во время записи: BREATH_BASE ± BREATH_SWING, период BREATH_PERIOD_MS; t — мс одной шкалы с rAF */
export function breath(t) {
  return BREATH_BASE + BREATH_SWING * Math.sin((t / BREATH_PERIOD_MS) * 2 * Math.PI)
}

/** Отклик на голос: порог шума → степень RESPONSE_GAMMA → усиление RESPONSE_GAIN, 0..1. Тихая речь поднимает кольца заметно, шум ниже порога — нет. Чистая функция */
export function voiceResponse(voice) {
  const v = clamp01(Number(voice) || 0)
  if (v <= NOISE_GATE) return 0
  return clamp01(Math.pow((v - NOISE_GATE) / (1 - NOISE_GATE), RESPONSE_GAMMA) * RESPONSE_GAIN)
}

/** Целевой уровень колец: отклик на голос, но не ниже «ожидания» (запись идёт — кольца живы и до первых событий распознавания) */
export function ringTarget({ voice = 0, t = 0 }) {
  return Math.max(voiceResponse(voice), breath(t))
}

/** Стартовые уровни в кадре тапа: «дыхание» (BREATH_BASE) — кольца живы до первых событий распознавания и не вспыхивают */
export const restRings = () => Array.from({ length: RING_COUNT }, () => BREATH_BASE)

/** Один кадр сглаживания: каждое кольцо тянется к target со своей инерцией подъёма/спада (экспонента). dt — мс с прошлого кадра */
export function ringsStep(prev, target, dt) {
  return prev.map((v, i) => {
    const tau = target > v ? RING_ATTACK_MS[i] : RING_DECAY_MS[i]
    const k = tau <= 0 ? 1 : 1 - Math.exp(-Math.max(0, dt) / tau)
    return v + (target - v) * k
  })
}
