// Раунд «Порядок» — на время, как конвейер. Дорожки перемешаны и подписаны кусками фразы. На каждую подсказку диктора выкатываются пилюли (по одной в каждой дорожке) и едут вниз с постоянной
// скоростью; пока они на экране, ученик должен тапнуть ПРАВИЛЬНЫЕ дорожки: подсказка — один кусок (тап по его дорожке) или вся фраза (тап по дорожкам в порядке звучания). Успел — пилюля
// заливается и щёлкает; не успел (пилюли ушли вниз) — «не успел», та же подсказка звучит снова (до ORDER_MAX_TRIES раз, потом идём дальше). Неверная дорожка не штрафуется: дрожит, после
// HINT_AFTER ошибок верная подсвечивается кольцом. Чистая логика без DOM — время приходит аргументом, проверяется тестами.
import { ENTER_Y, SPEED } from './wordLaneTimeline.js'
import { CLAIM_FROM_Y, FAIL_Y } from './wordLaneStudent.js'

export const HINT_AFTER = 2          // столько ошибок на подсказке — и верная дорожка подсвечивается
export const ORDER_MAX_TRIES = 3     // сколько раз подсказка выкатывается, если ученик не успел
export const ORDER_START_MS = 500    // пауза перед первой подсказкой
export const ORDER_GAP_MS = 900      // пауза между подсказками (и перед повтором после «не успел»)
export const ORDER_SAY_DELAY_MS = 700 // диктор называет кусок через столько после выкатки — пилюли уже видны

/** lanes — перестановка: lane → номер куска (wordLaneRecipe.orderLanes) */
export function createOrderGame({ prompts, lanes, maxTries = ORDER_MAX_TRIES }) {
  return { prompts, lanes, maxTries, i: 0, tries: 0, state: prompts.length ? 'gap' : 'done', spawnAt: 0, nextAt: ORDER_START_MS, tapped: [], wrong: 0, mistakes: 0, lost: 0, said: false, finished: !prompts.length }
}

/** Дорожки, которые надо тапнуть на текущей подсказке, по порядку */
export const expectedLanes = g => (g.finished ? [] : g.prompts[g.i].parts.map(chunk => g.lanes.indexOf(chunk)))

/** Высота центра пилюль текущей подсказки в момент t (все дорожки едут вместе) */
export const orderY = (g, t) => ENTER_Y + (SPEED * (t - g.spawnAt)) / 1000

/**
 * Шаг игры в момент t. События: spawn { prompt, tries } — выкатить пилюли; say { parts } — диктор называет подсказку; fail { prompt, lost } — не успел; done { mistakes, lost } — раунд закончен.
 */
export function stepOrder(g, t) {
  const out = []
  if (g.finished) return out
  if (g.state === 'gap' && t >= g.nextAt) {
    g.state = 'fly'; g.spawnAt = t; g.tapped = []; g.wrong = 0; g.said = false
    out.push({ type: 'spawn', prompt: g.prompts[g.i], tries: g.tries })
  }
  if (g.state === 'fly') {
    if (!g.said && t >= g.spawnAt + ORDER_SAY_DELAY_MS) { g.said = true; out.push({ type: 'say', parts: g.prompts[g.i].parts }) }
    if (orderY(g, t) > FAIL_Y) {
      g.tries += 1
      const lost = g.tries >= g.maxTries
      out.push({ type: 'fail', prompt: g.prompts[g.i], lost })
      g.state = 'gap'; g.nextAt = t + ORDER_GAP_MS
      if (lost) { g.lost += 1; g.i += 1; g.tries = 0 }
      if (g.i >= g.prompts.length) { g.finished = true; g.state = 'done'; out.push({ type: 'done', mistakes: g.mistakes, lost: g.lost }) }
    }
  }
  return out
}

/**
 * Тап по дорожке lane в момент t (пилюли должны быть видны). События:
 *  { type: 'ok', lane, step } — верно (step — сколько тапов сделано на этой подсказке);
 *  { type: 'next', prompt } — подсказка пройдена (prompt — следующая или null); затем при конце раунда { type: 'done' };
 *  { type: 'wrong', lane, expected, hint } — не та дорожка (hint — подсветить верную). Всегда массив.
 */
export function tapLane(g, lane, t) {
  if (g.finished || g.state !== 'fly') return []
  const y = orderY(g, t)
  if (y < CLAIM_FROM_Y || y > FAIL_Y) return []
  const exp = expectedLanes(g)
  const want = exp[g.tapped.length]
  if (lane !== want) {
    g.wrong += 1; g.mistakes += 1
    return [{ type: 'wrong', lane, expected: want, hint: g.wrong >= HINT_AFTER }]
  }
  g.tapped.push(lane)
  const out = [{ type: 'ok', lane, step: g.tapped.length }]
  if (g.tapped.length === exp.length) {
    g.i += 1; g.tries = 0; g.tapped = []; g.wrong = 0
    g.state = 'gap'; g.nextAt = t + ORDER_GAP_MS
    out.push({ type: 'next', prompt: g.prompts[g.i] ?? null })
    if (g.i >= g.prompts.length) { g.finished = true; g.state = 'done'; out.push({ type: 'done', mistakes: g.mistakes, lost: g.lost }) }
  }
  return out
}
