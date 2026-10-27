// Раунд «Порядок»: дорожки перемешаны (подписаны кусками), диктор произносит подсказку — ученик тапает дорожки. Подсказка — один кусок (тапнуть его дорожку) или вся фраза (тапнуть дорожки
// в том порядке, в каком куски прозвучали). Чистая логика без DOM — проверяется тестами. Ошибка не штрафуется: дорожка дрожит, подсказка звучит снова, после HINT_AFTER ошибок подсвечивается верная.
export const HINT_AFTER = 2          // столько ошибок на подсказке — и верная дорожка подсвечивается
export const REPLAY_MS = 6000        // ученик молчит дольше — подсказку озвучивают ещё раз

/** lanes — перестановка: lane → номер куска (wordLaneRecipe.orderLanes) */
export function createOrderGame({ prompts, lanes }) {
  return { prompts, lanes, i: 0, tapped: [], wrong: 0, mistakes: 0, finished: !prompts.length }
}

/** Дорожки, которые надо тапнуть на текущей подсказке, по порядку */
export const expectedLanes = g => (g.finished ? [] : g.prompts[g.i].parts.map(chunk => g.lanes.indexOf(chunk)))

/**
 * Тап по дорожке lane. Возвращает событие:
 *  { type: 'ok', lane, step } — верно (step — сколько тапов сделано на этой подсказке);
 *  { type: 'next', lane, prompt } — подсказка пройдена, prompt — следующая (или null — раунд закончен: сразу же идёт { type: 'done' }) — приходят массивом;
 *  { type: 'wrong', lane, expected, hint } — не та дорожка (hint — подсветить верную).
 * Всегда массив событий.
 */
export function tapLane(g, lane) {
  if (g.finished) return []
  const exp = expectedLanes(g)
  const want = exp[g.tapped.length]
  if (lane !== want) {
    g.wrong += 1; g.mistakes += 1
    return [{ type: 'wrong', lane, expected: want, hint: g.wrong >= HINT_AFTER }]
  }
  g.tapped.push(lane)
  const out = [{ type: 'ok', lane, step: g.tapped.length }]
  if (g.tapped.length === exp.length) {
    g.i += 1; g.tapped = []; g.wrong = 0
    if (g.i >= g.prompts.length) { g.finished = true; out.push({ type: 'next', lane, prompt: null }, { type: 'done', mistakes: g.mistakes }) }
    else out.push({ type: 'next', lane, prompt: g.prompts[g.i] })
  }
  return out
}
