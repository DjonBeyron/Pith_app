import { describe, it, expect } from 'vitest'
import { hasUnclaimedStreak } from './streakClaim.js'

describe('hasUnclaimedStreak', () => {
  it('серия длиннее забранных дней — награда ждёт', () => {
    expect(hasUnclaimedStreak({ current_streak: 3, last_claimed_streak_day: 2 })).toBe(true)
    expect(hasUnclaimedStreak({ current_streak: 1 })).toBe(true)
  })
  it('всё забрано или серии нет — не ждёт', () => {
    expect(hasUnclaimedStreak({ current_streak: 3, last_claimed_streak_day: 3 })).toBe(false)
    expect(hasUnclaimedStreak({ current_streak: 0 })).toBe(false)
    expect(hasUnclaimedStreak(null)).toBe(false)
  })
})
