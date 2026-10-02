import { describe, it, expect } from 'vitest'
import { diagnoseReview } from './reviewDiagnosis.js'

const TODAY = '2026-10-02'
const row = (word, due_on) => ({ word, due_on })
// Журнал: n сессий сегодня, в каждой по одной карточке
const log = n => Array.from({ length: n }, (_, i) => ({ source: 'review', created_at: `${TODAY}T10:0${i % 10}:00`, events: [{ cardId: `c${i}` }] }))
const base = { minutes: 5, deckWords: new Set(['trying', 'cook']), today: TODAY }

describe('диагностика «почему вкладка Память молчит»', () => {
  it('всё в порядке: слова к повтору есть, колода есть, бюджет не тронут', () => {
    const d = diagnoseReview({ ...base, rows: [row('trying', TODAY)], reviews: [] })
    expect(d).toMatchObject({ due: 1, ready: 1, shown: 0, budget: 8, left: 8, blocked: null })
  })

  it('бюджет дня исчерпан: слова к повтору есть, а предложить нечего', () => {
    const d = diagnoseReview({ ...base, rows: [row('trying', '2026-10-01')], reviews: log(8) })
    expect(d).toMatchObject({ due: 1, ready: 1, shown: 8, left: 0, blocked: 'budget' })
  })

  it('«прожить день» сдвигает журнал на вчера — бюджет свободен', () => {
    const yesterday = log(8).map(r => ({ ...r, created_at: r.created_at.replace(TODAY, '2026-10-01') }))
    const d = diagnoseReview({ ...base, rows: [row('trying', TODAY)], reviews: yesterday })
    expect(d).toMatchObject({ shown: 0, left: 8, blocked: null })
  })

  it('у слова нет колоды: в расписание оно не попадает', () => {
    const d = diagnoseReview({ ...base, rows: [row('plan', TODAY)], reviews: [] })
    expect(d).toMatchObject({ due: 1, ready: 0, blocked: 'deck' })
  })

  it('сроки в будущем — молчать не о чем', () => {
    const d = diagnoseReview({ ...base, rows: [row('trying', '2026-10-05')], reviews: log(8) })
    expect(d).toMatchObject({ due: 0, ready: 0, blocked: null })
  })

  it('бюджет зависит от минут в день', () => {
    expect(diagnoseReview({ ...base, minutes: 15, rows: [], reviews: [] }).budget).toBe(20)
  })
})
