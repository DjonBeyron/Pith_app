// Логика лестницы «Вершины» (CONCEPT_RACE.md, раунд 3) — чистые функции без React: события движка (win / miss / fail ступени) → положение альпиниста, число заходов, подсказки, медаль.
//  • n ступеней = n слов фразы; альпинист стоит на ступени rung (0 — на земле); заход идёт на ступень k = rung + 1 (сказать первые k слов одним высказыванием);
//  • win — прыжок на ступень k, подпись k-го слова проявляется (lit); если k = n — вершина (top);
//  • fail («не успел» ≈ 4 с молчания, движок сам) — соскальзывание на ступень вниз, подпись оставленной ступени гаснет; на первой ступени остаёмся; miss (сказал не то) — только дрожь, ступень решает время;
//  • подсказки по ступени k (счёт промахов этой ступени идёт, пока она не взята): 2-й — Пит говорит k-е слово голосом (hint), 3-й и дальше — подпись k-го слова мигает (blink растёт, blinkK — какой ступени);
//  • attempts — число заходов: ровно n — золото, не больше n + 2 — серебро, иначе без медали; после MAX заходов лестница отпускает (over), чтобы вечные промахи не держали игрока.
export const CLIMB_FAIL_CAP = 3  // заходов на ступень в запасе: потолок — n · CLIMB_FAIL_CAP + CLIMB_SLACK
export const CLIMB_SLACK = 4
export const HINT_AT = 2         // промах №2 на ступени — Пит говорит слово
export const BLINK_AT = 3        // промах №3 — подпись мигает
export const SILVER_EXTRA = 2    // серебро: не больше n + 2 заходов

export const maxAttempts = n => n * CLIMB_FAIL_CAP + CLIMB_SLACK

export const initClimb = n => ({ n, rung: 0, attempts: 0, fails: {}, lit: Array.from({ length: n }, () => false), top: false, over: false, last: null, seq: 0, blink: 0, blinkK: 0 })

/** Ступень, на которую идёт следующий заход */
export const targetOf = c => c.rung + 1

/** Начался заход на ступень targetOf(c): счёт заходов +1, прошлое событие (прыжок / соскальзывание) снято */
export const enter = c => ({ ...c, attempts: c.attempts + 1, last: null })

/**
 * Событие ступени → { climb, hint }: kind — 'win' | 'miss' | 'fail'; hint — номер ступени, на которой Пит должен сказать слово голосом (иначе null).
 * Заходов больше потолка (maxAttempts) без вершины — over: nextOf отдаёт плашку вершины, лестница закончена.
 */
export function apply(c, kind) {
  const k = targetOf(c)
  if (kind === 'miss') return { climb: { ...c, last: 'shake', seq: c.seq + 1 }, hint: null }
  if (kind === 'win') {
    const lit = c.lit.map((_, i) => i < k) // подписи всех взятых ступеней горят
    return { climb: { ...c, rung: k, lit, fails: { ...c.fails, [k]: 0 }, top: k >= c.n, last: 'hit', seq: c.seq + 1 }, hint: null }
  }
  const f = (c.fails[k] ?? 0) + 1
  const rung = c.rung > 1 ? c.rung - 1 : c.rung // соскользнул на ступень вниз; на первой остаёмся
  const lit = c.lit.map((_, i) => i < rung) // подпись оставленной ступени гаснет
  const next = { ...c, rung, lit, fails: { ...c.fails, [k]: f }, last: 'slip', seq: c.seq + 1, blink: f >= BLINK_AT ? c.blink + 1 : c.blink, blinkK: f >= BLINK_AT ? k : c.blinkK }
  next.over = !next.top && next.attempts >= maxAttempts(c.n)
  return { climb: next, hint: f === HINT_AT ? k : null }
}

/** Какая ступень-стадия идёт дальше: номер k, или 'top' — лестница закончена (вершина или потолок заходов) */
export const nextOf = c => (c.top || c.over ? 'top' : targetOf(c))

/** Медаль за вершину: ровно n заходов — золото, не больше n + 2 — серебро, иначе 'finish' (добрался, но без медали); вершины нет — 'none' */
export function medalOf(c) {
  if (!c?.top) return 'none'
  return c.attempts <= c.n ? 'gold' : c.attempts <= c.n + SILVER_EXTRA ? 'silver' : 'finish'
}
