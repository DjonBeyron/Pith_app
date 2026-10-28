import { describe, it, expect } from 'vitest'
import { exampleNodes } from './exampleNodes.js'

describe('пример правила → ноды обменного формата', () => {
  it('тип, разметка в data, цепочка переходов по типу', () => {
    const n = exampleNodes('text: Форма {g:tries}\naudio: скажи\nword_choice: что? да / нет', { prefix: 'b1-' })
    expect(n.map(x => x.ref)).toEqual(['b1-1', 'b1-2', 'b1-3'])
    expect(n[0].data.content).toBe('Форма {g:tries}')
    expect(n[0].triggers).toEqual([{ if: 'timer', then: 'b1-2' }])
    expect(n[1].triggers).toEqual([{ if: 'played', then: 'b1-3' }])
    expect(n[2].data.options).toEqual([{ text: 'да', isCorrect: true }, { text: 'нет', isCorrect: false }])
    expect(n[2].triggers).toEqual([])
  })
  it('пусто → []', () => { expect(exampleNodes('')).toEqual([]) })
})
