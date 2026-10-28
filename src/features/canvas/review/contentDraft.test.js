import { describe, it, expect } from 'vitest'
import { sameContent } from './contentDraft.js'

const td = { text: { content: 'hi' } }
const base = [{ id: 'n1', seq: 1, type: 'text', typeData: td, triggers: [], note: '', x: 0, y: 0 }]

describe('sameContent', () => {
  it('сдвиг ноды (x/y/size) — содержимое то же', () => {
    expect(sameContent(base, [{ ...base[0], x: 100, y: 50, size: 'max' }])).toBe(true)
  })
  it('правка текста, переходов или удаление — содержимое другое', () => {
    expect(sameContent(base, [{ ...base[0], typeData: { text: { content: 'bye' } } }])).toBe(false)
    expect(sameContent(base, [{ ...base[0], triggers: [{ if: 'played', then: 'n2' }] }])).toBe(false)
    expect(sameContent(base, [])).toBe(false)
  })
})
