import { describe, it, expect, beforeEach } from 'vitest'
import { reviewKey, loadReview, saveReview } from './reviewStorage.js'

describe('reviewStorage', () => {
  beforeEach(() => {
    const m = new Map()
    globalThis.localStorage = { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k) }
  })
  it('сохраняет и читает; пустое состояние стирает запись', () => {
    const key = reviewKey([{ id: 'a' }, { id: 'b' }])
    expect(key).toBe('pithy-review:a:2')
    expect(loadReview(key)).toBeNull()
    saveReview(key, { notes: [{ id: '1', ref: 'a', text: 'x' }], general: [], originals: [] })
    expect(loadReview(key).notes).toHaveLength(1)
    saveReview(key, { notes: [], general: [], originals: [] })
    expect(loadReview(key)).toBeNull()
  })
})
