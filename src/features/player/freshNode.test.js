import { describe, it, expect } from 'vitest'
import { freshNode } from './freshNode.js'

describe('freshNode', () => {
  const src = { id: 'a', type: 'text', typeData: { text: { content: 'hi' } } }
  const snap = { id: 'a', visit: 2, isHistory: true }

  it('подмешивает visit/isHistory снимка к актуальной ноде', () => {
    const out = freshNode(snap, src)
    expect(out).toMatchObject({ id: 'a', type: 'text', visit: 2, isHistory: true })
    expect(out.typeData).toBe(src.typeData)
  })

  it('тот же снимок и та же нода → тот же объект (memo строк ленты)', () => {
    expect(freshNode(snap, src)).toBe(freshNode(snap, src))
  })

  it('сменилась нода урока (правка админом) → новая копия', () => {
    const a = freshNode(snap, src)
    const b = freshNode(snap, { ...src, typeData: { text: { content: 'edited' } } })
    expect(b).not.toBe(a)
    expect(b.typeData.text.content).toBe('edited')
  })

  it('другой снимок той же ноды (повторный показ) → другой объект', () => {
    expect(freshNode({ id: 'a', visit: 3 }, src)).not.toBe(freshNode(snap, src))
  })
})
