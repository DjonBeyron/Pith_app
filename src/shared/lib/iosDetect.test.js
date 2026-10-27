import { describe, it, expect } from 'vitest'
import { isIOSNavigator } from './iosDetect.js'

// iPad с iPadOS 13+ в Safari выдаёт себя за Mac: UA «Macintosh», platform «MacIntel», но maxTouchPoints 5.
// Настоящий Mac — тот же UA, сенсора нет (0). iPhone — по UA, как раньше
describe('isIOSNavigator: iPhone, iPad-как-Mac, настоящий Mac', () => {
  const mac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
  it('iPhone по UA', () => {
    expect(isIOSNavigator({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15', platform: 'iPhone', maxTouchPoints: 5 })).toBe(true)
  })
  it('iPad, который притворяется Mac, — iOS (есть сенсор)', () => {
    expect(isIOSNavigator({ userAgent: mac, platform: 'MacIntel', maxTouchPoints: 5 })).toBe(true)
  })
  it('настоящий Mac — не iOS', () => {
    expect(isIOSNavigator({ userAgent: mac, platform: 'MacIntel', maxTouchPoints: 0 })).toBe(false)
    expect(isIOSNavigator({ userAgent: mac, platform: 'MacIntel' })).toBe(false)
  })
  it('Android и пустой navigator — не iOS', () => {
    expect(isIOSNavigator({ userAgent: 'Mozilla/5.0 (Linux; Android 11; SM-A505F) Chrome/120', platform: 'Linux armv8l', maxTouchPoints: 5 })).toBe(false)
    expect(isIOSNavigator(undefined)).toBe(false)
  })
})
