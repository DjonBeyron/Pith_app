import { rngFor, rngShuffle } from '../../rehearsal/rehearsalSeed.js'
import { ROUND2_STEP, round2Words } from '../raceExtraRound.js'

// Маршрут эпизода «Мия» по стадиям (чистые функции без React): круг с Мией берёт слова дополнительного круга (слабые + добор, raceExtraRound) в новом порядке и ЗАМЕНЯЕТ его: когда директор
// шёл бы на плашку круга 2 (`${act}2-ann`), miaRoute ведёт его на церемонию `${act}3-ann` (один раз за игру); сами стадии Мии, когда Мия не «в игре», обходит nextIdx (miaSkip). Случайность — от семени плана.

/** Слова круга с Мией: слова круга 2 в другом порядке; скорость — от самой медленной пилюли круга 2, дальше +5 % на пилюлю (сверху ляжет MIA.BOOST через step.boost) */
export function miaWords(words, seed, act) {
  const list = Array.isArray(words) ? words : []
  if (!list.length) return []
  const base = Math.min(...list.map(w => w.speed ?? 1))
  return rngShuffle(rngFor(seed, `race-mia-${act}`), list).map((w, idx) => ({ ...w, idx, lane: idx % 3, speed: +(base * ROUND2_STEP ** idx).toFixed(4) }))
}

/**
 * После круга прохода (sprint / catch, ступень ученика sid === act): слабых слов две и больше и Мия в этой игре ещё не была — номер стадии-церемонии `${act}3-ann` (слова круга вписаны: слабые + добор, перемешаны, miaWords); иначе -1
 * (идёт обычный порядок: после A — разворот в реверс, после B — следующий этап; стадии Мии обходит miaSkip). Мия — один раз за игру, после A или после B (владелец 2026-11-17); дополнительного круга от Пита нет.
 * stages — список стадий, cur — только что законченная стадия, pass — состояние прохода (s.sprint / s.catch: { results }), m — машина Мии (m.used).
 */
export function miaAfterPass(stages, cur, pass, seed, m) {
  if (!['sprint', 'catch'].includes(cur?.act) || cur.type !== 'student' || cur.sid !== cur.act || !pass) return -1
  if (Object.values(m?.used ?? {}).some(Boolean)) return -1
  const ann = stages.findIndex(x => x.sid === `${cur.act}3-intro-ann`), round = stages.find(x => x.sid === `${cur.act}3`)
  if (ann < 0 || !round) return -1
  const words = round2Words(cur.words, pass.results, seed, cur.act === 'sprint' ? 'race-sprint-2' : 'race-catch-2', cur.standby)
  if (!words.length) return -1
  round.fill?.(miaWords(words, seed, cur.act))
  return ann
}

/** Можно ли сейчас идти на стадию Мии st: церемония / круг разрешены, пока машина Мии этого прохода в игре (фаза 'in') */
export const miaAllowed = (st, m) => !!st?.mia && m?.phase === 'in' && m.act === st.act

/** Обойти стадии Мии, на которые идти нельзя (Мия не «в игре»): i — кандидат в следующие, nextOf(j) — обычный порядок (nextRunnable) от j → номер стадии. Церемония пропускается вместе
 *  со своим кругом (j + 2). Круг, стоящий сразу за церемонией, открыт: так заглядывает вперёд конвейер (upcomingLanes идёт от церемонии дальше) — дорожки не гаснут между этапами */
export function miaSkip(stages, i, m, nextOf = j => j) {
  let j = i
  for (let n = 0; n < stages.length && stages[j]?.mia; n++) {
    const st = stages[j], afterCeremony = (st.mia === 'round' && stages[j - 1]?.mia === 'ann' && stages[j - 1].act === st.act) || (st.mia === 'ann' && stages[j - 1]?.mia === 'intro' && stages[j - 1].act === st.act) // плашка «Допрос у Мии» → церемония → круг: внутри эпизода идут подряд
    if ((st.always && !st.empty) || miaAllowed(st, m) || afterCeremony) break // always — финал «Шкала памяти»: идёт всегда, если нашлись слова (empty — нет)
    j = nextOf(st.mia === 'intro' ? j + 3 : st.mia === 'ann' ? j + 2 : j + 1)
  }
  return j
}
