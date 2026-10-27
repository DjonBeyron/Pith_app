import { describe, it, expect, beforeEach, vi } from 'vitest'
import { read, write, loadState } from './promptStore.js'
import { STORAGE_KEY } from './promptRules.js'
import { emptyState } from './promptBudget.js'

// Обёртка над localStorage: в окружении vitest его нет — подставляем простой мок
function mockStorage(initial = {}) {
  const data = { ...initial }
  vi.stubGlobal('localStorage', {
    getItem: k => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v) },
  })
  return data
}

describe('promptStore', () => {
  beforeEach(() => { vi.unstubAllGlobals() })
  it('нет localStorage или пусто — состояние с нуля', () => {
    expect(read()).toEqual(emptyState())
    mockStorage()
    expect(read()).toEqual(emptyState())
  })
  it('запись и чтение по кругу; битый JSON — с нуля', () => {
    const data = mockStorage()
    const s = { ...emptyState(), sessions: 4, offKinds: { hint: true } }
    write(s)
    expect(JSON.parse(data[STORAGE_KEY])).toEqual(s)
    expect(read()).toEqual(s)
    data[STORAGE_KEY] = '{oops'
    expect(read()).toEqual(emptyState())
  })
  it('запись не бросает, если хранилище отказывает', () => {
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => { throw new Error('quota') } })
    expect(() => write(emptyState())).not.toThrow()
  })
  it('loadState чистит истёкшие паузы', () => {
    mockStorage({ [STORAGE_KEY]: JSON.stringify({ pausedKinds: { hint: 50, question: 500 }, laterUntil: 50 }) })
    const s = loadState(100)
    expect(s.pausedKinds).toEqual({ question: 500 })
    expect(s.laterUntil).toBe(0)
  })
})
