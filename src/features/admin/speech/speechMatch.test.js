import { describe, it, expect } from 'vitest'
import { tokenize, levenshtein, tolerance, matchPhrase, matchBest } from './speechMatch.js'

const REF = 'I am trying to please both'

describe('tokenize', () => {
  it('регистр, знаки препинания, типографские апострофы', () => {
    expect(tokenize('Hello,  World!')).toEqual(['hello', 'world'])
    expect(tokenize('Don’t')).toEqual(['do', 'not'])
  })
  it('сокращения раскрываются', () => {
    expect(tokenize("I'm here")).toEqual(['i', 'am', 'here'])
    expect(tokenize("don't go")).toEqual(['do', 'not', 'go'])
    expect(tokenize("can't")).toEqual(tokenize('cannot'))
  })
  it('пусто и null', () => {
    expect(tokenize('')).toEqual([])
    expect(tokenize(null)).toEqual([])
    expect(tokenize(' ... ')).toEqual([])
  })
})

describe('levenshtein / tolerance', () => {
  it('расстояния', () => {
    expect(levenshtein('please', 'please')).toBe(0)
    expect(levenshtein('please', 'pleas')).toBe(1)
    expect(levenshtein('kitten', 'sitting')).toBe(3)
    expect(levenshtein('', 'abc')).toBe(3)
  })
  it('допуск растёт с длиной', () => {
    expect(tolerance(2)).toBe(0)
    expect(tolerance(4)).toBe(1)
    expect(tolerance(7)).toBe(2)
    expect(tolerance(10)).toBe(3)
  })
})

describe('matchPhrase', () => {
  it('точное совпадение', () => {
    const r = matchPhrase(REF, 'I am trying to please both')
    expect(r.ratio).toBe(1)
    expect(r.missed).toEqual([])
    expect(r.extra).toEqual([])
    expect(r.passed).toBe(true)
  })
  it('регистр и знаки не влияют', () => {
    expect(matchPhrase(REF, 'i am trying, to please: BOTH!').ratio).toBe(1)
  })
  it('пропущенное слово', () => {
    const r = matchPhrase(REF, 'I am trying please both')
    expect(r.missed).toEqual(['to'])
    expect(r.ratio).toBeCloseTo(5 / 6)
    expect(r.passed).toBe(true)
    expect(r.items.find(it => it.word === 'to').ok).toBe(false)
  })
  it('лишнее слово не снижает долю, но попадает в extra', () => {
    const r = matchPhrase(REF, 'I am really trying to please both')
    expect(r.extra).toEqual(['really'])
    expect(r.ratio).toBe(1)
  })
  it('сокращение «I\'m» = «I am»', () => {
    expect(matchPhrase(REF, "I'm trying to please both").ratio).toBe(1)
    expect(matchPhrase("I'm trying to please both", 'I am trying to please both').ratio).toBe(1)
    expect(matchPhrase("I don't know", 'I do not know').ratio).toBe(1)
  })
  it('порядок слов не важен', () => {
    expect(matchPhrase(REF, 'both to please trying am I').ratio).toBe(1)
  })
  it('опечатка в пределах допуска засчитывается, ошибка сильнее — нет', () => {
    expect(matchPhrase(REF, 'I am tryin to pleas both').ratio).toBe(1)
    expect(matchPhrase('both', 'boat').ratio).toBe(0)
  })
  it('короткие слова только точно', () => {
    expect(matchPhrase('to', 'do').ratio).toBe(0)
  })
  it('повторяющиеся слова сопоставляются по одному', () => {
    const r = matchPhrase('go go go', 'go go')
    expect(r.matched.length).toBe(2)
    expect(r.missed).toEqual(['go'])
  })
  it('пустое услышанное и пустой эталон', () => {
    const a = matchPhrase(REF, '')
    expect(a.ratio).toBe(0)
    expect(a.missed.length).toBe(6)
    expect(a.passed).toBe(false)
    const b = matchPhrase('', 'hello')
    expect(b.ratio).toBe(0)
    expect(b.extra).toEqual(['hello'])
    expect(b.passed).toBe(false)
  })
  it('ключевые слова: без них не засчитано даже при высокой доле', () => {
    const r = matchPhrase(REF, 'I am trying to please', ['both'])
    expect(r.ratio).toBeCloseTo(5 / 6)
    expect(r.passed).toBe(false)
    expect(matchPhrase(REF, 'I am trying to please both', ['both']).passed).toBe(true)
    expect(matchPhrase(REF, 'I am trying to please', ['absent']).passed).toBe(true)
  })
  it('порог 0.7', () => {
    expect(matchPhrase('one two three four five six seven eight nine ten', 'one two three four five six seven').passed).toBe(true)
    expect(matchPhrase('one two three four five six seven eight nine ten', 'one two three four five six').passed).toBe(false)
  })
})

describe('matchBest', () => {
  it('берёт лучшую из альтернатив', () => {
    const r = matchBest(REF, ['I am crying to freeze both', 'I am trying to please both', 'am trying'])
    expect(r.index).toBe(1)
    expect(r.ratio).toBe(1)
    expect(r.text).toBe('I am trying to please both')
  })
  it('нет альтернатив', () => {
    const r = matchBest(REF, [])
    expect(r.index).toBe(-1)
    expect(r.passed).toBe(false)
  })
})
