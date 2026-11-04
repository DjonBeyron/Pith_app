// Логика подъёма «Вершины» (CONCEPT_RACE.md, раунд 3) — чистые функции без React: события движка (win / miss / fail ступени) → положение альпиниста, число заходов, подсказки, медаль.
//  • n ступеней = n слов фразы; альпинист стоит на островке rung (0 — на земле); заход идёт на ступень k = rung + 1 (сказать первые k слов одним высказыванием);
//  • win — прыжок на островок k, подпись k-го слова проявляется (lit), таймер получает добавку (wins, raceClimbTimer.js); если k = n — вершина (top);
//  • miss (сказал не то) и fail (собственное «не успел» движка, почти недостижимое: общий таймер короче) — соскальзывание на островок вниз, подпись оставленного гаснет; на первом остаёмся (дрожит);
//  • время вышло (timeOut) — подъём заканчивается на текущем островке (timedOut), медали нет;
//  • from — откуда прыгнул (для анимации прыжка), t0 — когда стартовал общий таймер;
//  • подсказки по ступени k (счёт промахов этой ступени идёт, пока она не взята): 2-й — Пит говорит k-е слово голосом (hint), 3-й и дальше — подпись k-го слова мигает (blink растёт, blinkK — какой ступени);
//  • ловушка-двойник (raceTrap.js): c.trap — камень рядом с островом ступени trap.k; сказал двойник на этой ступени (apply(c, 'miss', said)) — осыпается (state 'crumbled', at = seq события, чтобы экран играл крошение один раз), взял ступень — проваливается ('fell'); не больше одной за подъём;
//  • attempts — число заходов: ровно n — золото, не больше n + 2 — серебро, иначе без медали (только если дошёл до вершины); после MAX заходов подъём отпускает (over), чтобы вечные промахи не держали игрока.
export const CLIMB_FAIL_CAP = 3  // заходов на ступень в запасе: потолок — n · CLIMB_FAIL_CAP + CLIMB_SLACK
export const CLIMB_SLACK = 4
export const HINT_AT = 2         // промах №2 на ступени — Пит говорит слово
export const BLINK_AT = 3        // промах №3 — подпись мигает
export const SILVER_EXTRA = 2    // серебро: не больше n + 2 заходов

export const maxAttempts = n => n * CLIMB_FAIL_CAP + CLIMB_SLACK

export const initClimb = (n, trap = null) => ({ n, trap, rung: 0, from: 0, attempts: 0, wins: 0, t0: null, timedOut: false, fails: {}, lit: Array.from({ length: n }, () => false), top: false, over: false, last: null, seq: 0, blink: 0, blinkK: 0 })

/** Ступень, на которую идёт следующий заход */
export const targetOf = c => c.rung + 1

/** Начался заход на ступень targetOf(c): счёт заходов +1, прошлое событие (прыжок / соскальзывание) снято; now (мс) — на первом заходе стартует общий таймер */
export const enter = (c, now = null) => ({ ...c, attempts: c.attempts + 1, last: null, t0: c.t0 ?? now })

/**
 * Событие ступени → { climb, hint, trapped }: kind — 'win' | 'miss' | 'fail'; said — какого двойника слова ступени сказал человек (raceTrap.trapSaid; нужен только на miss); hint — номер ступени, на которой Пит должен сказать слово голосом (иначе null);
 * trapped — двойник, на котором осыпалась ловушка (иначе ''): подсказка голосом на этом промахе не нужна, Пит говорит про двойника.
 * Заходов больше потолка (maxAttempts) без вершины — over: nextOf отдаёт плашку вершины, лестница закончена.
 */
export function apply(c, kind, said = null) {
  const k = targetOf(c)
  const stands = c.trap?.state === 'stand' && c.trap.k === k
  if (kind === 'win') {
    const trap = stands ? { ...c.trap, state: 'fell', at: c.seq + 1 } : c.trap // верное слово: ловушка проваливается
    const lit = c.lit.map((_, i) => i < k) // подписи всех взятых ступеней горят
    return { climb: { ...c, trap, from: c.rung, rung: k, lit, wins: c.wins + 1, fails: { ...c.fails, [k]: 0 }, top: k >= c.n, last: 'hit', seq: c.seq + 1 }, hint: null, trapped: '' }
  }
  const f = (c.fails[k] ?? 0) + 1
  const rung = c.rung > 1 ? c.rung - 1 : c.rung // соскользнул на ступень вниз; на первой остаёмся
  const lit = c.lit.map((_, i) => i < rung) // подпись оставленной ступени гаснет
  const crumble = kind === 'miss' && !!said && stands
  const trap = crumble ? { ...c.trap, state: 'crumbled', said, at: c.seq + 1 } : c.trap // сказал двойник: камень осыпается
  const next = { ...c, trap, from: c.rung, rung, lit, fails: { ...c.fails, [k]: f }, last: 'slip', seq: c.seq + 1, blink: f >= BLINK_AT ? c.blink + 1 : c.blink, blinkK: f >= BLINK_AT ? k : c.blinkK }
  next.over = !next.top && next.attempts >= maxAttempts(c.n)
  return { climb: next, hint: f === HINT_AT && !crumble ? k : null, trapped: crumble ? said : '' }
}

/** Время вышло: подъём заканчивается на текущем островке (вершины нет — медали нет) */
export const timeOut = c => ({ ...c, from: c.rung, timedOut: true, last: 'time', seq: c.seq + 1 })

/** Какая ступень-стадия идёт дальше: номер k, 'time' — время вышло, 'top' — подъём закончен (вершина или потолок заходов) */
export const nextOf = c => (c.timedOut ? 'time' : c.top || c.over ? 'top' : targetOf(c))

/** Медаль за вершину: ровно n заходов — золото, не больше n + 2 — серебро, иначе 'finish' (добрался, но без медали); вершины нет — 'none' */
export function medalOf(c) {
  if (!c?.top) return 'none'
  return c.attempts <= c.n ? 'gold' : c.attempts <= c.n + SILVER_EXTRA ? 'silver' : 'finish'
}
