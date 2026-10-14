import { describe, it, expect } from 'vitest'
import { positionsById, orderShift, shiftLabel, changedIds, topDifference } from './orderDiff.js'

const L = ids => ids.map(id => ({ module: { id } }))

describe('orderDiff', () => {
  it('positionsById — с 1, понимает и { module } и голые модули', () => {
    expect([...positionsById(L(['a', 'b'])).entries()]).toEqual([['a', 1], ['b', 2]])
    expect(positionsById([{ id: 'x' }]).get('x')).toBe(1)
    expect(positionsById(null).size).toBe(0)
  })

  it('orderShift — поднялся/опустился/новый', () => {
    const s = orderShift(L(['c', 'a', 'b', 'z']), L(['a', 'b', 'c']))
    expect(s.map(x => [x.id, x.delta, x.isNew])).toEqual([['c', 2, false], ['a', -1, false], ['b', -1, false], ['z', 0, true]])
    expect(s.map(shiftLabel)).toEqual(['↑2', '↓1', '↓1', 'новый'])
    expect(shiftLabel({ delta: 0, isNew: false })).toBe('')
    expect(shiftLabel(null)).toBe('')
  })

  it('changedIds — только сдвинувшиеся, с ограничением по топу', () => {
    const now = L(['b', 'a', 'c', 'd']), prev = L(['a', 'b', 'c', 'd'])
    expect([...changedIds(now, prev)]).toEqual(['b', 'a'])
    expect([...changedIds(now, prev, 1)]).toEqual(['b'])
    expect(changedIds(now, now).size).toBe(0)
  })

  it('topDifference — сколько позиций топа различаются', () => {
    expect(topDifference(L(['a', 'b', 'c']), L(['a', 'c', 'b']))).toBe(2)
    expect(topDifference(L(['a', 'b', 'c']), L(['a', 'b', 'c']))).toBe(0)
    expect(topDifference(L(['a', 'b', 'c', 'd']), L(['d', 'c', 'b', 'a']), 2)).toBe(2)
  })
})
