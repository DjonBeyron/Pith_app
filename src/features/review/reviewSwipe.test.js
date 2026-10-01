import { describe, it, expect } from 'vitest'
import { swipeDecision, dragTransform, LEAVE_TRANSFORM, SWIPE_PX } from './reviewSwipe.js'

describe('смахивание карточки', () => {
  it('влево — дальше; не дотянул — нет', () => {
    expect(swipeDecision({ dx: -SWIPE_PX, dy: 10 })).toBe('left')
    expect(swipeDecision({ dx: -SWIPE_PX - 40, dy: -20 })).toBe('left')
    expect(swipeDecision({ dx: -(SWIPE_PX - 1), dy: 0 })).toBe(null)
  })
  it('вправо, вверх и вниз — не наш жест; диагональ решает большая ось', () => {
    expect(swipeDecision({ dx: 120, dy: 0 })).toBe(null)
    expect(swipeDecision({ dx: 0, dy: -120 })).toBe(null)
    expect(swipeDecision({ dx: 0, dy: 120 })).toBe(null)
    expect(swipeDecision({ dx: -90, dy: -120 })).toBe(null)
    expect(swipeDecision({ dx: -120, dy: 90 })).toBe('left')
  })
  it('карточка едет только влево, по вертикали слегка следует за пальцем', () => {
    expect(dragTransform(50, 40)).toBe('translate3d(0px, 12px, 0) rotate(0.00deg)')
    expect(dragTransform(-40, -20)).toBe('translate3d(-40px, -6px, 0) rotate(-1.00deg)')
    expect(LEAVE_TRANSFORM).toContain('translate3d(-115%')
  })
})
