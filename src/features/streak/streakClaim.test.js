import { describe, it, expect } from 'vitest'
import { hasUnclaimedStreak, pointerIndex } from './streakClaim.js'

describe('hasUnclaimedStreak', () => {
  it('серия длиннее полученных дней — награда ждёт', () => {
    expect(hasUnclaimedStreak({ current_streak: 3, last_claimed_streak_day: 2 })).toBe(true)
    expect(hasUnclaimedStreak({ current_streak: 1 })).toBe(true)
  })
  it('всё получено или серии нет — не ждёт', () => {
    expect(hasUnclaimedStreak({ current_streak: 3, last_claimed_streak_day: 3 })).toBe(false)
    expect(hasUnclaimedStreak({ current_streak: 0 })).toBe(false)
    expect(hasUnclaimedStreak(null)).toBe(false)
  })
})

// Окно пути: дни 1..7 (строки 0..6). Указатель — над строкой с индексом результата (= первый день «впереди»).
describe('pointerIndex', () => {
  it('ничего не получено и серии нет — указателя нет', () => {
    expect(pointerIndex(1, 7, 0, 0)).toBe(-1)
  })
  it('есть доступные неполученные дни — указатель под последним из них', () => {
    // серия 3, получено 0: дни 1-3 «можно забрать», указатель над днём 4 (строка 3), а не над днём 1
    expect(pointerIndex(1, 7, 0, 3)).toBe(3)
    // серия 1, получено 0: единственный день «можно забрать» — указатель под ним
    expect(pointerIndex(1, 7, 0, 1)).toBe(1)
  })
  it('часть получена, часть ждёт — под последним доступным', () => {
    // окно 2..8, получено 3, серия 5: день 5 — последний доступный, указатель над днём 6 (строка 4)
    expect(pointerIndex(2, 8, 3, 5)).toBe(4)
  })
  it('всё доступное получено — под последним полученным', () => {
    expect(pointerIndex(1, 7, 4, 4)).toBe(4)
    // окно съехало (3 полученных дня сверху): 5..11, получено 7 → над днём 8 (строка 3)
    expect(pointerIndex(5, 11, 7, 7)).toBe(3)
  })
  it('серия сорвалась (streak 0, полученные дни остались) — под последним полученным', () => {
    expect(pointerIndex(8, 14, 10, 0)).toBe(3)
  })
  it('открыты все показанные дни — указателя нет (ниже края окна)', () => {
    expect(pointerIndex(1, 7, 0, 10)).toBe(-1)
    expect(pointerIndex(1, 7, 0, 7)).toBe(-1)
  })
  it('нет данных в профиле — не падает', () => {
    expect(pointerIndex(1, 7, undefined, undefined)).toBe(-1)
  })
})
