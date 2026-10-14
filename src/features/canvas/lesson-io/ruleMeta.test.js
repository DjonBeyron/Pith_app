import { describe, it, expect } from 'vitest'
import { ruleTitle, guessGroup, groupOf, ruleMatches, checkerOf } from './ruleMeta.js'

describe('справочник окна правил', () => {
  it('название: заданное автором, иначе первая фраза (обрезается до 70)', () => {
    expect(ruleTitle({ title: ' Моё ', text: 'x' })).toBe('Моё')
    expect(ruleTitle({ title: '', text: 'Короткая фраза. Дальше другое.' })).toBe('Короткая фраза.')
    expect(ruleTitle({ title: '', text: 'я'.repeat(100) }).length).toBe(68)
  })
  it('группа по ключевым словам, своя группа важнее', () => {
    expect(guessGroup('Не ставь сигнал на слот')).toBe('Сигналы')
    expect(guessGroup('что-то про погоду')).toBe('Общее')
    expect(groupOf({ group: 'Моя', text: 'сигнал' })).toBe('Моя')
  })
  it('фильтры и поиск', () => {
    const r = { text: 'Подсказка помогает', title: '', bad: '', good: '', active: false, checker: 'auto', group: 'А' }
    expect(ruleMatches(r, { q: 'помогает' })).toBe(true)
    expect(ruleMatches(r, { q: 'нет такого' })).toBe(false)
    expect(ruleMatches(r, { onlyActive: true })).toBe(false)
    expect(ruleMatches(r, { checker: 'judge' })).toBe(false)
    expect(checkerOf('nope').id).toBe('manual')
  })
})
