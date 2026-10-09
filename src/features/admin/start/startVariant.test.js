import { describe, it, expect, afterEach, vi } from 'vitest'
import { VARIANTS, VARIANT_IDS, VARIANT_KEY, DEFAULT_VARIANT, normalizeVariant, readVariant, writeVariant, runningVariant } from './startVariant.js'

describe('варианты запуска: список и нормализация', () => {
  it('вариантов не больше пяти, буквы A..E по порядку, у каждого есть название и понятное описание', () => {
    expect(VARIANT_IDS).toEqual(['A', 'B', 'C', 'D', 'E'])
    for (const v of VARIANTS) { expect(v.title.length).toBeGreaterThan(3); expect(v.text.length).toBeGreaterThan(30) }
    expect(DEFAULT_VARIANT).toBe('A')
    expect(VARIANT_KEY).toBe('pithy_start_variant_v1')
  })

  it('normalizeVariant: допустимые буквы остаются, всё остальное (нет значения, мусор, строчные) — A', () => {
    for (const id of VARIANT_IDS) expect(normalizeVariant(id)).toBe(id)
    for (const bad of [null, undefined, '', 'a', 'F', 'AB', 0, {}, 'B ']) expect(normalizeVariant(bad)).toBe('A')
  })
})

describe('startVariant: чтение/запись выбора', () => {
  afterEach(() => { vi.unstubAllGlobals() })
  const stubStorage = (store, broken = false) => vi.stubGlobal('localStorage', {
    getItem: k => { if (broken) throw new Error('blocked'); return k in store ? store[k] : null },
    setItem: (k, v) => { if (broken) throw new Error('blocked'); store[k] = String(v) },
  })

  it('пишет в pithy_start_variant_v1 и читает обратно; мусор в хранилище читается как A', () => {
    const store = {}
    stubStorage(store)
    expect(readVariant()).toBe('A')
    expect(writeVariant('C')).toBe(true)
    expect(store.pithy_start_variant_v1).toBe('C')
    expect(readVariant()).toBe('C')
    store.pithy_start_variant_v1 = 'zzz'
    expect(readVariant()).toBe('A')
    expect(writeVariant('nope')).toBe(true)
    expect(store.pithy_start_variant_v1).toBe('A') // непонятное значение не попадает в хранилище
  })

  it('хранилище недоступно: не падает, чтение A, запись false', () => {
    stubStorage({}, true)
    expect(readVariant()).toBe('A')
    expect(writeVariant('B')).toBe(false)
  })

  it('runningVariant берёт window.__startVariant (его ставит скрипт в <head>), по умолчанию A', () => {
    vi.stubGlobal('window', {})
    expect(runningVariant()).toBe('A')
    vi.stubGlobal('window', { __startVariant: 'D' })
    expect(runningVariant()).toBe('D')
  })
})
