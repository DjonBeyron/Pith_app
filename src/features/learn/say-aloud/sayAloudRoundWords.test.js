import { describe, it, expect } from 'vitest'
import { pickRoundFromWords, canSayAloudWords, playableFrom, ROUND_MAX, MIN_TO_SHOW } from './sayAloudRound.js'

// Раунд из готового списка слов (итог повторения, где лестницы нет): [{ word, translation, due, step }]
const w = (word, translation, due, step = 1) => ({ word, translation, due, step })
const list = [
  w('cat', 'кот', '2026-10-30'), w('dog', 'собака', '2026-10-28'), w('sun', 'солнце', '2026-10-29', 2),
  w('cup', 'чашка', '2026-11-02', 3), w('tree', 'дерево', '2026-10-27'), w('book', 'книга', '2026-11-05', 4),
  w('milk', 'молоко', '2026-11-20', 5), w('rain', 'дождь', '2026-10-31', 2), w('road', 'дорога', '2026-11-01'), w('bird', 'птица', '2026-11-03'),
]

describe('pickRoundFromWords', () => {
  it('ближайший срок первым, не больше ROUND_MAX, на выходе только word и translation', () => {
    const r = pickRoundFromWords(list)
    expect(r).toHaveLength(ROUND_MAX)
    expect(r.map(x => x.word).slice(0, 4)).toEqual(['tree', 'dog', 'sun', 'cat'])
    expect(r[0]).toEqual({ word: 'tree', translation: 'дерево' })
  })
  it('слова без перевода, с цифрами/кириллицей и повторы отбрасываются', () => {
    const mixed = [w('cat', 'кот', '2026-10-30'), w('dog', '', '2026-10-28'), w('b2b', 'сделка', '2026-10-28'), w('кот', 'cat', '2026-10-28'), w('cat', 'кот', '2026-10-29'), w('sun', 'солнце', '2026-10-29'), w('cup', 'чашка', '2026-11-02')]
    expect(playableFrom(mixed).map(x => x.word)).toEqual(['cat', 'sun', 'cup'])
  })
  it('меньше MIN_TO_SHOW (3) подходящих слов — раунда нет; ровно 3 — есть', () => {
    expect(MIN_TO_SHOW).toBe(3)
    expect(pickRoundFromWords(list.slice(0, 2))).toEqual([])
    expect(pickRoundFromWords(list.slice(0, 3))).toHaveLength(3)
  })
  it('пусто и null не падают', () => {
    expect(pickRoundFromWords([])).toEqual([])
    expect(pickRoundFromWords(null)).toEqual([])
    expect(canSayAloudWords(undefined)).toBe(false)
  })
})

describe('canSayAloudWords', () => {
  it('нужно ≥ 3 подходящих слов, а не просто ≥ 3 строк', () => {
    expect(canSayAloudWords(list.slice(0, 3))).toBe(true)
    expect(canSayAloudWords([list[0], list[1], w('x1', 'икс', '2026-10-28'), w('no', '', '2026-10-28')])).toBe(false)
  })
})
