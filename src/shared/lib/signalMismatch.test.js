import { describe, it, expect } from 'vitest'
import { firstMismatchSlot } from './signalMismatch.js'

describe('firstMismatchSlot', () => {
  const matches = (token, expected) => token === expected

  it('всё совпало — null', () => {
    expect(firstMismatchSlot(['a', 'b'], ['a', 'b'], matches)).toBeNull()
  })

  it('несовпадение в середине — возвращает ЕГО индекс, не первый попавшийся дальше', () => {
    expect(firstMismatchSlot(['a', 'x', 'c'], ['a', 'b', 'c'], matches)).toBe(1)
  })

  it('несколько несовпадений — только ЛЕВОЕ (первое)', () => {
    expect(firstMismatchSlot(['x', 'y'], ['a', 'b'], matches)).toBe(0)
  })

  it('пропущенный (undefined) слот тоже несовпадение', () => {
    expect(firstMismatchSlot([undefined, 'b'], ['a', 'b'], matches)).toBe(0)
  })
})
