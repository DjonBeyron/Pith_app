import { describe, it, expect } from 'vitest'
import { LEVELS, getCurrentLevel, getNextLevel } from './xpLevels.js'

describe('getCurrentLevel — границы уровней', () => {
  it('0 XP → Немой новичок (0)', () => {
    expect(getCurrentLevel(0).level).toBe(0)
  })

  it('99 XP → всё ещё 0, 100 XP → ровно 1', () => {
    expect(getCurrentLevel(99).level).toBe(0)
    expect(getCurrentLevel(100).level).toBe(1)
  })

  it('249 → 1, 250 → 2 (граница 2-го уровня)', () => {
    expect(getCurrentLevel(249).level).toBe(1)
    expect(getCurrentLevel(250).level).toBe(2)
  })

  it('ровно 8000 → 10 (Англонюх) — старые пороги 0-10 не тронуты', () => {
    const l = getCurrentLevel(8000)
    expect(l.level).toBe(10)
    expect(l.label).toBe('Англонюх')
  })

  it('101 уровень (0-100): последний — Легенда английского', () => {
    expect(LEVELS.length).toBe(101)
    expect(LEVELS[100].label).toBe('Легенда английского')
  })

  it('XP сверх последнего порога остаётся на 100-м уровне', () => {
    expect(getCurrentLevel(999999).level).toBe(100)
  })
})

describe('getNextLevel', () => {
  it('0 XP → следующий порог 100 (1-й уровень)', () => {
    expect(getNextLevel(0).xpNeeded).toBe(100)
  })

  it('7999 → следующий 10-й (8000)', () => {
    expect(getNextLevel(7999).level).toBe(10)
  })

  it('достиг максимума (100-й уровень) → null', () => {
    const max = LEVELS[LEVELS.length - 1]
    expect(getNextLevel(max.xpNeeded)).toBe(null)
  })

  it('пороги растут строго вверх (санити всей таблицы)', () => {
    for (let i = 1; i < LEVELS.length; i++) {
      expect(LEVELS[i].xpNeeded).toBeGreaterThan(LEVELS[i - 1].xpNeeded)
      expect(LEVELS[i].level).toBe(LEVELS[i - 1].level + 1)
    }
  })

  it('названия уровней не повторяются', () => {
    const unique = new Set(LEVELS.map(l => l.label))
    expect(unique.size).toBe(LEVELS.length)
  })
})
