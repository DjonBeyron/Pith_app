import { describe, it, expect, beforeEach } from 'vitest'
import { readSeen, markSeen, hasUnseenCosmetic } from './customizationSeen.js'

// Стаб localStorage: vitest бежит в node, где его нет
const store = new Map()
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
}

const ach = (...kinds) => kinds.map(kind => ({ kind, meta: {} }))

describe('customizationSeen', () => {
  beforeEach(() => store.clear())

  it('непросмотренная косметика зажигает блеск', () => {
    expect(hasUnseenCosmetic(ach('level10'), [])).toBe(true)
    expect(hasUnseenCosmetic(ach('level10'), ['level10'])).toBe(false)
  })

  it('«Начало пути» без косметики блеск не зажигает', () => {
    expect(hasUnseenCosmetic(ach('journey_start'), [])).toBe(false)
  })

  it('markSeen запоминает виды по пользователю и не дублирует', () => {
    markSeen('u1', ach('level10', 'journey_start'))
    markSeen('u1', ach('level10', 'race_finisher'))
    expect(readSeen('u1').sort()).toEqual(['journey_start', 'level10', 'race_finisher'])
    expect(readSeen('u2')).toEqual([])
  })

  it('битое хранилище читается как пустое', () => {
    localStorage.setItem('pithy_ach_seen_v1:u1', '{не json')
    expect(readSeen('u1')).toEqual([])
  })
})
