import { describe, it, expect } from 'vitest'
import { isWeakNetwork, preloadConcurrency } from './netProfile.js'

const nav = connection => ({ connection })
describe('netProfile: слабая сеть', () => {
  it('нет Network Information API (Safari) — сеть обычная', () => {
    expect(isWeakNetwork({})).toBe(false)
    expect(isWeakNetwork(undefined)).toBe(false)
  })
  it('2g/3g, экономия трафика и канал < 1,5 Мбит/с — слабая; 4g — нет', () => {
    expect(isWeakNetwork(nav({ effectiveType: '3g' }))).toBe(true)
    expect(isWeakNetwork(nav({ effectiveType: 'slow-2g' }))).toBe(true)
    expect(isWeakNetwork(nav({ saveData: true, effectiveType: '4g' }))).toBe(true)
    expect(isWeakNetwork(nav({ effectiveType: '4g', downlink: 0.9 }))).toBe(true)
    expect(isWeakNetwork(nav({ effectiveType: '4g', downlink: 10 }))).toBe(false)
  })
  it('параллельных загрузок медиа: 2 обычно, 1 на слабой сети', () => {
    expect(preloadConcurrency(2, nav({ effectiveType: '4g' }))).toBe(2)
    expect(preloadConcurrency(2, nav({ effectiveType: '3g' }))).toBe(1)
  })
})
