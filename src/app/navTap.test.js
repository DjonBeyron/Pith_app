import { describe, it, expect } from 'vitest'
import { navTapAction } from './navTap.js'

describe('navTapAction', () => {
  it('нажатие на активную вкладку профиля = «домой» (назад из достижений/настроек)', () => {
    expect(navTapAction('profile', 'profile')).toBe('home')
  })
  it('нажатие на другую вкладку = переключение', () => {
    expect(navTapAction('feed', 'profile')).toBe('switch')
    expect(navTapAction('profile', 'rating')).toBe('switch')
    expect(navTapAction('admin', 'profile')).toBe('switch')
  })
})
