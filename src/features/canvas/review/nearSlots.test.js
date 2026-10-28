import { describe, it, expect } from 'vitest'
import { nearUpdate, showSlot } from './nearSlots.js'

describe('nearSlots', () => {
  it('добавляет и убирает рядом стоящие, запоминая высоту ушедших', () => {
    const heights = new Map()
    const a = nearUpdate(new Set(), [{ ref: 'n1', near: true, height: 10 }, { ref: 'n2', near: false, height: 0 }], heights)
    expect([...a]).toEqual(['n1'])
    const b = nearUpdate(a, [{ ref: 'n1', near: false, height: 120 }], heights)
    expect(b.size).toBe(0)
    expect(heights.get('n1')).toBe(120)
  })
  it('без изменений отдаёт прежнее множество (ссылка та же)', () => {
    const prev = new Set(['n1'])
    expect(nearUpdate(prev, [{ ref: 'n1', near: true, height: 1 }], new Map())).toBe(prev)
  })
  it('рисует слот перед рядом стоящим — для реакции, которая садится в пузырь выше', () => {
    const items = [{ ref: 'a' }, { ref: 'b' }, { ref: 'c' }]
    const near = new Set(['c'])
    expect(showSlot(near, items, 2)).toBe(true)
    expect(showSlot(near, items, 1)).toBe(true)
    expect(showSlot(near, items, 0)).toBe(false)
  })
})
