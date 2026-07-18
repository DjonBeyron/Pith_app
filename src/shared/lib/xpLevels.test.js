import { describe, it, expect } from 'vitest'
import { LEVELS, getCurrentLevel, getNextLevel } from './xpLevels.js'

describe('getCurrentLevel — границы уровней', () => {
  it('0 XP → Новичок (0)', () => {
    expect(getCurrentLevel(0).level).toBe(0)
  })

  it('99 XP → всё ещё 0, 100 XP → ровно 1', () => {
    expect(getCurrentLevel(99).level).toBe(0)
    expect(getCurrentLevel(100).level).toBe(1)
  })

  it('249 → 1, 250 → 2 (граница Практика)', () => {
    expect(getCurrentLevel(249).level).toBe(1)
    expect(getCurrentLevel(250).level).toBe(2)
  })

  it('ровно 8000 → 10 (Легенда)', () => {
    const l = getCurrentLevel(8000)
    expect(l.level).toBe(10)
    expect(l.label).toBe('Легенда')
  })

  it('XP сверх последнего порога остаётся Легендой', () => {
    expect(getCurrentLevel(999999).level).toBe(10)
  })
})

describe('getNextLevel', () => {
  it('0 XP → следующий порог 100 (Ученик)', () => {
    expect(getNextLevel(0).xpNeeded).toBe(100)
  })

  it('7999 → следующий 10-й (8000)', () => {
    expect(getNextLevel(7999).level).toBe(10)
  })

  it('достиг максимума → null', () => {
    expect(getNextLevel(8000)).toBe(null)
  })

  it('пороги растут строго вверх (санити всей таблицы)', () => {
    for (let i = 1; i < LEVELS.length; i++) {
      expect(LEVELS[i].xpNeeded).toBeGreaterThan(LEVELS[i - 1].xpNeeded)
      expect(LEVELS[i].level).toBe(LEVELS[i - 1].level + 1)
    }
  })
})
