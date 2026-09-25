import { describe, it, expect } from 'vitest'
import { pickBridge } from './reviewBridge.js'

describe('мостик «Продолжить фразу»', () => {
  const curricula = [
    { id: 'm1', title: "I'm trying to cook", lesson_ids: ['s1', 'a', 'b', 'f1'] },
    { id: 'm2', title: 'Keep trying', lesson_ids: ['s2', 'c', 'f2'] },
    { id: 'm3', title: 'Done', lesson_ids: ['s3', 'd', 'f3'] },
  ]
  const decks = new Map([
    ['trying', { modules: [{ id: 'm1', title: "I'm trying to cook" }, { id: 'm2', title: 'Keep trying' }] }],
    ['cook', { modules: [{ id: 'm1', title: "I'm trying to cook" }] }],
    ['done', { modules: [{ id: 'm3', title: 'Done' }] }],
  ])

  it('модуль слов сессии, ближе всех к концу, но не пройденный целиком', () => {
    const done = new Set(['s1', 'a', 's2', 's3', 'd', 'f3'])
    expect(pickBridge(['trying', 'done'], decks, curricula, done)).toEqual({ id: 'm1', title: "I'm trying to cook", pct: 50 })
  })

  it('всё пройдено или модулей нет — мостика нет', () => {
    expect(pickBridge(['done'], decks, curricula, new Set(['s3', 'd', 'f3']))).toBe(null)
    expect(pickBridge(['нет'], decks, curricula, new Set())).toBe(null)
    expect(pickBridge(['cook'], decks, [], new Set())).toBe(null)
  })
})
