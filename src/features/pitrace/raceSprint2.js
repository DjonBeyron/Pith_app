// Второй круг «Разгона» и «Слушай и лови» (CONCEPT_RACE.md, «Разгон»): если в первом круге была хотя бы одна ошибка или пропуск, после слов Пит (без плашки, race_sprint_round2) пускает второй круг — слова, которые не дались, и 1–2 удавшихся вперемешку
// (по семени, rngFor). Скорость: первая пилюля на 10 % быстрее, чем была у последней в первом круге, дальше +5 % на пилюлю. Без ошибок второго круга нет. Чистые функции без React: выбор слов и переход директора.
import { rngFor, rngInt, rngShuffle } from '../rehearsal/rehearsalSeed.js'

export const ROUND2_BOOST = 1.1   // старт второго круга: на 10 % быстрее конца первого
export const ROUND2_STEP = 1.05   // дальше +5 % на пилюлю
export const ROUND2_GOOD_MAX = 2  // удавшихся слов вперемешку: 1 или 2

/** Слово не далось: промах (чужое слово) или пропуск (не сказал) */
export const failedIn = r => !r || !r.hit || !!r.miss

/** Слова второго круга: [{ ...слово, idx, lane, speed }]; пусто — ошибок не было, круга нет. words — слова первого круга (с speed), results — { номер: { hit, miss } } */
export function round2Words(words, results, seed, tag = 'race-sprint-2') {
  const bad = words.filter((_, i) => failedIn(results?.[i]))
  if (!bad.length) return []
  const rng = rngFor(seed, tag)
  const good = rngShuffle(rng, words.filter((_, i) => !failedIn(results?.[i])))
  const take = good.slice(0, Math.min(good.length, 1 + rngInt(rng, ROUND2_GOOD_MAX)))
  const start = Math.max(1, ...words.map(w => w.speed ?? 1)) * ROUND2_BOOST
  return rngShuffle(rng, [...bad, ...take]).map((w, idx) => ({ ...w, idx, lane: idx % 3, speed: +(start * ROUND2_STEP ** idx).toFixed(4) }))
}

/**
 * Куда идёт директор после стадии cur: после первого круга «Разгона» или «Слушай и лови» — на объявление второго (слова выбраны и вписаны в стадию sprint2 / catch2 её методом fill) или, если ошибок не было, мимо второго круга; null — решает обычный порядок.
 * stages — список стадий, sprint — состояние этапа (s.sprint или s.catch: { results }), seed — семя плана.
 */
export function sprintTarget(stages, cur, sprint, seed) {
  if (!['sprint', 'catch'].includes(cur?.act) || cur.type !== 'student' || cur.sid !== cur.act || !sprint) return null
  const i2 = stages.findIndex(x => x.sid === `${cur.act}2`)
  if (i2 < 0) return null
  const words = round2Words(cur.words, sprint.results, seed, cur.act === 'sprint' ? 'race-sprint-2' : 'race-catch-2')
  if (!words.length) return i2 + 1
  stages[i2].fill?.(words)
  return i2 - 1
}
