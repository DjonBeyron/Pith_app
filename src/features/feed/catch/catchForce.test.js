import { describe, it, expect, beforeEach } from 'vitest'
import { forcedKnowledge, setForcedCatch, getForcedCatch, clearForcedCatch, sendToFeed, onFeedJump } from './catchForce.js'

const WORDS = [
  { index: 0, key: 'a' }, { index: 2, key: 'b' }, { index: 4, key: 'c' }, { index: 6, key: 'd' }, { index: 8, key: 'e' },
]

beforeEach(() => {
  const store = new Map()
  globalThis.sessionStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  }
  const target = new EventTarget()
  globalThis.window = target
})

describe('forcedKnowledge', () => {
  it('уровни → шаги: 1→1, 2→3, 3→5, 4→5 + постоянная; 0 — нет в памяти', () => {
    const k = forcedKnowledge(WORDS, { 0: 0, 2: 1, 4: 2, 6: 3, 8: 4 })
    expect(k.stepOf.get('a')).toBeUndefined()
    expect([k.stepOf.get('b'), k.stepOf.get('c'), k.stepOf.get('d'), k.stepOf.get('e')]).toEqual([1, 3, 5, 5])
    expect([...k.settledOf]).toEqual(['e'])
  })
  it('слово без явного уровня: дефолт-индекс → 2, остальные → 0', () => {
    const k = forcedKnowledge(WORDS, {}, 0)
    expect([...k.stepOf]).toEqual([['a', 3]])
  })
  it('слово без ключа пропускается', () => {
    expect(forcedKnowledge([{ index: 0, key: '' }], { 0: 3 }).stepOf.size).toBe(0)
  })
})

describe('хранилище', () => {
  it('set → get → clear', () => {
    expect(getForcedCatch()).toBeNull()
    expect(setForcedCatch({ moduleId: 'm1', levels: { 0: 2 }, writeMemory: true })).toBe(true)
    expect(getForcedCatch()).toEqual({ moduleId: 'm1', levels: { 0: 2 }, writeMemory: true })
    clearForcedCatch()
    expect(getForcedCatch()).toBeNull()
  })
  it('битый JSON и недоступный storage — null / false', () => {
    sessionStorage.setItem('pithy_catch_force_v1', '{oops')
    expect(getForcedCatch()).toBeNull()
    globalThis.sessionStorage = { getItem() { throw new Error('x') }, setItem() { throw new Error('x') } }
    expect(getForcedCatch()).toBeNull()
    expect(setForcedCatch({ moduleId: 'm1', levels: {} })).toBe(false)
  })
})

describe('sendToFeed', () => {
  it('шлёт feed-jump с moduleId', () => {
    const got = []
    onFeedJump(d => got.push(d))
    sendToFeed('m7')
    expect(got).toEqual([{ moduleId: 'm7' }])
  })
})
