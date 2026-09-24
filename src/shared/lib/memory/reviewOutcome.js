import { THRESHOLD_SLOW } from '../skillScore.js'

// Исход слова за одну сессию повторения — по ответам на его карточки.
// Шаг памяти по этому исходу меняет СЕРВЕР (RPC memory_review_word, миграция
// 20260924120000_word_memory.sql); здесь только перевод ответов в исход.
//
// events: [{ cardId, result: 'correct' | 'wrong' | 'know', timeMs }] в порядке
// ответа. Карточка с ошибкой возвращается в конец колоды один раз, поэтому у
// одной карточки бывает два ответа: wrong → correct (исправил на возврате).
//
// Возвращает:
//   'fail'  — хоть одна карточка неверна и на возврате   (сервер: шаг −2)
//   'again' — ошиблся, но на возврате исправил            (шаг −1)
//   'hard'  — всё верно, но хоть раз дольше THRESHOLD_SLOW (шаг тот же)
//   'good'  — всё верно и быстро                           (шаг +1)
//   'know'  — ни одного ответа, только «Знаю»              (шаг +1)
//   null    — ответов нет вовсе
export function reviewOutcome(events) {
  if (!events?.length) return null

  const byCard = new Map()
  for (const e of events) {
    const key = e.cardId ?? '?'
    if (!byCard.has(key)) byCard.set(key, [])
    byCard.get(key).push(e)
  }

  let fail = false, again = false, slow = false, answered = false
  for (const list of byCard.values()) {
    const real = list.filter(e => e.result !== 'know')
    if (!real.length) continue
    answered = true
    if (real[0].result === 'wrong') {
      if (real.some(e => e.result === 'correct')) again = true
      else fail = true
    } else if ((real[0].timeMs ?? 0) > THRESHOLD_SLOW) {
      slow = true
    }
  }

  if (fail) return 'fail'
  if (again) return 'again'
  if (!answered) return 'know'
  return slow ? 'hard' : 'good'
}
