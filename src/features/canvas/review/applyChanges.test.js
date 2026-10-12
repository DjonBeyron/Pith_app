import { describe, it, expect } from 'vitest'
import { diffNodes } from './applyChanges.js'

const n = (id, extra = {}) => ({ id, type: 'text', x: 0, y: 0, triggers: [], typeData: { text: { content: id } }, ...extra })
describe('что применять', () => {
  it('находит изменённые поля существующих нод', () => {
    const base = [n('a'), n('b')]
    const draft = [n('a'), n('b', { typeData: { text: { content: 'новое' } }, x: 560 })]
    const d = diffNodes(base, draft)
    expect(d.changed).toEqual([{ id: 'b', patch: { typeData: { text: { content: 'новое' } }, x: 560 } }])
    expect(d.added + d.removed).toBe(0)
  })
  it('случайные id у переходов (нормализация холста) правкой не считаются', () => {
    const a = [n('a', { triggers: [{ id: '1', if: 'timer', then: 'b' }] })]
    const b = [n('a', { triggers: [{ id: '2', if: 'timer', then: 'b' }] })]
    expect(diffNodes(a, b).changed).toEqual([])
  })
  it('добавленные и удалённые ноды считаются отдельно и в правки не попадают', () => {
    const d = diffNodes([n('a'), n('b')], [n('a'), n('c')])
    expect(d).toEqual({ changed: [], added: 1, removed: 1 })
  })
})
