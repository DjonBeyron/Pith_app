import { describe, it, expect } from 'vitest'
import { ruleForWarning, rulesForNode, nodeToExampleLine } from './reviewRules.js'

const r = (o = {}) => ({ id: 'x', text: 'Правило.', active: true, title: '', group: '', ...o })
describe('связь замечаний с правилами', () => {
  it('код замечания находит правило по названию', () => {
    const rules = [r({ title: 'Не больше двух текстов подряд' })]
    expect(ruleForWarning('[R-text-run] a → b → c: …', rules)).toBe(rules[0])
    expect(ruleForWarning('Недостижимо: x', rules)).toBe(null)
  })
  it('правила для ноды: по типу в тексте и общие группы; выключенные не берём', () => {
    const rules = [r({ text: 'про say_phrase' }), r({ text: 'про table' }), r({ text: 'x', group: 'Последовательности' }), r({ text: 'say_phrase', active: false })]
    expect(rulesForNode({ type: 'say_phrase' }, rules)).toHaveLength(2)
  })
  it('нода → строка примера с метками', () => {
    const node = { type: 'text', data: { content: 'Форма tries', highlights: [{ start: 6, end: 11, mode: 'text', color: '#b6fe3b', opacity: 1 }, { start: 6, end: 11, mode: 'bold', color: '#b6fe3b', opacity: 1 }] } }
    expect(nodeToExampleLine(node)).toBe('text: Форма {g:tries}')
  })
})
