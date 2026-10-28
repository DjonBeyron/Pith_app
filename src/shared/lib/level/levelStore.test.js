import { describe, it, expect, beforeEach } from 'vitest'
// Тесты идут в node без DOM — хранилище подменяем до импорта модуля
const store = new Map()
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
  clear: () => store.clear(),
}

const { loadLevel, saveLevel, clearLevel, normalizeLevel, LEVEL_KEY } = await import('./levelStore.js')
const { emptyLevel } = await import('./levelModel.js')

beforeEach(() => { localStorage.clear() })

describe('levelStore', () => {
  it('пусто → emptyLevel', () => {
    expect(loadLevel()).toEqual(emptyLevel())
  })

  it('запись и чтение', () => {
    const lv = { ear: { level: 0.7, sigma: 0.2, n: 4 }, vocab: { level: 0.3, sigma: 0.1, n: 9 }, updatedAt: 123 }
    saveLevel(lv)
    expect(LEVEL_KEY).toBe('pithy_level_v1')
    expect(loadLevel()).toEqual(lv)
  })

  it('битый JSON и мусор → пустой уровень', () => {
    localStorage.setItem(LEVEL_KEY, '{не json')
    expect(loadLevel()).toEqual(emptyLevel())
    localStorage.setItem(LEVEL_KEY, '42')
    expect(loadLevel()).toEqual(emptyLevel())
  })

  it('частично битые поля заменяются начальными, числа зажимаются в 0..1', () => {
    localStorage.setItem(LEVEL_KEY, JSON.stringify({ ear: { level: 5, sigma: 'x' }, vocab: null }))
    const lv = loadLevel()
    expect(lv.ear.level).toBe(1)
    expect(lv.ear.sigma).toBe(emptyLevel().ear.sigma)
    expect(lv.vocab).toEqual(emptyLevel().vocab)
  })

  it('clearLevel стирает', () => {
    saveLevel(normalizeLevel({ ear: { level: 0.9, sigma: 0.1, n: 1 } }))
    clearLevel()
    expect(localStorage.getItem(LEVEL_KEY)).toBeNull()
    expect(loadLevel()).toEqual(emptyLevel())
  })
})
