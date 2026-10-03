import { describe, it, expect } from 'vitest'
import { moduleWords, phraseInfo, tokenStep, tokenLevel, rankFeed, daySeed, latchRank } from './feedKnowledge.js'

const lessonWord = new Map([
  ['to', 'to'], ['try', 'trying'], ['cook', 'cook'], ['keep', 'keep'], ['go', 'going'], ['a', 'apple'], ['b', 'banana'],
])
const mod = (id, words, extra = {}) => ({ id, lessonIds: ['s', ...words, 'f'], ...extra })
const stepOf = new Map([['trying', 3], ['to', 1], ['keep', 4]])

describe('знание фразы', () => {
  it('слова фразы — середина модуля, без повторов; знакомые, новые, шатающиеся', () => {
    const words = moduleWords(['s', 'try', 'to', 'try', 'cook', 'f'], lessonWord)
    expect(words).toEqual(['trying', 'to', 'cook'])
    expect(phraseInfo(words, stepOf)).toEqual({ total: 3, known: 1, newWords: ['cook'], shaky: ['to'] })
  })

  it('подсветка: шаг слова по его тексту во фразе (регистр, апостроф)', () => {
    expect(tokenStep('Trying', stepOf)).toBe(3)
    expect(tokenStep('xyz', stepOf)).toBe(null)
    expect(tokenStep('to', null)).toBe(null)
  })

  it('цвет слова — ступень памяти: 1–2 небесный, 3–4 жёлтый, 5 салатовый, постоянная — P; нет в памяти — без цвета', () => {
    const steps = new Map([['a', 1], ['b', 2], ['c', 3], ['d', 4], ['e', 5], ['f', 5]])
    const settled = new Set(['f'])
    expect(['a', 'b', 'c', 'd', 'e', 'f'].map(w => tokenLevel(w, steps, settled))).toEqual([1, 1, 2, 2, 3, 'P'])
    expect(tokenLevel('Trying', steps)).toBe(null)
    expect(tokenLevel('A', steps)).toBe(1)
    expect(tokenLevel('a', null)).toBe(null)
  })
})

describe('порядок рекомендаций', () => {
  const allNewHard = mod('new-hard', ['a'], { difficulty: 3 })
  const allNewEasy = mod('new-easy', ['b'], { difficulty: 1 })
  const shaky = mod('shaky', ['to', 'cook'])
  const oneNew = mod('one-new', ['keep', 'go'])
  const noWords = mod('no-words', [])

  it('холодный старт — порядок админа', () => {
    const list = [allNewHard, shaky, oneNew]
    expect(rankFeed(list, { stepOf: new Map(), lessonWord })).toBe(list)
  })

  it('шатающееся и 1–2 новых — вверх; все новые — вниз, проще раньше', () => {
    const out = rankFeed([allNewHard, noWords, allNewEasy, shaky, oneNew], { stepOf, lessonWord })
    expect(out.map(m => m.id)).toEqual(['shaky', 'one-new', 'no-words', 'new-easy', 'new-hard'])
  })

  it('быстро пролистанная фраза и похожая (общее слово) — ниже', () => {
    const similar = mod('similar', ['to', 'keep'])
    const out = rankFeed([shaky, similar, oneNew], { stepOf, lessonWord, skipped: new Set(['shaky']) })
    expect(out.map(m => m.id)).toEqual(['one-new', 'shaky', 'similar'])
  })

  it('каждая 6-я позиция — случайная из хвоста; в пределах дня порядок стабилен', () => {
    const many = Array.from({ length: 14 }, (_, i) => mod(`m${i}`, i < 4 ? ['to'] : ['a']))
    const a = rankFeed(many, { stepOf, lessonWord, seed: daySeed('2026-09-25') })
    const b = rankFeed(many, { stepOf, lessonWord, seed: daySeed('2026-09-25') })
    expect(a.map(m => m.id)).toEqual(b.map(m => m.id))
    expect(a.slice(0, 4).map(m => m.id)).toEqual(['m0', 'm1', 'm2', 'm3'])
    expect(new Set(a.map(m => m.id)).size).toBe(14)
    expect(a[5].id).not.toBe('m5')
  })
})

describe('latchRank — порядок ленты не меняется под пальцем', () => {
  const a = { seed: 1 }
  const b = { seed: 2 }
  it('первая карта памяти берётся сразу, даже при видимой ленте', () => {
    expect(latchRank(null, a, true)).toBe(a)
  })
  it('пока лента на экране, новая карта не подменяет прежнюю', () => {
    expect(latchRank(a, b, true)).toBe(a)
  })
  it('лента скрыта — новая карта принимается', () => {
    expect(latchRank(a, b, false)).toBe(b)
  })
})
