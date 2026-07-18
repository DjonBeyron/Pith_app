import { describe, it, expect, beforeEach } from 'vitest'
import { starsFromErrors, setLocalStars, getLocalStars } from './lessonStars.js'

// Стаб localStorage: vitest бежит в node, где его нет
const store = new Map()
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
}

beforeEach(() => store.clear())

describe('starsFromErrors', () => {
  it('0 ошибок → 3★', () => {
    expect(starsFromErrors(0)).toBe(3)
  })

  it('1–2 ошибки → 2★', () => {
    expect(starsFromErrors(1)).toBe(2)
    expect(starsFromErrors(2)).toBe(2)
  })

  it('3 и больше → 1★ (урок пройден)', () => {
    expect(starsFromErrors(3)).toBe(1)
    expect(starsFromErrors(100)).toBe(1)
  })

  it('отрицательное (в проде невозможно) — фиксируем текущее поведение: 2★', () => {
    expect(starsFromErrors(-1)).toBe(2)
  })
})

describe('setLocalStars / getLocalStars — локальный стор', () => {
  it('пишет и читает', () => {
    setLocalStars('les-1', 2)
    expect(getLocalStars().get('les-1')).toBe(2)
  })

  it('только вверх: пересдача хуже не портит лучший результат', () => {
    setLocalStars('les-1', 3)
    setLocalStars('les-1', 1)
    expect(getLocalStars().get('les-1')).toBe(3)
  })

  it('вверх — можно', () => {
    setLocalStars('les-1', 1)
    setLocalStars('les-1', 2)
    expect(getLocalStars().get('les-1')).toBe(2)
  })

  it('кламп сверху: больше 3 не бывает', () => {
    setLocalStars('les-1', 7)
    expect(getLocalStars().get('les-1')).toBe(3)
  })

  it('мусор игнорируется: без id или звёзд < 1 записи нет', () => {
    setLocalStars(null, 3)
    setLocalStars('les-2', 0)
    setLocalStars('les-3', undefined)
    expect(getLocalStars().size).toBe(0)
  })

  it('битый JSON в сторе → пустая карта, не краш', () => {
    store.set('pithy_lesson_stars_v1', '{оборванный')
    expect(getLocalStars().size).toBe(0)
  })
})
