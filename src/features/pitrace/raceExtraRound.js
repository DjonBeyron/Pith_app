// Дополнительный круг прохода игры «Встряхни память» (CONCEPT_RACE.md, «Дополнительный круг»): правило одно для обоих проходов (A «скажи слово по переводу», B «назови перевод»), у каждого прохода свой круг.
//  • СЛАБОЕ слово: ошибка (сказал не то), молчание (не успел) или ответ «в последний момент» — слово засчитано, но пилюля к этому мигу уже ниже LATE_Y (80 %) экрана (результат r.late, ставит директор по положению пилюли);
//  • слабых слов 0 или 1 — дополнительного круга НЕТ; два и больше — круг: слабые слова + EXTRA_FILL других (3): сначала удавшиеся слова прохода (вперемешку, по семени), а если их не хватает — дежурные слова (raceStandby.js);
//  • перед кругом Пит без плашки говорит race_sprint_round2; скорость: первая пилюля на 10 % быстрее, чем была у последней в проходе, дальше +5 % на пилюлю.
// Чистые функции без React: выбор слов и переход директора. Случайность — только rngFor (по семени плана).
import { rngFor, rngShuffle } from '../rehearsal/rehearsalSeed.js'
import { normText } from '../player/modules/rotate-phone/wordLaneRecipe.js'

export const ROUND2_BOOST = 1.1   // старт дополнительного круга: на 10 % быстрее конца прохода
export const ROUND2_STEP = 1.05   // дальше +5 % на пилюлю
export const EXTRA_MIN_WEAK = 2   // меньше слабых слов — круга нет
export const EXTRA_FILL = 3       // сколько других слов добавляется к слабым: сначала удавшиеся, потом дежурные
export const LATE_Y = 80          // ответ «в последний момент»: слово засчитано, когда пилюля уже ниже этой отметки (% высоты экрана)

/** Слово не далось: промах (чужое слово) или пропуск (не сказал) */
export const failedIn = r => !r || !r.hit || !!r.miss

/** Ответ «в последний момент»: пилюля в момент зачёта ниже LATE_Y % экрана (y — её положение, % высоты) */
export const isLate = y => Number.isFinite(y) && y > LATE_Y

/** Слабое слово для дополнительного круга: ошибка, молчание или поздний ответ */
export const weakIn = r => failedIn(r) || !!r.late

/**
 * Слова дополнительного круга: [{ ...слово, idx, lane, speed }]; пусто — слабых слов меньше двух, круга нет. words — слова прохода (с speed), results — { номер: { hit, miss, late } }, standby — дежурные слова в формате слов
 * прохода (добор, когда удавшихся меньше EXTRA_FILL), tag — метка семени (у проходов разная).
 */
export function round2Words(words, results, seed, tag = 'race-sprint-2', standby = []) {
  const weak = words.filter((_, i) => weakIn(results?.[i]))
  if (weak.length < EXTRA_MIN_WEAK) return []
  const rng = rngFor(seed, tag)
  const good = rngShuffle(rng, words.filter((_, i) => !weakIn(results?.[i])))
  const taken = new Set(words.map(w => normText(w.text)))
  const duty = rngShuffle(rng, standby.filter(w => !taken.has(normText(w.text))))
  const fill = [...good, ...duty].slice(0, EXTRA_FILL)
  const start = Math.max(1, ...words.map(w => w.speed ?? 1)) * ROUND2_BOOST
  return rngShuffle(rng, [...weak, ...fill]).map((w, idx) => ({ ...w, idx, lane: idx % 3, speed: +(start * ROUND2_STEP ** idx).toFixed(4) }))
}

/**
 * Куда идёт директор после стадии cur: после прохода (sprint или catch) — на объявление дополнительного круга (слова выбраны и вписаны в стадию sprint2 / catch2 её методом fill) или, если круга нет, мимо него;
 * null — решает обычный порядок. stages — список стадий, pass — состояние прохода (s.sprint или s.catch: { results }), seed — семя плана. Дежурные слова берутся из cur.standby (их кладёт сборщик стадий).
 */
export function extraTarget(stages, cur, pass, seed) {
  if (!['sprint', 'catch'].includes(cur?.act) || cur.type !== 'student' || cur.sid !== cur.act || !pass) return null
  const i2 = stages.findIndex(x => x.sid === `${cur.act}2`)
  if (i2 < 0) return null
  const words = round2Words(cur.words, pass.results, seed, cur.act === 'sprint' ? 'race-sprint-2' : 'race-catch-2', cur.standby)
  if (!words.length) return i2 + 1
  stages[i2].fill?.(words)
  return i2 - 1
}
