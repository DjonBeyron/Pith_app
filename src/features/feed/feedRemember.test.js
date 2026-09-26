import { describe, it, expect, beforeEach } from 'vitest'

const store = new Map()
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
}
const { nextGap, shownToday, markShown, pickRememberWord, shouldOffer, feedOutcome, REMEMBER_PER_DAY } = await import('./feedRemember.js')

describe('«Помнишь?» в ленте', () => {
  beforeEach(() => store.clear())

  it('раз в 6–8 видео', () => {
    expect([0, 0.5, 0.99].map(r => nextGap(() => r))).toEqual([6, 7, 8])
    expect(shouldOffer({ swipes: 5, gap: 6, shown: 0, word: 'to' })).toBe(false)
    expect(shouldOffer({ swipes: 6, gap: 6, shown: 0, word: 'to' })).toBe(true)
  })

  it('не больше 3 в день; счётчик по дате', () => {
    const d = '2026-09-25'
    for (let i = 0; i < REMEMBER_PER_DAY; i++) markShown(d)
    expect(shownToday(d)).toBe(3)
    expect(shouldOffer({ swipes: 9, gap: 6, shown: shownToday(d), word: 'to' })).toBe(false)
    expect(shownToday('2026-09-26')).toBe(0) // новый день — заново
  })

  it('только если есть что повторять и не «Отпуск»', () => {
    const view = { today: { picked: [{ word: 'to' }, { word: 'cook' }] }, vacation: null }
    expect(pickRememberWord(view)).toBe('to')
    expect(pickRememberWord({ ...view, vacation: { since: '2026-09-20' } })).toBe(null)
    expect(pickRememberWord({ today: { picked: [] } })).toBe(null)
    expect(pickRememberWord(null)).toBe(null)
    expect(shouldOffer({ swipes: 9, gap: 6, shown: 0, word: null })).toBe(false)
  })

  it('исход одной карточки: ошибка — again (без второй попытки), долго — hard', () => {
    expect(feedOutcome({ result: 'know' }, 'c')).toBe('know')
    expect(feedOutcome({ result: 'wrong' }, 'c')).toBe('again')
    expect(feedOutcome({ result: 'correct', timeMs: 800 }, 'c')).toBe('good')
    expect(feedOutcome({ result: 'correct', timeMs: 20_000 }, 'c')).toBe('hard')
  })
})
