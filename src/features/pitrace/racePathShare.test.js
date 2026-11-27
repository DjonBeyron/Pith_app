import { describe, it, expect } from 'vitest'
import { pathShare, shareOfLogical, praiseAllowed, isLateShare, jabAllowed, flySimple, riseSimple, PRAISE_MAX_SHARE, LATE_SHARE, JAB_MAX_SHARE, FLY_SIMPLE_SHARE } from './racePathShare.js'

describe('доля пути пилюли', () => {
  it('проход A (сверху вниз): доля — низ пилюли / высота экрана', () => {
    expect(pathShare({ y: 69.8 })).toBeCloseTo(0.798, 3) // низ 79,8 % — как в журнале «[dodge] … низ пилюли 79.8 %»
    expect(pathShare({ y: -14 })).toBe(0)                  // за верхним краем — ещё не проехала
    expect(pathShare({ y: 96 })).toBe(1)                   // у границы «не успел» — путь пройден
  })
  it('обратный проход B (снизу вверх): доля — сколько проехал верх пилюли от нижнего края', () => {
    expect(pathShare({ y: 30.2, up: true })).toBeCloseTo(0.798, 3) // верх на 20,2 % высоты → проехала 79,8 %
    expect(pathShare({ y: 114, up: true })).toBe(0)
    expect(pathShare({ y: 4, up: true })).toBe(1)
  })
  it('одна и та же точка пути даёт одну долю в обоих направлениях (по логической высоте)', () => {
    for (const y of [-4, 10, 35, 52, 70, 90]) expect(shareOfLogical(y, true)).toBeCloseTo(shareOfLogical(y, false), 10)
    expect(shareOfLogical(70, true)).toBeCloseTo(pathShare({ y: 30, up: true }), 10)
  })
  it('нет числа — доли нет, правила не срабатывают', () => {
    expect(pathShare({})).toBeNull(); expect(pathShare({ y: NaN })).toBeNull(); expect(shareOfLogical(undefined)).toBeNull()
    expect(praiseAllowed(null)).toBe(true); expect(jabAllowed(null)).toBe(true); expect(isLateShare(null)).toBe(false); expect(flySimple(null)).toBe(false)
  })
  it('пороги: «≥» там, где сказано «и более», и «пока меньше» там, где пороги запрещают', () => {
    expect([PRAISE_MAX_SHARE, LATE_SHARE, JAB_MAX_SHARE, FLY_SIMPLE_SHARE]).toEqual([0.65, 0.8, 0.85, 0.8])
    expect(praiseAllowed(0.649)).toBe(true); expect(praiseAllowed(0.65)).toBe(false)
    expect(isLateShare(0.79)).toBe(false); expect(isLateShare(0.8)).toBe(true)
    expect(jabAllowed(0.849)).toBe(true); expect(jabAllowed(0.85)).toBe(false)
    expect(flySimple(0.79)).toBe(false); expect(flySimple(0.8)).toBe(true)
  })
  it('riseSimple: на слабом устройстве улёт простой при любой доле (и без неё), на обычном — только от FLY_SIMPLE_SHARE', () => {
    expect(riseSimple(0.3, true)).toBe(true); expect(riseSimple(null, true)).toBe(true)
    expect(riseSimple(0.79, false)).toBe(false); expect(riseSimple(0.8, false)).toBe(true); expect(riseSimple(0.3)).toBe(false)
  })
})
