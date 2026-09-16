import { describe, it, expect } from 'vitest'
import { firstMismatchSlot, nextBlinkIndex } from './signalMismatch.js'

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

describe('nextBlinkIndex', () => {
  it('нет мигающего — остаётся null', () => {
    expect(nextBlinkIndex(null, 2)).toBeNull()
  })

  it('убрали именно помеченный чип — мигание гаснет', () => {
    expect(nextBlinkIndex(3, 3)).toBeNull()
  })

  it('убрали чип ДО помеченного — индекс сдвигается вслед за словом', () => {
    expect(nextBlinkIndex(3, 1)).toBe(2)
  })

  it('убрали чип ПОСЛЕ помеченного — индекс не трогаем', () => {
    expect(nextBlinkIndex(3, 5)).toBe(3)
  })

  it('убрали чип сразу перед помеченным (соседний) — сдвиг на 1', () => {
    expect(nextBlinkIndex(1, 0)).toBe(0)
  })
})
