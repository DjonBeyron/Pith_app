// Мини-реплики успеха «Разгона» (CONCEPT_RACE.md, «Разгон»): на ПЕРВОМ верном слове Пит говорит одну из race_good_1..4 (случайную по семени плана), дальше — ещё одну раз в 3–4 верных слова. Чистая функция от семени
// (rngFor, без Math.random): одна сессия воспроизводима. Серий «ну, погнали» и «огонь» больше нет. Следующая пилюля не выезжает, пока Пит не договорил (step.holdAll, wordLaneStudent.js).
import { rngFor, rngInt } from '../rehearsal/rehearsalSeed.js'

export const GOOD_IDS = ['race_good_1', 'race_good_2', 'race_good_3', 'race_good_4']
export const GOOD_GAP_MIN = 3 // следующая реплика — через 3 или 4 верных слова после предыдущей
export const GOOD_GAP_MAX = 4

/**
 * План мини-реплик круга: [{ at (номер верного слова, с 1), id }]. first — реплика уже на первом верном слове (первый круг); иначе первая на 3–4-м.
 * Две реплики подряд не повторяются; n — сколько слов в круге (дальше последней пилюли реплик не планируем).
 */
export function goodPlan(seed, tag, n, { first = true } = {}) {
  const rng = rngFor(seed, `race-good-${tag}`)
  const gap = () => GOOD_GAP_MIN + rngInt(rng, GOOD_GAP_MAX - GOOD_GAP_MIN + 1)
  const plan = []
  let at = first ? 1 : gap()
  let last = -1
  while (at <= n) {
    let k = rngInt(rng, GOOD_IDS.length)
    if (k === last) k = (k + 1 + rngInt(rng, GOOD_IDS.length - 1)) % GOOD_IDS.length
    plan.push({ at, id: GOOD_IDS[k] })
    last = k
    at += gap()
  }
  return plan
}
