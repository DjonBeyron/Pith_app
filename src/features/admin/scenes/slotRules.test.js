import { describe, it, expect } from 'vitest'
import { slotState, slotGroups, slotsFilled, dependents, LAYER_LABEL } from './slotRules.js'
import { newDraft, setSlot } from './builderModel.js'
import { getSlot, LAYERS } from '../../scene/v2/sprites/slots.js'

describe('доступность слотов', () => {
  it('настольный слот без стола заблокирован с объяснением', () => {
    const d = setSlot(newDraft(), 'table', null)
    const st = slotState(d, getSlot('office', 'desk-left'))
    expect(st.enabled).toBe(false)
    expect(st.reason).toMatch(/Стол между персонажами/)
    expect(st.value).toBeNull()
    expect(st.options.map(s => s.id)).toContain('laptop')
    const withTable = slotState(newDraft(), getSlot('office', 'desk-left'))
    expect(withTable.enabled).toBe(true)
    expect(withTable.sprite?.id).toBe('laptop')
    expect(withTable.reason).toBe('')
  })

  it('группы: 5 общих + 5 своих у каждой локации; заполненность; зависимые', () => {
    const d = newDraft()
    const g = slotGroups(d)
    expect(g.common).toHaveLength(5)
    expect(g.local).toHaveLength(5)
    expect(g.local.map(s => s.slot.id)).toContain('desk-left')
    expect(slotsFilled(d)).toEqual({ filled: 10, total: 10 })
    expect(dependents(d, 'table').map(s => s.id).sort()).toEqual(['desk-center', 'desk-left', 'desk-right'])
    expect(dependents(d, 'window')).toEqual([])
  })

  it('у каждого слоя есть русская подпись', () => {
    for (const l of LAYERS) expect(LAYER_LABEL[l]).toMatch(/[а-я]/)
  })
})
