import { describe, it, expect } from 'vitest'
import { weakWords, weakTone, WEAK_MAX, WEAK_R1, WEAK_R2 } from './raceWeak.js'

const miss = { hit: false, miss: false }, ok = { hit: true, miss: false }
const sprint = (extra = {}) => ({ words: ['a', 'b', 'c', 'd'], caps: { a: 'а', b: 'б', c: 'в', d: 'г' }, results: { 0: ok, 1: miss, 2: ok, 3: miss }, r2: null, ...extra })

describe('«Самые слабые слова»: raceWeak', () => {
  it('счёт: ошибка в круге 1 = 2, в круге 2 = 3, верно = 0; слабые первыми, при равном счёте — по порядку выезда', () => {
    expect(WEAK_R1).toBe(2); expect(WEAK_R2).toBe(3)
    const list = weakWords(sprint())
    expect(list.map(w => [w.text, w.score])).toEqual([['b', 2], ['d', 2], ['a', 0], ['c', 0]])
    expect(list[0]).toEqual({ text: 'b', translation: 'б', score: 2, tone: 'yellow' })
  })
  it('второй круг: не дался снова — 5 (красный), удался — остаётся 2; слово из круга 2 ошиблось, хотя в круге 1 было верно, — 3', () => {
    const list = weakWords(sprint({ r2: { words: ['d', 'b', 'a'], results: { 0: miss, 1: ok, 2: miss } } }))
    expect(list.map(w => [w.text, w.score, w.tone])).toEqual([['d', 5, 'red'], ['a', 3, 'red'], ['b', 2, 'yellow'], ['c', 0, 'green']])
  })
  it('цвет по счёту: 0 — зелёный, 1–2 — жёлтый, от 3 — красный', () => {
    expect([0, 1, 2, 3, 5].map(weakTone)).toEqual(['green', 'yellow', 'yellow', 'red', 'red'])
  })
  it('не больше 8 чипов; пустой и отсутствующий разгон — пустой список; без перевода — пустая строка', () => {
    const words = Array.from({ length: 10 }, (_, i) => `w${i}`)
    expect(weakWords({ words, caps: {}, results: {}, r2: null })).toHaveLength(WEAK_MAX)
    expect(weakWords({ words, caps: {}, results: {}, r2: null })[0].translation).toBe('')
    expect(weakWords(null)).toEqual([]); expect(weakWords({ words: [], results: {} })).toEqual([])
  })
})
