import { describe, it, expect } from 'vitest'
import { createReviewTracker } from './reviewTracker.js'

describe('события аналитики сессии', () => {
  function setup() {
    const sent = []
    let t = 1000
    const tr = createReviewTracker((name, props) => sent.push([name, props]), () => t)
    return { sent, tr, tick: ms => { t += ms } }
  }

  it('старт → ответы → итог: ошибки посчитаны, время от старта', () => {
    const { sent, tr, tick } = setup()
    tr.start({ words: 2, cards: 3 })
    tr.answer({ word: 'to', result: 'wrong', attempt: 1, timeMs: 900, answered: 1, total: 4 })
    tr.answer({ word: 'to', result: 'correct', attempt: 2, timeMs: 700, answered: 2, total: 4 })
    tick(5000)
    tr.finish({ words: 2, xp: 4 })
    tr.abandon() // после итога — тишина
    expect(sent).toEqual([
      ['review_start', { words: 2, cards: 3 }],
      ['review_answer', { word: 'to', result: 'wrong', attempt: 1, ms: 900 }],
      ['review_answer', { word: 'to', result: 'correct', attempt: 2, ms: 700 }],
      ['review_finish', { words: 2, cards: 4, errors: 1, ms: 5000, xp: 4 }],
    ])
  })

  it('закрыли посреди сессии — «брошена» один раз; до старта — ничего', () => {
    const { sent, tr, tick } = setup()
    tr.abandon()
    tr.answer({ word: 'x', result: 'know', attempt: 1, answered: 1, total: 1 })
    expect(sent).toEqual([])
    tr.start({ words: 1, cards: 2 })
    tr.answer({ word: 'x', result: 'know', attempt: 1, answered: 1, total: 2 })
    tick(1200)
    tr.abandon()
    tr.abandon()
    expect(sent.slice(-1)).toEqual([['review_abandon', { answered: 1, total: 2, ms: 1200 }]])
    expect(sent.filter(([n]) => n === 'review_abandon')).toHaveLength(1)
  })
})
