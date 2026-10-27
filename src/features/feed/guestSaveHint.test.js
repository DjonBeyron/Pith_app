import { describe, it, expect, beforeEach } from 'vitest'

// Тесты идут в node без DOM — хранилище подменяем до импорта модуля
const store = new Map()
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
}

const {
  shouldShowGuestHint, readGuestHint, noteGuestLiked, markGuestHintShown, GUEST_HINT_KEY,
} = await import('./guestSaveHint.js')

beforeEach(() => store.clear())

describe('shouldShowGuestHint', () => {
  it('без лайка строки нет', () => {
    expect(shouldShowGuestHint({ likedAt: null, slidesSince: 5, shown: false })).toBe(false)
  })
  it('после лайка — только через два слайда', () => {
    expect(shouldShowGuestHint({ likedAt: 1, slidesSince: 0, shown: false })).toBe(false)
    expect(shouldShowGuestHint({ likedAt: 1, slidesSince: 1, shown: false })).toBe(false)
    expect(shouldShowGuestHint({ likedAt: 1, slidesSince: 2, shown: false })).toBe(true)
    expect(shouldShowGuestHint({ likedAt: 1, slidesSince: 3, shown: false })).toBe(true)
  })
  it('один раз на устройстве: показанную не повторяем', () => {
    expect(shouldShowGuestHint({ likedAt: 1, slidesSince: 9, shown: true })).toBe(false)
  })
})

describe('пометка pithy_guest_like_hint_v1', () => {
  it('пусто → нет лайка, не показано', () => {
    expect(readGuestHint()).toEqual({ at: null, shown: false })
  })
  it('первый лайк запоминается, повторные время не двигают', () => {
    noteGuestLiked(100)
    noteGuestLiked(200)
    expect(readGuestHint()).toEqual({ at: 100, shown: false })
    expect(JSON.parse(store.get(GUEST_HINT_KEY)).at).toBe(100)
  })
  it('показано — навсегда; новый лайк это не сбрасывает', () => {
    noteGuestLiked(100)
    markGuestHintShown()
    noteGuestLiked(300)
    expect(readGuestHint()).toEqual({ at: 100, shown: true })
  })
  it('битый JSON читается как пусто', () => {
    store.set(GUEST_HINT_KEY, '{oops')
    expect(readGuestHint()).toEqual({ at: null, shown: false })
  })
})
