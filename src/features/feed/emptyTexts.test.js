import { describe, it, expect } from 'vitest'
import { FEED_EMPTY } from './emptyTexts.js'

describe('тексты пустых состояний ленты и «Моих уроков»', () => {
  const all = JSON.stringify(FEED_EMPTY)

  it('для пользователя «уроки», внутреннее «модуль» не показываем', () => {
    expect(all).not.toMatch(/модул/i)
    expect(FEED_EMPTY.noLessons.title).toBe('Пока нет уроков')
  })

  it('нет прежних формулировок', () => {
    expect(all).not.toContain('Лента пуста')
    expect(all).not.toContain('На сервере')
  })
})
