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

describe('ритм: подсказки ветки ошибки', () => {
  it('текст подсказки, в который попадают только после ошибки, не считается пояснением', () => {
    const nodes = [
      { ref: 'q', type: 'phrase_assembly', data: { words: ['She', 'tries'] }, triggers: [{ if: 'phrase_wrong', then: 'h' }, { if: 'phrase_correct', then: 'n' }] },
      { ref: 'h', type: 'text', data: { content: 'Вот так: she tries' }, triggers: [{ if: 'timer', then: 'n' }] },
      { ref: 'n', type: 'text', data: { content: 'Дальше' }, triggers: [{ if: 'timer', then: 's' }] },
      { ref: 's', type: 'say_phrase', data: { phrase: 'She tries' }, triggers: [] },
    ]
    expect(checkFlow(nodes)).toEqual([])
  })
  it('скрытая расшифровка audio — задание «на слух» не тавтология', () => {
    const nodes = [
      { ref: 'a', type: 'audio', data: { text: 'She is trying', showText: false }, triggers: [{ if: 'played', then: 'w' }] },
      { ref: 'w', type: 'word_choice', data: { options: [{ text: 'She is trying', isCorrect: true }] }, triggers: [] },
    ]
    expect(checkFlow(nodes)).toEqual([])
  })
})

describe('базовая подложка текста', () => {
  const base = { start: 0, end: 5, mode: 'text', color: '#ffffff', opacity: 0.75 }
  it('нода с текстом без базового highlight — замечание; с ним — нет', () => {
    const styled = { ref: 'b', type: 'text', data: { content: 'Ок', highlights: [{ ...base, end: 2 }] }, triggers: [] }
    expect(checkFlow([{ ref: 'a', type: 'text', data: { content: 'Текст' }, triggers: [] }, styled]).join()).toContain('[R-base] a')
    expect(checkFlow([{ ref: 'a', type: 'text', data: { content: 'Текст' }, triggers: [] }])).toEqual([]) // без раскраски вообще — не трогаем
    expect(checkFlow([{ ref: 'a', type: 'text', data: { content: 'Текст', highlights: [base] }, triggers: [] }])).toEqual([])
  })
})
