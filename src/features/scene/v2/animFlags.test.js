import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { isAnimV2, setAnimV2, resolveAnimV2, ANIM_V2_KEY } from './animFlags.js'

// localStorage — простая подделка (среда node без DOM)
function fakeStorage(init = {}) {
  const m = new Map(Object.entries(init))
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), m }
}

describe('animFlags — флаг «живой Пит v2»', () => {
  beforeEach(() => { vi.stubGlobal('localStorage', fakeStorage()) })
  afterEach(() => { vi.unstubAllGlobals() })

  it('по умолчанию выключен; ключ pithy_scene_anim_v2 = «1» включает; setAnimV2(false) убирает ключ', () => {
    expect(ANIM_V2_KEY).toBe('pithy_scene_anim_v2')
    expect(isAnimV2()).toBe(false)
    localStorage.setItem(ANIM_V2_KEY, '1')
    expect(isAnimV2()).toBe(true)
    localStorage.setItem(ANIM_V2_KEY, '0')
    expect(isAnimV2()).toBe(false)
    setAnimV2(true)
    expect(isAnimV2()).toBe(true)
    setAnimV2(false)
    expect(isAnimV2()).toBe(false)
    expect(localStorage.getItem(ANIM_V2_KEY)).toBeNull()
  })

  it('явный проп сильнее флага: true / false как есть, иначе читаем флаг', () => {
    expect(resolveAnimV2(undefined)).toBe(false)
    expect(resolveAnimV2(true)).toBe(true)
    setAnimV2(true)
    expect(resolveAnimV2(undefined)).toBe(true)
    expect(resolveAnimV2(null)).toBe(true)
    expect(resolveAnimV2(false)).toBe(false)
  })

  it('недоступный localStorage (приватный режим) не роняет: выключено', () => {
    vi.stubGlobal('localStorage', { getItem() { throw new Error('denied') }, setItem() { throw new Error('denied') }, removeItem() { throw new Error('denied') } })
    expect(isAnimV2()).toBe(false)
    expect(() => setAnimV2(true)).not.toThrow()
    expect(() => setAnimV2(false)).not.toThrow()
  })
})
