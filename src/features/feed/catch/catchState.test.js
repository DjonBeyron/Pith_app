import { describe, it, expect } from 'vitest'
import {
  initialCatch, openSheet, setCurrent, press, backspace, next, help, check, reveal, finish, closeSheet,
  wordAt, typedOf, isLast, okCount,
} from './catchState.js'
import { catchWords } from './feedCatch.js'

// Фраза из трёх слов; память не нужна — уровни тут не важны
const words = catchWords('I like cats!', null)

function typeAll(s, text) {
  for (const ch of text.toLowerCase()) s = press(s, words, ch)
  return s
}

describe('openSheet / setCurrent', () => {
  it('открывает шторку, активное — первое слово', () => {
    const s = openSheet(initialCatch('m1'), words)
    expect(s.open).toBe(true)
    expect(s.cur).toBe(0)
    expect(s.phase).toBe('type')
    expect(openSheet(s, words)).toBe(s)
  })
  it('после закрытия и повторного открытия активное слово сохраняется', () => {
    let s = next(openSheet(initialCatch(), words), words)
    s = openSheet(closeSheet(s), words)
    expect(s.open).toBe(true)
    expect(s.cur).toBe(1)
  })
  it('setCurrent: любое слово фразы, набранное не теряется; несуществующее — игнор', () => {
    let s = typeAll(openSheet(initialCatch(), words), 'i')
    s = setCurrent(s, words, 2)
    expect(s.cur).toBe(2)
    expect(typedOf(s, 0)).toBe('I')
    expect(setCurrent(s, words, 2)).toBe(s)
    expect(setCurrent(s, words, 9)).toBe(s)
  })
})

describe('press / backspace', () => {
  it('печатает только при открытой шторке с активным словом, первая буква заглавная', () => {
    const s0 = initialCatch()
    expect(press(s0, words, 'l')).toBe(s0)
    const s = typeAll(setCurrent(openSheet(s0, words), words, 1), 'li')
    expect(typedOf(s, 1)).toBe('Li')
    expect(typedOf(backspace(s), 1)).toBe('L')
    expect(backspace(s0)).toBe(s0)
  })
  it('не растёт бесконечно (typedMax)', () => {
    const s = typeAll(setCurrent(openSheet(initialCatch(), words), words, 1), 'likeeeeeeeeeee')
    expect(typedOf(s, 1).length).toBe('like'.length + 3)
  })
  it('у каждого слова своё набранное', () => {
    let s = typeAll(openSheet(initialCatch(), words), 'i')
    s = typeAll(next(s, words), 'like')
    expect(typedOf(s, 0)).toBe('I')
    expect(typedOf(s, 1)).toBe('Like')
  })
})

describe('next / isLast', () => {
  it('переходит по порядку, пустое набранное сохраняется как пустое', () => {
    let s = openSheet(initialCatch(), words)
    expect(isLast(s, words)).toBe(false)
    s = next(s, words)
    expect(s.cur).toBe(1)
    expect(typedOf(s, 0)).toBe('')
    s = next(s, words)
    expect(s.cur).toBe(2)
    expect(isLast(s, words)).toBe(true)
  })
  it('на последнем слове next = check (финал)', () => {
    let s = setCurrent(openSheet(initialCatch(), words), words, 2)
    s = next(typeAll(s, 'cats'), words)
    expect(s.phase).toBe('result')
    expect(s.results.map(r => r.ok)).toEqual([false, false, true])
  })
})

describe('check / reveal', () => {
  it('check: результаты по каждому слову, регистр не важен', () => {
    let s = typeAll(openSheet(initialCatch(), words), 'i')
    s = typeAll(next(s, words), 'lake')
    s = typeAll(next(s, words), 'CATS')
    const { state, results } = check(s, words)
    expect(state.phase).toBe('result')
    expect(state.revealed).toBe(false)
    expect(results).toEqual([
      { index: 0, ok: true, typed: 'I' },
      { index: 1, ok: false, typed: 'Lake' },
      { index: 2, ok: true, typed: 'Cats' },
    ])
    expect(okCount(results)).toBe(2)
    expect(check(state, words).state).toBe(state)
  })
  it('reveal: тот же финал, но revealed=true', () => {
    const s = reveal(typeAll(openSheet(initialCatch(), words), 'i'), words)
    expect(s.phase).toBe('result')
    expect(s.revealed).toBe(true)
    expect(s.results[0]).toEqual({ index: 0, ok: true, typed: 'I' })
    expect(reveal(s, words)).toBe(s)
  })
  it('на финале печать, next и setCurrent ничего не меняют', () => {
    const s = reveal(openSheet(initialCatch(), words), words)
    expect(press(s, words, 'x')).toBe(s)
    expect(next(s, words)).toBe(s)
    expect(setCurrent(s, words, 1)).toBe(s)
    expect(help(s)).toBe(s)
  })
})

describe('help / finish / closeSheet', () => {
  it('help — один раз на активное слово', () => {
    const s0 = initialCatch()
    expect(help(s0)).toBe(s0)
    const s = help(setCurrent(openSheet(s0, words), words, 2))
    expect(s.helped.has(2)).toBe(true)
    expect(help(s)).toBe(s)
  })
  it('finish только на финале: шторка закрыта, done', () => {
    const typing = openSheet(initialCatch(), words)
    expect(finish(typing)).toBe(typing)
    const s = finish(check(typing, words).state)
    expect(s.done).toBe(true)
    expect(s.open).toBe(false)
    expect(openSheet(s, words)).toBe(s)
  })
  it('closeSheet при уходе со слайда: шторка закрыта, набранное и активное остаются', () => {
    const s0 = initialCatch()
    expect(closeSheet(s0)).toBe(s0)
    const s = closeSheet(typeAll(next(openSheet(s0, words), words), 'li'))
    expect(s.open).toBe(false)
    expect(s.cur).toBe(1)
    expect(typedOf(s, 1)).toBe('Li')
    expect(s.done).toBe(false)
  })
  it('wordAt', () => {
    expect(wordAt(words, 2).text).toBe('cats')
    expect(wordAt(words, 9)).toBeNull()
  })
})
