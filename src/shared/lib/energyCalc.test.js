import { describe, it, expect } from 'vitest'
import { calcEnergy, ENERGY_CAP, ENERGY_TICK_MS } from './energyCalc.js'

const NOW = new Date('2026-07-17T12:00:00Z').getTime()
const H = 3600 * 1000

// profile-хелпер: p(3, 9) = энергия 3, обновлена 9 часов назад
function p(energy, hoursAgo = null) {
  return {
    energy,
    energy_updated_at: hoursAgo === null ? null : new Date(NOW - hoursAgo * H).toISOString(),
  }
}

describe('calcEnergy — капельное восстановление', () => {
  it('полная энергия → нет таймера', () => {
    expect(calcEnergy(p(5, 1), NOW)).toEqual({ value: 5, nextAt: null })
  })

  it('без energy_updated_at — как есть, без таймера', () => {
    expect(calcEnergy(p(3), NOW)).toEqual({ value: 3, nextAt: null })
  })

  it('тик ещё не накапал: 3 энергии, прошло 1ч → 3, +1 через 3ч', () => {
    const { value, nextAt } = calcEnergy(p(3, 1), NOW)
    expect(value).toBe(3)
    expect(nextAt).toBe(NOW - 1 * H + ENERGY_TICK_MS)
  })

  it('граница тика: 4ч без 1мс → ещё 3', () => {
    const t = NOW - ENERGY_TICK_MS + 1
    expect(calcEnergy({ energy: 3, energy_updated_at: new Date(t).toISOString() }, NOW).value).toBe(3)
  })

  it('ровно 4ч → +1', () => {
    expect(calcEnergy(p(3, 4), NOW).value).toBe(4)
  })

  it('9ч → +2 (два полных тика), таймер на третий', () => {
    const { value, nextAt } = calcEnergy(p(2, 9), NOW)
    expect(value).toBe(4)
    expect(nextAt).toBe(NOW - 9 * H + 3 * ENERGY_TICK_MS)
  })

  it('накапало до потолка → 5 и без таймера', () => {
    expect(calcEnergy(p(3, 9), NOW)).toEqual({ value: 5, nextAt: null })
  })

  it('давно не заходил: 0 энергии, 100ч → полный потолок', () => {
    expect(calcEnergy(p(0, 100), NOW)).toEqual({ value: ENERGY_CAP, nextAt: null })
  })

  it('легаси-значение больше потолка (старый бонус 10) клампится до 5', () => {
    expect(calcEnergy(p(10, 1), NOW)).toEqual({ value: 5, nextAt: null })
  })

  it('отрицательное значение из базы клампится до 0', () => {
    expect(calcEnergy(p(-2, 0), NOW).value).toBe(0)
  })

  it('energy undefined → 0', () => {
    expect(calcEnergy({ energy_updated_at: null }, NOW).value).toBe(0)
  })

  it('константы экономики: потолок 5, тик 4 часа', () => {
    expect(ENERGY_CAP).toBe(5)
    expect(ENERGY_TICK_MS).toBe(4 * H)
  })
})
