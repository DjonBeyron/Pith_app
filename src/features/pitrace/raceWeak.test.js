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

describe('«Самые слабые слова»: оба этапа', () => {
  const stages = (sp, ct) => ({ sprint: sprint(sp), catch: { words: ['c', 'a', 'b', 'd'], caps: { a: 'а', b: 'б', c: 'в', d: 'г' }, traps: [false, true, false, true], results: {}, r2: null, ...ct } })
  it('счёт — сумма по этапам: ошибка в «Слушай и лови» = 2 (в круге 2 = 3), «поверил чужому переводу» = 2 на слово, которое сказал Пит; верно и пропущенная ловушка = 0', () => {
    const race = stages({}, { results: { 0: ok, 1: { hit: true, miss: true, believed: true, trap: true }, 2: { hit: false, miss: true }, 3: { hit: true, miss: false, trap: true } } })
    const list = weakWords(race)
    expect(list.map(w => [w.text, w.score])).toEqual([['b', 4], ['a', 2], ['d', 2], ['c', 0]]) // b: разгон 2 + катч 2; a: катч «поверил» 2; d: разгон 2; c: 0
    expect(list[0].translation).toBe('б'); expect(list[0].tone).toBe('red')
  })
  it('второй круг слуха: ошибка снова — +3; слова только из слуха (нет в разгоне) тоже попадают в список', () => {
    const race = stages({ words: ['a', 'b'], results: { 0: ok, 1: ok } }, { words: ['a', 'x'], caps: { a: 'а', x: 'икс' }, results: { 0: miss, 1: ok }, r2: { words: ['a'], results: { 0: miss } } })
    expect(weakWords(race).map(w => [w.text, w.score])).toEqual([['a', 5], ['b', 0], ['x', 0]])
    expect(weakWords(race)[2].translation).toBe('икс')
  })
  it('без слуха (только разгон) результат тот же, что у одного этапа', () => {
    expect(weakWords({ sprint: sprint(), catch: undefined }).map(w => w.score)).toEqual(weakWords(sprint()).map(w => w.score))
  })
})
