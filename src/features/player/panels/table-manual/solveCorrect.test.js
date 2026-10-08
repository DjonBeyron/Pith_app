import { describe, it, expect } from 'vitest'
import { solveManualAssembly } from './solveCorrect.js'
import { deriveAnswerTokens } from '../../../../shared/lib/tableCellMatch.js'
import { makeManualCheck } from './manualCheck.js'

// Таблица «to be»: одно «was» в двух строках, ячейка с вариантами (меню)
const cells = [
  { id: 'h', value: 'Местоимения', isHeader: true },
  { id: 'c1', value: 'I' },
  { id: 'c2', value: 'was' },
  { id: 'c3', value: 'he' },
  { id: 'c4', value: 'was' },
  { id: 'c5', value: 'try', options: ['try', 'tries', 'tried'] },
]
const extras = [{ text: 'cook', distractorId: null }, { text: 'bake', distractorId: 'd1' }, { text: 'to', distractorId: null }]

describe('solveManualAssembly — авто-ответ админа в ручной таблице', () => {
  it('ячейки по значению, повтор слова — вторая ячейка, слова вне таблицы — чипы по тексту', () => {
    const tokens = deriveAnswerTokens('I was he was to cook', cells)
    const items = solveManualAssembly({ tokens, cells, shuffledExtras: extras })
    expect(items.map(t => t.value)).toEqual(['I', 'was', 'he', 'was', 'to', 'cook'])
    expect(items.filter(t => t.type === 'cell').map(t => t.cellId)).toEqual(['c1', 'c2', 'c3', 'c4'])
    expect(items.filter(t => t.type === 'extra').map(t => t.key)).toEqual(['extra-2', 'extra-0'])
  })

  it('слово из меню ячейки — в бокс уходит сам вариант, как при выборе из CellOptionsMenu', () => {
    const tokens = deriveAnswerTokens('I tries', cells)
    const items = solveManualAssembly({ tokens, cells, shuffledExtras: [] })
    expect(items[1]).toMatchObject({ type: 'cell', cellId: 'c5', value: 'tries', key: 'cell-c5' })
  })

  it('заголовки не нажимаются, нет чипа/ячейки под слово — null', () => {
    expect(solveManualAssembly({ tokens: [{ type: 'cell', cellId: 'h', value: 'Местоимения' }], cells, shuffledExtras: [] })).toBeNull()
    expect(solveManualAssembly({ tokens: [{ type: 'extra', value: 'nope' }], cells, shuffledExtras: extras })).toBeNull()
  })

  it('собранное проходит проверку manualCheck как верное', () => {
    const tokens = deriveAnswerTokens('I was to cook', cells)
    const assembled = solveManualAssembly({ tokens, cells, shuffledExtras: extras })
    const calls = []
    const check = makeManualCheck({
      assembled, tokens, answer: 'I was to cook', tData: {}, wrongCount: { current: 0 }, timers: { current: [] },
      xpAmount: 0, setCellMenu: () => {}, setResult: r => calls.push(r),
      closePanelWith: trigger => calls.push(trigger), nodes: [],
    })
    check()
    expect(calls).toEqual(['correct', 'table_correct'])
  })
})
