// Мини-реплики успеха «Разгона» (CONCEPT_RACE.md, «Разгон»): на ПЕРВОМ верном слове Пит говорит одну из race_good_1..4 (случайную по семени плана), дальше — ещё одну раз в 3–4 верных слова. Чистая функция от семени
// (rngFor, без Math.random): одна сессия воспроизводима. В проходе B (Пит говорит английское слово, ученик отвечает по-русски) произношение не хвалят: вместо четырёх реплик одна race_good_ok «Отлично», та же частота и тот же путь.
// Серий «ну, погнали» и «огонь» больше нет. Любая похвала (voice / тап / второй круг) идёт ОДНИМ путём: Пит занят с зачёта, а GOOD_DELAY_MS отсчитывается от взлёта пилюли (v3.3.115; до этого — от зачёта, и реплика звучала раньше взлёта); следующая пилюля не выезжает, пока Пит не договорил (step.holdAll, wordLaneStudent.js).
import { rngFor, rngInt } from '../rehearsal/rehearsalSeed.js'

export const GOOD_IDS = ['race_good_1', 'race_good_2', 'race_good_3', 'race_good_4']
export const OK_ID = 'race_good_ok' // проход B: просто «Отлично», без похвалы за произношение
export const OK_IDS = [OK_ID]
export const ALL_GOOD_IDS = [...GOOD_IDS, OK_ID] // любая реплика успеха: идёт одним путём похвалы (useRaceActs)
export const GOOD_DELAY_MS = 500 // реплика успеха начинается через столько мс после ВЗЛЁТА пилюли; до её конца Пит занят, следующая пилюля и перевод ждут (useCatLines.sayLineLater)
export const GOOD_ARM_MS = 1800 // похвала ждёт взлёта пилюли (win движка) не дольше стольки мс после зачёта; нет взлёта — отсчёт идёт от зачёта (страховка)
export const GOOD_GAP_MIN = 3 // следующая реплика — через 3 или 4 верных слова после предыдущей
export const GOOD_GAP_MAX = 4

/**
 * План мини-реплик круга: [{ at (номер верного слова, с 1), id }]. first — реплика уже на первом верном слове (первый круг); иначе первая на 3–4-м.
 * ids — из каких реплик выбирать (по умолчанию четыре с произношением). Две реплики подряд не повторяются (если вариантов больше одного); n — сколько слов в круге (дальше последней пилюли реплик не планируем).
 */
export function goodPlan(seed, tag, n, { first = true, ids = GOOD_IDS } = {}) {
  const rng = rngFor(seed, `race-good-${tag}`)
  const gap = () => GOOD_GAP_MIN + rngInt(rng, GOOD_GAP_MAX - GOOD_GAP_MIN + 1)
  const plan = []
  let at = first ? 1 : gap()
  let last = -1
  while (at <= n) {
    let k = rngInt(rng, ids.length)
    if (ids.length > 1 && k === last) k = (k + 1 + rngInt(rng, ids.length - 1)) % ids.length
    plan.push({ at, id: ids[k] })
    last = k
    at += gap()
  }
  return plan
}
