// Кольца-волны вокруг круга «Слушаю…» (модуль «Сказать фразу»): чистая логика, без React и DOM. Уровень голоса 0..1 приходит из
// sayVoiceLevel.ringLevel(), здесь — как три кольца следуют за ним: у внутреннего мгновенная реакция, внешние запаздывают на
// 40–90 мс и гаснут мягче; во время слушания кольца «дышат» и без событий. Масштаб/прозрачность считает CSS из переменных
// --say-lvl, --say-lvl2, --say-lvl3 (transform: scale(calc(1 + var(--say-lvl) * k)); те же k и opacity — здесь, их проверяет тест).
export const RING_COUNT = 3
export const RING_K = [0.95, 1.05, 1.15]            // масштаб кольца = 1 + уровень × k → до 1,95 / 2,05 / 2,15 при уровне 1
export const RING_OPACITY = [0.55, 0.32, 0.16]      // прозрачность при уровне 1: ближнее плотнее, каждое следующее тусклее
export const RING_OPACITY_FLOOR = 0.35              // доля прозрачности при уровне 0 (opacity = base × (floor + (1 − floor) × уровень))
export const RING_ATTACK_MS = [0, 40, 90]           // «инерция» подъёма: внутреннее — сразу, внешние позже
export const RING_DECAY_MS = [120, 220, 380]        // и спада: внешние гаснут мягче
export const BREATH_PERIOD_MS = 1800
export const BREATH_BASE = 0.1                      // уровень «дыхания» (кольца живы и без голоса)
export const BREATH_SWING = 0.05
export const PREP_BREATH_K = 0.7                    // в подготовке (до «Слушаю…») дыхание ещё спокойнее

export const ringScale = (level, i) => 1 + clamp01(level) * RING_K[i]
export const ringOpacity = (level, i) => RING_OPACITY[i] * (RING_OPACITY_FLOOR + (1 - RING_OPACITY_FLOOR) * clamp01(level))

function clamp01(v) { return v > 1 ? 1 : v > 0 ? v : 0 }

/** «Дыхание» кольца во время попытки: BREATH_BASE ± BREATH_SWING, период BREATH_PERIOD_MS; t — мс одной шкалы с rAF */
export function breath(t) {
  return BREATH_BASE + BREATH_SWING * Math.sin((t / BREATH_PERIOD_MS) * 2 * Math.PI)
}

/** Целевой уровень колец. listening — уже «Слушаю…» (кольца следуют за голосом); иначе только спокойное дыхание подготовки */
export function ringTarget({ voice = 0, t = 0, listening = false }) {
  return listening ? Math.max(clamp01(voice), breath(t)) : breath(t) * PREP_BREATH_K
}

export const initialRings = () => new Array(RING_COUNT).fill(0)

/** Один кадр сглаживания: каждое кольцо тянется к target со своей инерцией подъёма/спада (экспонента). dt — мс с прошлого кадра */
export function ringsStep(prev, target, dt) {
  return prev.map((v, i) => {
    const tau = target > v ? RING_ATTACK_MS[i] : RING_DECAY_MS[i]
    const k = tau <= 0 ? 1 : 1 - Math.exp(-Math.max(0, dt) / tau)
    return v + (target - v) * k
  })
}
