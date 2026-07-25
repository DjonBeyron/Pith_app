import { describe, it, expect } from 'vitest'
import { splitTitleTokens, titleWords, wordTranslation, buildWordRows, remapWordRows } from './titleWords.js'

describe('splitTitleTokens', () => {
  it('отделяет слова от знаков препинания', () => {
    const tokens = splitTitleTokens('Nice to meet you!')
    expect(tokens.filter(t => t.word).map(t => t.text)).toEqual(['Nice', 'to', 'meet', 'you'])
    // фраза собирается обратно один в один
    expect(tokens.map(t => t.text).join('')).toBe('Nice to meet you!')
  })

  it('дефис и апостроф остаются внутри слова', () => {
    expect(titleWords("don't be well-known, ok?")).toEqual(["don't", 'be', 'well-known', 'ok'])
  })

  it('нумерует слова подряд, пропуская разделители', () => {
    const words = splitTitleTokens('a, b c').filter(t => t.word)
    expect(words.map(t => t.index)).toEqual([0, 1, 2])
  })
})

describe('wordTranslation', () => {
  const entries = [{ w: 'nice', t: 'приятно' }, { w: 'you', t: 'ты' }]

  it('находит по позиции', () => {
    expect(wordTranslation(entries, 'nice', 0)).toBe('приятно')
  })

  it('находит по самому слову, если позиция сдвинулась', () => {
    expect(wordTranslation(entries, 'you', 5)).toBe('ты')
  })

  it('не путает регистр и возвращает пусто для незнакомого слова', () => {
    expect(wordTranslation(entries, 'YOU', 1)).toBe('ты')
    expect(wordTranslation(entries, 'meet', 2)).toBe('')
  })
})

describe('buildWordRows / remapWordRows', () => {
  it('строит поля под каждое слово названия', () => {
    expect(buildWordRows('nice you', [{ w: 'you', t: 'ты' }]))
      .toEqual([{ w: 'nice', t: '' }, { w: 'you', t: 'ты' }])
  })

  it('не теряет перевод, пока правишь само слово (число слов то же)', () => {
    const rows = [{ w: 'hello', t: 'привет' }]
    expect(remapWordRows('hell', rows)).toEqual([{ w: 'hell', t: 'привет' }])
  })

  it('при добавлении слова переводы остальных на месте', () => {
    const rows = [{ w: 'hello', t: 'привет' }]
    expect(remapWordRows('hello world', rows))
      .toEqual([{ w: 'hello', t: 'привет' }, { w: 'world', t: '' }])
  })
})
