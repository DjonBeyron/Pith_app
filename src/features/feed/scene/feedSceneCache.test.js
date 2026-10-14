import { describe, it, expect } from 'vitest'
import { trimEntries, readStorage, writeStorage, createSceneCache, CACHE_KEY } from './feedSceneCache.js'

const entry = (at, size = 10) => ({ scene: { pad: 'x'.repeat(size) }, updated_at: null, at })

describe('feedSceneCache — лимиты и устойчивость к storage', () => {
  it('trimEntries оставляет самые свежие по числу и по объёму, битые записи выбрасывает', () => {
    const entries = { old: entry(1), mid: entry(2), fresh: entry(3), broken: { at: 9 }, nul: null }
    expect(Object.keys(trimEntries(entries, { maxEntries: 2 }))).toEqual(['fresh', 'mid'])
    // объём: каждая запись ~60 байт — в 100 влезает одна
    expect(Object.keys(trimEntries(entries, { maxBytes: 100 }))).toEqual(['fresh'])
    // слишком большая запись пропускается, а следующие меньшие ещё могут влезть
    const big = { huge: entry(5, 10_000), small: entry(4) }
    expect(Object.keys(trimEntries(big, { maxBytes: 200 }))).toEqual(['small'])
  })

  it('readStorage/writeStorage не бросают при сломанном или отсутствующем storage', () => {
    const broken = { getItem: () => { throw new Error('quota') }, setItem: () => { throw new Error('quota') } }
    expect(readStorage(broken)).toEqual({})
    expect(writeStorage({ a: entry(1) }, broken)).toBe(false)
    expect(readStorage(undefined)).toEqual({})
    expect(writeStorage({}, undefined)).toBe(false)
    expect(readStorage({ getItem: () => '{broken json' })).toEqual({})
    expect(readStorage({ getItem: () => '"строка"' })).toEqual({})
  })

  it('createSceneCache: put → get, отложенная запись в storage под тем же ключом', () => {
    const m = new Map()
    const storage = { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }
    const scheduled = []
    const cache = createSceneCache({ storage, now: () => 42, schedule: fn => scheduled.push(fn) })
    expect(cache.get('a')).toBeNull()
    cache.put('a', { scene: { version: 2 }, updated_at: 'u1' })
    cache.put('b', { scene: { version: 2 } })
    expect(cache.get('a')).toEqual({ scene: { version: 2 }, updated_at: 'u1', at: 42 })
    expect(cache.get('b').updated_at).toBeNull()
    expect(scheduled).toHaveLength(1) // одна отложенная запись на серию put
    expect(m.has(CACHE_KEY)).toBe(false)
    scheduled[0]()
    expect(Object.keys(JSON.parse(m.get(CACHE_KEY)))).toEqual(['a', 'b'])
    // новая сессия читает то, что записано
    const again = createSceneCache({ storage })
    expect(again.get('a').updated_at).toBe('u1')
    expect(again.size()).toBe(2)
  })
})
