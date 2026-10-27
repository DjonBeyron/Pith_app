import { describe, it, expect, afterEach, vi } from 'vitest'
import { memoryTabState, shouldGreet, isMemoryTabTapped, markMemoryTabTapped } from './memoryTab.js'

const st = (hasWords, fresh, tapped, loaded) => memoryTabState({ hasWords, fresh, tapped, loaded })

describe('memoryTabState: таблица решений', () => {
  it('загружено, слов нет, ничего не прилетело — скрыта (с нажатием и без)', () => {
    expect(st(false, false, false, true)).toBe('hidden')
    expect(st(false, false, true, true)).toBe('hidden')
  })
  it('загружено, слова есть — мерцает, пока не нажимали, потом обычная', () => {
    expect(st(true, false, false, true)).toBe('blink')
    expect(st(true, false, true, true)).toBe('normal')
  })
  it('слово только прилетело (fresh) — видна даже без слов в данных', () => {
    expect(st(false, true, false, true)).toBe('blink')
    expect(st(false, true, true, true)).toBe('normal')
    expect(st(true, true, false, true)).toBe('blink')
  })
  it('идёт загрузка: новое устройство — скрыта, у старых не мигает', () => {
    expect(st(false, false, false, false)).toBe('hidden')
    expect(st(false, false, true, false)).toBe('normal')
  })
  it('идёт загрузка, но слово уже прилетело — видна', () => {
    expect(st(false, true, false, false)).toBe('blink')
    expect(st(false, true, true, false)).toBe('normal')
  })
})

describe('shouldGreet: строка «Здесь твои слова не потеряются»', () => {
  it('только когда вкладка появилась после загрузки данных', () => {
    expect(shouldGreet({ hidden: true, loaded: true }, false)).toBe(true)
  })
  it('не при загрузке старого пользователя (до загрузки вкладка была скрыта «на всякий случай»)', () => {
    expect(shouldGreet({ hidden: true, loaded: false }, false)).toBe(false)
  })
  it('не пока скрыта и не если уже была видна', () => {
    expect(shouldGreet({ hidden: true, loaded: true }, true)).toBe(false)
    expect(shouldGreet({ hidden: false, loaded: true }, false)).toBe(false)
  })
})

describe('флаг «вкладку нажимали»', () => {
  afterEach(() => vi.unstubAllGlobals())
  const memStorage = () => {
    const m = new Map()
    return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }
  }

  it('сначала не нажимали, после отметки — нажимали', () => {
    vi.stubGlobal('localStorage', memStorage())
    expect(isMemoryTabTapped()).toBe(false)
    markMemoryTabTapped()
    expect(isMemoryTabTapped()).toBe(true)
    expect(localStorage.getItem('pithy_memory_tab_seen_v1')).toBe('1')
  })

  it('битое хранилище не роняет: читается как «не нажимали», запись молча пропускается', () => {
    const boom = () => { throw new Error('denied') }
    vi.stubGlobal('localStorage', { getItem: boom, setItem: boom, removeItem: boom })
    expect(isMemoryTabTapped()).toBe(false)
    expect(() => markMemoryTabTapped()).not.toThrow()
  })

  it('хранилища нет вовсе — то же самое', () => {
    vi.stubGlobal('localStorage', undefined)
    expect(isMemoryTabTapped()).toBe(false)
    expect(() => markMemoryTabTapped()).not.toThrow()
  })
})
