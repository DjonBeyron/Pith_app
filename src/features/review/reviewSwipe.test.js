import { describe, it, expect } from 'vitest'
import { swipeDecision, swipeStyle, EDGE_PX, SWIPE_PX } from './reviewSwipe.js'

describe('смахивание карточки', () => {
  const at = 200
  it('вправо и вверх — дальше; не дотянул — нет', () => {
    expect(swipeDecision({ startX: at, dx: SWIPE_PX, dy: 10 })).toBe('right')
    expect(swipeDecision({ startX: at, dx: 5, dy: -SWIPE_PX })).toBe('up')
    expect(swipeDecision({ startX: at, dx: SWIPE_PX - 1, dy: 0 })).toBe(null)
  })
  it('влево и вниз — не наш жест; диагональ решает большая ось', () => {
    expect(swipeDecision({ startX: at, dx: -120, dy: 0 })).toBe(null)
    expect(swipeDecision({ startX: at, dx: 0, dy: 120 })).toBe(null)
    expect(swipeDecision({ startX: at, dx: 90, dy: -120 })).toBe('up')
    expect(swipeDecision({ startX: at, dx: 120, dy: -90 })).toBe('right')
  })
  it('от левого края экрана — жест «назад» Safari, не трогаем', () => {
    expect(swipeDecision({ startX: EDGE_PX - 1, dx: 200, dy: 0 })).toBe(null)
    expect(swipeDecision({ startX: EDGE_PX, dx: 200, dy: 0 })).toBe('right')
  })
  it('карточка едет только в «нашу» сторону и улетает по решению', () => {
    expect(swipeStyle(null)).toBeUndefined()
    expect(swipeStyle({ dx: -50, dy: 40 }).transform).toBe('translate(0px, 0px) rotate(0deg)')
    expect(swipeStyle({ dx: 40, dy: -20 }).transform).toBe('translate(40px, -20px) rotate(1deg)')
    expect(swipeStyle({ leave: 'up' }).transform).toBe('translateY(-115%)')
  })
})
