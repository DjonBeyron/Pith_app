import { rngFor, rngShuffle } from '../../rehearsal/rehearsalSeed.js'
import { ROUND2_STEP } from '../raceExtraRound.js'

// Маршрут эпизода «Мия» по стадиям (чистые функции без React): круг с Мией берёт слова дополнительного круга (слабые + добор, raceExtraRound) в новом порядке и ЗАМЕНЯЕТ его: когда директор
// шёл бы на плашку круга 2 (`${act}2-ann`), miaRoute ведёт его на церемонию `${act}3-ann` (один раз на проход); сами стадии Мии, когда Мия не «в игре», обходит nextIdx (miaSkip). Случайность — от семени плана.

/** Слова круга с Мией: слова круга 2 в другом порядке; скорость — от самой медленной пилюли круга 2, дальше +5 % на пилюлю (сверху ляжет MIA.BOOST через step.boost) */
export function miaWords(words, seed, act) {
  const list = Array.isArray(words) ? words : []
  if (!list.length) return []
  const base = Math.min(...list.map(w => w.speed ?? 1))
  return rngShuffle(rngFor(seed, `race-mia-${act}`), list).map((w, idx) => ({ ...w, idx, lane: idx % 3, speed: +(base * ROUND2_STEP ** idx).toFixed(4) }))
}

/** Вписать слова в круг с Мией прохода act (stage.fill) → номер стадии-церемонии или -1, если эпизода в списке нет (старый план, акт без проходов) */
export function miaTarget(stages, act, seed) {
  const ann = stages.findIndex(x => x.sid === `${act}3-ann`), r2 = stages.find(x => x.sid === `${act}2`), r3 = stages.find(x => x.sid === `${act}3`)
  if (ann < 0 || !r2 || !r3) return -1
  r3.fill?.(miaWords(r2.words, seed, act))
  return ann
}

/** Директор шёл на r: если это плашка дополнительного круга (…2-ann) и Мия в этом проходе ещё не была — вместо неё церемония Мии (слова круга вписаны); иначе -1 (идём как шли) */
export function miaRoute(stages, r, m, seed) {
  const act = /^(sprint|catch)2-ann$/.exec(stages[r]?.sid ?? '')?.[1]
  return act && !m?.used?.[act] ? miaTarget(stages, act, seed) : -1
}

/** Можно ли сейчас идти на стадию Мии st: церемония / круг разрешены, пока машина Мии этого прохода в игре (фаза 'in') */
export const miaAllowed = (st, m) => !!st?.mia && m?.phase === 'in' && m.act === st.act

/** Обойти стадии Мии, на которые идти нельзя (ошибки во втором круге не было): i — кандидат в следующие, nextOf(j) — обычный порядок (nextRunnable) от j → номер стадии */
export function miaSkip(stages, i, m, nextOf = j => j) {
  let j = i
  for (let n = 0; n < stages.length && stages[j]?.mia && !miaAllowed(stages[j], m); n++) j = nextOf(j + 1)
  return j
}
