import {
  DIFF_TO_LEVEL, INITIAL, SIGMA_MIN, OBS_NOISE, MARGIN_OK, MARGIN_FAIL,
  SIGNAL_WEIGHT, SKIP_CONTEXT_GAP, FINE_SIGMA_SHRINK, TOO_EASY_LIFT, START_BASE, START_SPAN,
  JUMP_EVERY, JUMP_STEP, LOW_BELOW, HIGH_FROM, CONFIDENT_SIGMA,
} from './levelRules.js'

// Модель уровня: две оси (ear — на слух, vocab — словарь), у каждой уровень
// level 0..1, неопределённость sigma и число наблюдений n. Чистые функции:
// без localStorage и сети, каждая возвращает НОВЫЙ объект (хранение — levelStore.js
// и shared/api/levelApi.js).
//
// Формула простыми словами (одно наблюдение: материал сложности at, исход ok):
//  1. Куда тянуть. Верный ответ говорит «уровень не ниже at + небольшой запас»,
//     неверный — «уровень не выше at − запас побольше». Запасы MARGIN_OK и
//     MARGIN_FAIL относятся как 0.85 : 0.15, поэтому на материале «по уровню»
//     в равновесии верных ровно TARGET_OK. Односторонне: верный ответ на
//     материале ниже уровня, а неверный на материале выше него уровень не
//     двигают (ничего нового не сказали).
//  2. Насколько тянуть. Как в фильтре Калмана: gain = sigma² / (sigma² +
//     OBS_NOISE²/weight). Мало уверены (sigma большая) и наблюдение надёжное
//     (weight → 1) — шаг большой; уверены и наблюдение слабое (быстрый пролист,
//     weight 0.2) — шаг почти нулевой, так единичный шум не двигает уровень.
//  3. Неопределённость. sigma' = max(SIGMA_MIN, sigma·√(1 − gain)); n растёт на 1.

const clamp01 = x => Math.min(1, Math.max(0, x))
const AXES = ['ear', 'vocab']

export const emptyLevel = () => ({
  ear: { level: INITIAL.level, sigma: INITIAL.sigma, n: 0 },
  vocab: { level: INITIAL.level, sigma: INITIAL.sigma, n: 0 },
  updatedAt: 0,
})

// Подтягивает ось к цели target (0..1) с шагом по весу наблюдения
function pull(ax, target, weight) {
  const w = Math.min(1, Math.max(0.01, weight))
  const gain = (ax.sigma ** 2) / (ax.sigma ** 2 + (OBS_NOISE ** 2) / w)
  return {
    level: clamp01(ax.level + gain * (target - ax.level)),
    sigma: Math.max(SIGMA_MIN, ax.sigma * Math.sqrt(1 - gain)),
    n: ax.n + 1,
  }
}

// Одно наблюдение по оси: obs = { at: 0..1 — сложность материала, ok: boolean }
export function observe(axis, obs, weight = 1) {
  const at = clamp01(obs.at)
  const target = obs.ok ? Math.max(axis.level, at + MARGIN_OK) : Math.min(axis.level, at - MARGIN_FAIL)
  return pull(axis, target, weight)
}

const diffLevel = d => DIFF_TO_LEVEL[d] ?? null
const axesOf = axis => (axis === 'both' ? AXES : [axis])

// Наблюдение по осям; at по умолчанию — текущий уровень оси
function observeAxes(level, axis, at, ok, weight, now) {
  let out = { ...level, updatedAt: now }
  for (const name of axesOf(axis)) {
    out = { ...out, [name]: observe(out[name], { at: at ?? out[name].level, ok }, weight) }
  }
  return out
}

// Сигнал поведения/ответа → новый уровень. Неоднозначный сигнал (быстрый
// пролист «в тон» уровню) возвращает level без изменений
export function applySignal(level, signal, now = Date.now()) {
  const s = signal ?? {}
  const at = diffLevel(s.difficulty)
  const w = SIGNAL_WEIGHT[s.type]
  switch (s.type) {
    case 'answer': {
      const axis = s.axis ?? (s.value === 'scene_task_answer' ? 'ear' : 'vocab')
      return observeAxes(level, axis, at, !!s.ok, w, now)
    }
    case 'watched':
      return observeAxes(level, 'ear', at, true, w, now)
    case 'hard_sign':
      return observeAxes(level, 'ear', at, false, w, now)
    case 'quick_skip': {
      if (at == null) return level
      const gap = at - level.ear.level
      if (gap <= -SKIP_CONTEXT_GAP) return observeAxes(level, 'ear', level.ear.level, true, w, now) // слишком легко
      if (gap >= SKIP_CONTEXT_GAP) return observeAxes(level, 'ear', at, false, w, now) // слишком сложно
      return level
    }
    case 'difficulty_vote': {
      const v = Number(s.value)
      if (!(v >= 1 && v <= 3)) return level
      const base = at ?? level.ear.level
      if (v === 1) return observeAxes(level, 'ear', Math.max(base, level.ear.level), true, w, now)
      return observeAxes(level, 'ear', base, v === 2, w, now)
    }
    case 'pit_answer': {
      if (s.value === 'too_fast') return observeAxes(level, 'ear', null, false, w, now)
      if (s.value === 'too_easy') {
        let out = level
        for (const name of AXES) out = observeAxes(out, name, clamp01(out[name].level + TOO_EASY_LIFT), true, w, now)
        return out
      }
      if (s.value === 'fine') {
        const shrink = ax => ({ ...ax, sigma: Math.max(SIGMA_MIN, ax.sigma * FINE_SIGMA_SHRINK) })
        return { ...level, ear: shrink(level.ear), vocab: shrink(level.vocab), updatedAt: now }
      }
      return level
    }
    case 'start_result': {
      // ok — доля верных 0..1 (или boolean)
      const frac = typeof s.ok === 'number' ? clamp01(s.ok) : s.ok ? 1 : 0
      return { ...level, vocab: pull(level.vocab, START_BASE + START_SPAN * frac, w), updatedAt: now }
    }
    default:
      return level
  }
}

const word = v => (v < LOW_BELOW ? 'низкий' : v < HIGH_FROM ? 'средний' : 'высокий')

// Для админки и отладки (человеку в интерфейсе показываем слова Пита — другая задача)
export function describeLevel(level) {
  return {
    ear: word(level.ear.level),
    vocab: word(level.vocab.level),
    confident: level.ear.sigma <= CONFIDENT_SIGMA && level.vocab.sigma <= CONFIDENT_SIGMA,
  }
}

// Слайд-«рывок»: каждый JUMP_EVERY-й (индекс с нуля: 4, 9, 14…)
export const isJumpSlide = slideIndex => slideIndex >= 0 && (slideIndex + 1) % JUMP_EVERY === 0

// Нужная сложность слайда 1|2|3: ближайшая ступень к ear.level, на рывке — на ступень выше
export function pickTargetDifficulty(level, slideIndex) {
  const want = level.ear.level + (isJumpSlide(slideIndex) ? JUMP_STEP : 0)
  let best = 1
  for (const d of [1, 2, 3]) {
    if (Math.abs(DIFF_TO_LEVEL[d] - want) < Math.abs(DIFF_TO_LEVEL[best] - want)) best = d
  }
  return best
}
