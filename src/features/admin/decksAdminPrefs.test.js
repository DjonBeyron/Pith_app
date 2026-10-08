import { describe, it, expect } from 'vitest'
import { DECKS_ONLY_PROBLEMS_KEY, readOnlyProblems, writeOnlyProblems } from './decksAdminPrefs.js'

function memStore(initial = {}) {
  const m = new Map(Object.entries(initial))
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), map: m }
}
const broken = () => ({ getItem() { throw new Error('denied') }, setItem() { throw new Error('quota') } })

describe('decksAdminPrefs', () => {
  it('пусто → по умолчанию галочка включена', () => {
    expect(readOnlyProblems(memStore())).toBe(true)
  })
  it('записанное читается обратно (и выключенная галочка тоже)', () => {
    const st = memStore()
    expect(writeOnlyProblems(false, st)).toBe(true)
    expect(st.map.has(DECKS_ONLY_PROBLEMS_KEY)).toBe(true)
    expect(readOnlyProblems(st)).toBe(false)
    writeOnlyProblems(true, st)
    expect(readOnlyProblems(st)).toBe(true)
  })
  it('битый JSON и не-булево значение → по умолчанию', () => {
    expect(readOnlyProblems(memStore({ [DECKS_ONLY_PROBLEMS_KEY]: '{oops' }))).toBe(true)
    expect(readOnlyProblems(memStore({ [DECKS_ONLY_PROBLEMS_KEY]: '"no"' }))).toBe(true)
    expect(readOnlyProblems(memStore({ [DECKS_ONLY_PROBLEMS_KEY]: '0' }))).toBe(true)
  })
  it('хранилище недоступно: чтение — по умолчанию, запись — false, без исключений', () => {
    expect(readOnlyProblems(broken())).toBe(true)
    expect(writeOnlyProblems(false, broken())).toBe(false)
    expect(readOnlyProblems(null)).toBe(true)
    expect(writeOnlyProblems(false, null)).toBe(false)
  })
})
