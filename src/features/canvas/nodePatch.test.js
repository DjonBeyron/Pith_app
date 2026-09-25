import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { applyNodePatch } from './nodeGraph.js'

const node = { id: 'a', type: 'text', typeData: { text: { content: 'hi' } } }

describe('applyNodePatch', () => {
  it('объект полей — сливается с нодой', () => {
    expect(applyNodePatch(node, { note: 'x' })).toEqual({ ...node, note: 'x' })
  })

  // Так шлёт правку NodeContentEditor.updateTypeData: раньше список
  // продакшена/карточек распаковывал функцию как объект — правка терялась
  it('функция — считается от актуальной ноды', () => {
    const patch = cur => ({ typeData: { ...cur.typeData, text: { ...cur.typeData.text, content: 'hello' } } })
    expect(applyNodePatch(node, patch).typeData.text.content).toBe('hello')
    expect(node.typeData.text.content).toBe('hi')
  })

  it('канвас и список продакшена/карточек применяют патч одинаково', () => {
    for (const f of ['CanvasBoard.jsx', '../production/ProductionList.jsx']) {
      expect(readFileSync(new URL(f, import.meta.url), 'utf8')).toMatch(/applyNodePatch\(n, patch\)/)
    }
  })
})
