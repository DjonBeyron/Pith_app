import { describe, it, expect } from 'vitest'
import { uiRead, uiWrite, uiRemove, uiKey, UI_PREFIX } from './uiStore.js'

// Хранилище настроек интерфейса сборщика: запись/чтение, мусор, недоступный storage
const mem = () => {
  const m = new Map()
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), map: m }
}

describe('uiStore', () => {
  it('пишет и читает JSON под версионным ключом', () => {
    const storage = mem()
    expect(uiWrite('cols', [0.4, 0.3, 0.3], { storage })).toBe(true)
    expect(storage.map.get(uiKey('cols'))).toBe('[0.4,0.3,0.3]')
    expect(uiKey('cols').startsWith(UI_PREFIX)).toBe(true)
    expect(uiRead('cols', null, { storage })).toEqual([0.4, 0.3, 0.3])
    expect(uiRead('nope', 'def', { storage })).toBe('def')
  })

  it('битый JSON удаляется, возвращается fallback; валидатор отбраковывает мусор', () => {
    const storage = mem()
    storage.setItem(uiKey('tab'), '{oops')
    expect(uiRead('tab', 'library', { storage })).toBe('library')
    expect(storage.map.has(uiKey('tab'))).toBe(false)
    uiWrite('tab', 123, { storage })
    expect(uiRead('tab', 'library', { storage, validate: v => typeof v === 'string' })).toBe('library')
    expect(storage.map.has(uiKey('tab'))).toBe(false)
  })

  it('undefined удаляет запись; недоступный storage — молча fallback/false', () => {
    const storage = mem()
    uiWrite('theme', 'light', { storage })
    uiWrite('theme', undefined, { storage })
    expect(uiRead('theme', 'dark', { storage })).toBe('dark')
    const broken = { getItem: () => { throw new Error('private') }, setItem: () => { throw new Error('full') }, removeItem: () => { throw new Error('x') } }
    expect(uiRead('theme', 'dark', { storage: broken })).toBe('dark')
    expect(uiWrite('theme', 'light', { storage: broken })).toBe(false)
    expect(() => uiRemove('theme', { storage: broken })).not.toThrow()
  })
})
