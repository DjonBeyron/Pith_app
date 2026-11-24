// Экзамен «Шкала памяти»: правила «трофеи на кону» (владелец 2026-11-24). Чистые функции без React и DOM, все числа правил — ЗДЕСЬ, в одном месте.
// За слово игрок получает долю трофеев по зоне, где линия шкалы была в момент засчитанного верного ответа (тот же момент, в который фиксируется треугольник шкалы, RaceBossScale):
// зелёная — всё, жёлтая — половину, красная — почти ничего. Ошибка или молчание — 0. Потерянное (максимум за слово минус полученное) забирает Мия.
// Исход — по доле собранного от максимума экзамена. «Все трофеи за игру» Мия не забирает: только потерянные за экзамен.

// ПРЕДЛОЖЕНИЕ, владелец может поменять: сколько трофеев стоит одно слово экзамена. Единого «XP слова» в игре нет (счётчик в углу даёт 2 XP за пилюлю, wordLaneConfig.XP_PER_PILL; сохраняемый XP считает
// raceSim отдельно), поэтому взято число, при котором все три зоны дают целое: 20 / 10 / 3.
export const TROPHY_PER_WORD = 20
// ПРЕДЛОЖЕНИЕ, владелец может поменять: доля трофеев слова по зоне ответа (fast — зелёная, mid — жёлтая, slow — красная)
export const ZONE_SHARE = { fast: 1, mid: 0.5, slow: 0.15 }
// ПРЕДЛОЖЕНИЕ, владелец может поменять: пороги исхода, % собранного от максимума. ≥ FREE_PCT — Пит свободен, Мия уходит с коробкой; от MID_PCT до FREE_PCT — Пит свободен, потерянное Мия оставляет себе;
// меньше MID_PCT — Пит остаётся в коробке, Мия и коробка остаются на итоге
export const FREE_PCT = 70
export const MID_PCT = 40

export const OUTCOMES = ['free', 'mid', 'stay']

/** Трофеи за одно слово: ответ { ok, zone } → целое число. Верный ответ без зоны (слово принято раньше, чем пилюля коснулась шкалы) — зелёная. Ошибка / молчание / слова нет — 0 */
export function wordTrophies(answer) {
  if (!answer?.ok) return 0
  return Math.round(TROPHY_PER_WORD * (ZONE_SHARE[answer.zone] ?? ZONE_SHARE.fast))
}

/** Исход по собранному и максимуму (целые числа, сравнение без дробей): 'free' | 'mid' | 'stay' */
export function outcomeOf(got, max) {
  if (!(max > 0)) return 'free'
  return got * 100 >= max * FREE_PCT ? 'free' : got * 100 >= max * MID_PCT ? 'mid' : 'stay'
}

/**
 * Итог экзамена: answers — по одному на слово экзамена, по порядку [{ ok, zone }] (не отвеченное слово — null / { ok: false }), total — сколько слов в экзамене всего (по умолчанию answers.length;
 * пока экзамен идёт, слова впереди в максимум входят, а в «потеряно» — нет).
 * → { max, got, lost (уже у Мии), pct (собрано, % от максимума, вниз до целого), outcome, words: [по слову: получено] }
 */
export function examTrophies(answers, total = answers?.length ?? 0) {
  const list = Array.isArray(answers) ? answers : []
  const words = list.map(wordTrophies)
  const got = words.reduce((a, b) => a + b, 0), max = Math.max(total, list.length) * TROPHY_PER_WORD
  const lost = list.reduce((a, x, i) => a + (x ? TROPHY_PER_WORD - words[i] : 0), 0) // слово ещё не сыграно (нет записи) — его трофеи пока ничьи
  return { max, got, lost, pct: max > 0 ? Math.floor((got * 100) / max) : 0, outcome: outcomeOf(got, max), words }
}
