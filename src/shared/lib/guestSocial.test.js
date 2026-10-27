import { describe, it, expect, beforeEach } from 'vitest'

// Тесты идут в node без DOM — хранилище подменяем до импорта модуля
const store = new Map()
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
}

const {
  toggleIn, getGuestLikes, getGuestSaves, toggleGuestLike, toggleGuestSave,
  hasGuestSocial, clearGuestSocial, LIKES_KEY, SAVES_KEY, MAX_GUEST_SOCIAL,
} = await import('./guestSocial.js')

beforeEach(() => { store.clear(); clearGuestSocial() })

describe('toggleIn — чистое переключение', () => {
  it('добавляет в конец, убирает повторным вызовом, не мутирует исходный массив', () => {
    const a = ['x']
    const b = toggleIn(a, 'y')
    expect(b).toEqual(['x', 'y'])
    expect(a).toEqual(['x'])
    expect(toggleIn(b, 'x')).toEqual(['y'])
  })

  it('при переполнении выпадает самый старый', () => {
    expect(toggleIn(['a', 'b', 'c'], 'd', 3)).toEqual(['b', 'c', 'd'])
  })
})

describe('гостевые лайки и закладки в localStorage', () => {
  it('лайк ставится, переживает «перезагрузку» и снимается', () => {
    expect(toggleGuestLike('m1')).toBe(true)
    expect(JSON.parse(store.get(LIKES_KEY))).toEqual(['m1'])
    expect(getGuestLikes()).toEqual(['m1'])
    expect(toggleGuestLike('m1')).toBe(false)
    expect(getGuestLikes()).toEqual([])
    expect(store.has(LIKES_KEY)).toBe(false) // пустой список ключ не держит
  })

  it('лайки и закладки независимы', () => {
    toggleGuestLike('m1')
    toggleGuestSave('m2')
    expect(getGuestLikes()).toEqual(['m1'])
    expect(getGuestSaves()).toEqual(['m2'])
    expect(JSON.parse(store.get(SAVES_KEY))).toEqual(['m2'])
  })

  it('hasGuestSocial и clearGuestSocial', () => {
    expect(hasGuestSocial()).toBe(false)
    toggleGuestSave('m2')
    expect(hasGuestSocial()).toBe(true)
    toggleGuestLike('m1')
    clearGuestSocial()
    expect(hasGuestSocial()).toBe(false)
    expect(store.has(LIKES_KEY) || store.has(SAVES_KEY)).toBe(false)
  })

  it('не больше 200 id в списке', () => {
    for (let i = 0; i < MAX_GUEST_SOCIAL + 5; i++) toggleGuestLike(`m${i}`)
    const list = getGuestLikes()
    expect(list).toHaveLength(MAX_GUEST_SOCIAL)
    expect(list[0]).toBe('m5')
  })

  it('битый JSON и не-строки в хранилище не ломают чтение', () => {
    store.set(LIKES_KEY, '{oops')
    expect(getGuestLikes()).toEqual([])
    store.set(LIKES_KEY, JSON.stringify(['ok', 5, null]))
    expect(getGuestLikes()).toEqual(['ok'])
  })
})
