import { describe, it, expect } from 'vitest'
import { initialCatch, pickWord, press, backspace, help, check, reveal, closePanel, remainingOf, wordAt } from './catchState.js'
import { catchWords } from './feedCatch.js'

// Фраза из трёх слов; память не нужна — уровни тут не важны
const words = catchWords('I like cats!', null)

function typeAll(s, text) {
  for (const ch of text.toLowerCase()) s = press(s, words, ch)
  return s
}

describe('pickWord', () => {
  it('открывает панель и делает слово текущим', () => {
    const s = pickWord(initialCatch('m1'), words, 1)
    expect(s.open).toBe(true)
    expect(s.current).toBe(1)
    expect(s.typed).toBe('')
  })
  it('несуществующее и уже набранное слово — игнор', () => {
    const s0 = initialCatch()
    expect(pickWord(s0, words, 7)).toBe(s0)
    const typed = { ...s0, typedIdx: new Set([1]) }
    expect(pickWord(typed, words, 1)).toBe(typed)
  })
  it('смена слова сбрасывает набранное', () => {
    let s = pickWord(initialCatch(), words, 1)
    s = typeAll(s, 'li')
    s = pickWord(s, words, 2)
    expect(s.current).toBe(2)
    expect(s.typed).toBe('')
  })
})

describe('press / backspace', () => {
  it('печатает только когда есть текущее слово, первая буква заглавная', () => {
    const s0 = initialCatch()
    expect(press(s0, words, 'l')).toBe(s0)
    const s = typeAll(pickWord(s0, words, 1), 'li')
    expect(s.typed).toBe('Li')
    expect(backspace(s).typed).toBe('L')
    expect(backspace(s0)).toBe(s0)
  })
  it('не растёт бесконечно (typedMax)', () => {
    const s = typeAll(pickWord(initialCatch(), words, 1), 'likeeeeeeeeeee')
    expect(s.typed.length).toBe('like'.length + 3)
  })
})

describe('check', () => {
  it('пусто → null, неверно → wrong (набранное остаётся)', () => {
    const s = pickWord(initialCatch(), words, 1)
    expect(check(s, words)).toEqual({ state: s, result: null })
    const wrong = typeAll(s, 'lake')
    const r = check(wrong, words)
    expect(r.result).toBe('wrong')
    expect(r.state.typed).toBe('Lake')
  })
  it('верно → слово набрано, текущее сброшено, панель открыта, пока есть слова', () => {
    const r = check(typeAll(pickWord(initialCatch(), words, 1), 'LIKE'), words)
    expect(r.result).toBe('correct')
    expect([...r.state.typedIdx]).toEqual([1])
    expect(r.state.current).toBeNull()
    expect(r.state.open).toBe(true)
    expect(r.state.done).toBe(false)
    expect(remainingOf(r.state, words)).toBe(2)
  })
  it('последнее слово → done и панель закрыта', () => {
    let s = initialCatch()
    for (const w of words) s = check(typeAll(pickWord(s, words, w.index), w.text), words).state
    expect(s.done).toBe(true)
    expect(s.open).toBe(false)
    expect(remainingOf(s, words)).toBe(0)
  })
  it('после done ничего не меняется', () => {
    const s = reveal(pickWord(initialCatch(), words, 0))
    expect(pickWord(s, words, 1)).toBe(s)
    expect(check(s, words).result).toBeNull()
  })
})

describe('help / reveal / closePanel', () => {
  it('help — один раз на текущее слово', () => {
    const s0 = initialCatch()
    expect(help(s0)).toBe(s0)
    const s = help(pickWord(s0, words, 2))
    expect(s.helped.has(2)).toBe(true)
    expect(help(s)).toBe(s)
  })
  it('reveal закрывает панель и заканчивает задание, набранные остаются', () => {
    const typed = check(typeAll(pickWord(initialCatch(), words, 0), 'i'), words).state
    const s = reveal(pickWord(typed, words, 1))
    expect(s.done).toBe(true)
    expect(s.open).toBe(false)
    expect(s.current).toBeNull()
    expect(s.typedIdx.has(0)).toBe(true)
  })
  it('closePanel при уходе со слайда: панель закрыта, текущее сброшено, набранные остаются', () => {
    const s0 = initialCatch()
    expect(closePanel(s0)).toBe(s0)
    const typed = check(typeAll(pickWord(s0, words, 0), 'i'), words).state
    const s = closePanel(typeAll(pickWord(typed, words, 1), 'li'))
    expect(s.open).toBe(false)
    expect(s.current).toBeNull()
    expect(s.typed).toBe('')
    expect(s.typedIdx.has(0)).toBe(true)
    expect(s.done).toBe(false)
  })
  it('wordAt', () => {
    expect(wordAt(words, 2).text).toBe('cats')
    expect(wordAt(words, 9)).toBeNull()
  })
})
