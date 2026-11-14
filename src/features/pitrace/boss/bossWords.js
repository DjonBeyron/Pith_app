import { rngFor, rngShuffle } from '../../rehearsal/rehearsalSeed.js'

// Слова финала «Шкала памяти» (чистые функции без React): слабые слова этой игры, то есть те, на которых ученик ошибался, молчал или отвечал «в последний момент» (результаты проходов A, B и их
// дополнительных кругов, raceState.js). Первыми в очереди идут самые прочные из выбранных (разминка: вспоминание работает, когда вспомнить удалось), дальше — всё слабее.
export const BOSS_MAX = 6      // слов в финале не больше (короткий финал: больше повторов подряд пользы мало)
export const BOSS_MIN = 3      // меньше слов в плане — финала нет
export const BOSS_SPEED = 0.5  // скорость пилюли финала (доли конвейера): ≈ 13 % высоты в секунду, пилюля едет ≈ 7 с

/** Слабость одного результата слова: 3 — ошибка или молчание, 2 — ответ «в последний момент», иначе время ответа в долях 4 с (0…1,5); нет результата — 1 (слово не проверялось) */
export function resultScore(r) {
  if (!r) return 1
  if (!r.hit || r.miss) return 3
  if (r.late) return 2
  return Math.min(1.5, (r.ms ?? 0) / 4000)
}

/** Слабость слова text по всем проходам: наибольшая из его результатов (ошибка где-то — слово слабое) */
export function wordWeakness(s, text) {
  const out = []
  for (const k of ['sprint', 'catch']) {
    const p = s?.[k]
    for (const q of [p, p?.r2]) { const i = q?.words?.indexOf(text) ?? -1; if (i >= 0) out.push(resultScore(q.results?.[i])) }
  }
  return out.length ? Math.max(...out) : 1
}

/** Слова финала: до BOSS_MAX самых слабых из words (порядок равных — по семени), поставленные от прочных к слабым; на одну дорожку по центру, скорость BOSS_SPEED. Мало слов (< BOSS_MIN) — пусто */
export function bossWords(words, s, seed) {
  const list = Array.isArray(words) ? words : []
  if (list.length < BOSS_MIN) return []
  const tie = rngShuffle(rngFor(seed, 'race-boss'), list)
  const picked = tie.map(w => ({ w, k: wordWeakness(s, w.text) })).sort((a, b) => b.k - a.k).slice(0, BOSS_MAX).sort((a, b) => a.k - b.k)
  return picked.map(({ w }, idx) => ({ ...w, idx, lane: 1, speed: BOSS_SPEED }))
}

/** Директор перед финалом: вписать слова в стадию-круг (stage.fill). Мало слов — финал пропускается (stage.empty). → номер стадии-церемонии или -1 */
export function bossFill(stages, s, seed) {
  const ann = stages.findIndex(x => x.sid === 'boss-ann'), round = stages.find(x => x.sid === 'boss')
  if (ann < 0 || !round) return -1
  const list = bossWords(round.base ?? round.words, s, seed)
  stages[ann].empty = round.empty = list.length < BOSS_MIN
  if (!round.empty) round.fill(list)
  return ann
}
