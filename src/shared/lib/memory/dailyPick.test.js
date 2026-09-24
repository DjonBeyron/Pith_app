import { describe, it, expect } from 'vitest'
import { pickToday, dailyCardBudget, cardsForStep } from './dailyPick.js'

const TODAY = '2026-09-24'
const m = (word, step, due_on) => ({ word, step, due_on })

describe('dailyCardBudget', () => {
  it('минуты → карточки, неизвестное значение → как 5 минут', () => {
    expect(dailyCardBudget(5)).toBe(8)
    expect(dailyCardBudget(10)).toBe(14)
    expect(dailyCardBudget(15)).toBe(20)
    expect(dailyCardBudget(undefined)).toBe(8)
  })
})

describe('cardsForStep', () => {
  it('слабому 2 карточки, крепкому 1', () => {
    expect(cardsForStep(1)).toBe(2)
    expect(cardsForStep(2)).toBe(2)
    expect(cardsForStep(3)).toBe(1)
    expect(cardsForStep(5)).toBe(1)
  })
})

describe('pickToday', () => {
  it('берёт только созревшие слова', () => {
    const res = pickToday([m('to', 1, TODAY), m('please', 1, '2026-09-25')], { today: TODAY, budget: 8 })
    expect(res.map(r => r.word)).toEqual(['to'])
  })

  it('сначала слабые, среди равных — дольше ждущие', () => {
    const res = pickToday([
      m('strong', 4, '2026-09-01'),
      m('weakNew', 1, '2026-09-23'),
      m('weakOld', 1, '2026-09-10'),
    ], { today: TODAY, budget: 20 })
    expect(res.map(r => r.word)).toEqual(['weakOld', 'weakNew', 'strong'])
  })

  it('не превышает бюджет карточек; остаток — не долг, просто не взят', () => {
    const mem = ['a', 'b', 'c', 'd', 'e'].map(w => m(w, 1, TODAY))
    const res = pickToday(mem, { today: TODAY, budget: 8 })
    expect(res.reduce((s, r) => s + r.cards, 0)).toBe(8)
    expect(res).toHaveLength(4)
  })

  it('последнему слову урезает карточки под остаток бюджета', () => {
    const res = pickToday([m('a', 1, TODAY), m('b', 1, TODAY)], { today: TODAY, budget: 3 })
    expect(res).toEqual([{ word: 'a', step: 1, cards: 2 }, { word: 'b', step: 1, cards: 1 }])
  })

  it('слово без колоды пропускается', () => {
    const res = pickToday([m('a', 1, TODAY), m('b', 1, TODAY)], {
      today: TODAY, budget: 8, canReview: w => w !== 'a',
    })
    expect(res.map(r => r.word)).toEqual(['b'])
  })

  it('пустая память и нулевой бюджет → пусто', () => {
    expect(pickToday([], { today: TODAY, budget: 8 })).toEqual([])
    expect(pickToday([m('a', 1, TODAY)], { today: TODAY, budget: 0 })).toEqual([])
  })
})
