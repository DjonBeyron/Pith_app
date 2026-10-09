import { describe, it, expect } from 'vitest'
import { STRIP_HOLD_MS, STRIP_MOVE_PX, STRIP_WIDTH_PCT, movedFar, releaseAction } from './slowStripGesture.js'

describe('правая полоса «Ловли»: тап или удержание', () => {
  it('короткое касание без сдвига — пауза', () => {
    expect(releaseAction({ holding: false, heldMs: 60, moved: false })).toBe('tap')
    expect(releaseAction({ holding: false, heldMs: STRIP_HOLD_MS - 1, moved: false })).toBe('tap')
  })

  it('удержание дольше порога (замедление уже включилось) — на отпускании конец замедления, не пауза', () => {
    expect(releaseAction({ holding: true, heldMs: 900, moved: false })).toBe('endHold')
    expect(releaseAction({ holding: true, heldMs: 900, moved: true })).toBe('endHold')
  })

  it('мазок и отмена касания — ни паузы, ни замедления', () => {
    expect(releaseAction({ holding: false, heldMs: 80, moved: true })).toBe('none')
    expect(releaseAction({ holding: false, heldMs: 80, moved: false, canceled: true })).toBe('none')
    expect(releaseAction({ holding: false, heldMs: STRIP_HOLD_MS + 50, moved: false })).toBe('none')
  })

  it('сдвиг дальше порога — не тап', () => {
    expect(movedFar(0, 0)).toBe(false)
    expect(movedFar(STRIP_MOVE_PX, 0)).toBe(false)
    expect(movedFar(0, STRIP_MOVE_PX + 1)).toBe(true)
    expect(movedFar(9, 9)).toBe(true)
  })

  it('порог удержания меньше времени «увидела» подсказка (400мс), полоса — пятая часть', () => {
    expect(STRIP_HOLD_MS).toBeLessThan(400)
    expect(STRIP_WIDTH_PCT).toBe(20)
  })
})
