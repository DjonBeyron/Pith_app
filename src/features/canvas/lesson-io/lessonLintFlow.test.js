import { describe, it, expect } from 'vitest'
import { checkFlow } from './lessonLintFlow.js'

const t = (ref, content, then) => ({ ref, type: 'text', data: { content }, triggers: then ? [{ if: 'timer', then }] : [] })

describe('ритм урока', () => {
  it('три текстовые ноды подряд — замечание, две — нет', () => {
    const three = [t('a', 'один', 'b'), t('b', 'два', 'c'), t('c', 'три')]
    expect(checkFlow(three).join()).toContain('[R-text-run] a → b → c')
    expect(checkFlow(three.slice(0, 2))).toEqual([])
  })
  it('тавтология: ответ type_word уже написан в предыдущем тексте', () => {
    const nodes = [t('a', 'Форма: tries', 'b'), { ref: 'b', type: 'type_word', data: { word: 'tries' }, triggers: [] }]
    expect(checkFlow(nodes).join()).toContain('[R-tautology] b')
  })
  it('ответ, которого нет в пояснении, — без замечаний; ответ в слове-подстроке не считается', () => {
    const nodes = [t('a', 'Форма с he, she, it', 'b'), { ref: 'b', type: 'type_word', data: { word: 'tries' }, triggers: [] }]
    expect(checkFlow(nodes)).toEqual([])
    const sub = [t('a', 'Она entries', 'b'), { ref: 'b', type: 'type_word', data: { word: 'tries' }, triggers: [] }]
    expect(checkFlow(sub)).toEqual([])
  })
  it('ветка ошибки не считается основным потоком', () => {
    const nodes = [
      { ref: 'q', type: 'word_choice', data: { options: [{ text: 'tries', isCorrect: true }] }, triggers: [{ if: 'word_wrong', then: 'h' }] },
      t('h', 'Подсказка: tries'),
    ]
    expect(checkFlow(nodes)).toEqual([])
  })
})
