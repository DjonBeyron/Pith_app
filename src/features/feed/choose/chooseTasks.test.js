import { describe, it, expect } from 'vitest'
import { hasChoose, correctOption, textOnly, pickChooseCard } from './chooseTasks.js'

const say = id => ({ id, type: 'text', typeData: { text: { text: 'Hi' } } })
const voice = id => ({ id, type: 'audio', typeData: { audio: { text: '' } } })
const voiceWithText = id => ({ id, type: 'audio', typeData: { audio: { text: 'I keep it' } } })
const choice = (id = 'c') => ({
  id, type: 'word_choice',
  typeData: { word_choice: { options: [{ text: 'kip' }, { text: 'keep', isCorrect: true }, { text: 'cap' }] } },
})
const card = (id, nodes) => ({ id, nodes, lessonId: 'l1', teacher: {} })
const deck = (cards, mod = 'm1') => ({ phrase: 'p', modules: [{ id: mod, title: 'p' }], cards })

describe('карточки игры', () => {
  it('годится только короткая карточка с word_choice', () => {
    expect(hasChoose(card('a', [say('1'), choice()]))).toBe(true)
    expect(hasChoose(card('b', [say('1')]))).toBe(false)
    expect(hasChoose(card('c', [say('1'), say('2'), say('3'), say('4'), choice()]))).toBe(false)
    expect(hasChoose(null)).toBe(false)
  })
  it('верный вариант берётся из размеченных вариантов', () => {
    expect(correctOption(card('a', [say('1'), choice()]))).toBe('keep')
    expect(correctOption(card('b', [say('1')]))).toBe('')
  })
  it('текстовая версия: ноды, которым нужен звук, убраны; голос с текстом и задание остаются', () => {
    const t = textOnly(card('a', [voice('v'), voiceWithText('vt'), say('s'), choice()]))
    expect(t.nodes.map(n => n.id)).toEqual(['vt', 's', 'c'])
    expect(t.textOnly).toBe(true)
    expect(t.id).toBe('a')
  })
})

describe('pickChooseCard', () => {
  const decks = new Map([
    ['keep', deck([card('k1', [say('1'), choice()])], 'mk')],
    ['cook', deck([card('c1', [say('1'), choice()])], 'mc')],
    ['none', deck([card('n1', [say('1')])])],
  ])
  const first = () => 0

  it('слова без задания пропускаются; возвращает слово, карточку и модуль', () => {
    const r = pickChooseCard(decks, { rand: first })
    expect(r.word).toBe('keep')
    expect(r.card.id).toBe('k1')
    expect(r.moduleId).toBe('mk')
  })
  it('предпочитает слова не из памяти', () => {
    expect(pickChooseCard(decks, { inMemory: new Set(['keep']), rand: first }).word).toBe('cook')
    expect(pickChooseCard(decks, { inMemory: new Map([['cook', 3]]), rand: first }).word).toBe('keep')
  })
  it('все слова в памяти — берёт из памяти', () => {
    expect(pickChooseCard(decks, { inMemory: new Set(['keep', 'cook']), rand: first }).word).toBe('keep')
  })
  it('исключённые слова не предлагаются; нечего предложить — null', () => {
    expect(pickChooseCard(decks, { exclude: ['keep'], rand: first }).word).toBe('cook')
    expect(pickChooseCard(decks, { exclude: new Set(['keep', 'cook']) })).toBeNull()
    expect(pickChooseCard(new Map())).toBeNull()
    expect(pickChooseCard(null)).toBeNull()
  })
  it('без звука берёт карточки с читаемым контекстом', () => {
    const d = new Map([
      ['mute', deck([card('m1', [voice('v'), choice()])])],
      ['read', deck([card('r1', [say('s'), choice()])])],
    ])
    expect(pickChooseCard(d, { needText: true, rand: first }).word).toBe('read')
    expect(pickChooseCard(d, { needText: false, rand: first }).word).toBe('mute')
  })
})
