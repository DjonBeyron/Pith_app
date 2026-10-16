import { describe, it, expect, vi } from 'vitest'

vi.mock('../../../shared/api/supabase.js', () => ({ supabase: {} }))

const { orderByConfig, weightedOrder, legacyOrder, signalStats } = await import('./previewOrders.js')
const { DEFAULT_CONFIG } = await import('../../../shared/lib/ranking/feedConfig.js')

// Урок → слово: модуль с lessonIds [start, ...words, final]
const lessonWord = new Map([['l-to', 'to'], ['l-go', 'go'], ['l-x', 'x'], ['l-y', 'y']])
const mods = [
  { id: 'A', lessonIds: ['s', 'l-x', 'l-y', 'f'], difficulty: 3, difficultyVotes: 9 }, // все новые
  { id: 'B', lessonIds: ['s', 'l-to', 'l-go', 'f'], difficulty: 1, difficultyVotes: 9 }, // шатается to
  { id: 'C', lessonIds: [], difficulty: 1, difficultyVotes: 0 }, // без слов
]
const rank = { stepOf: new Map([['to', 1], ['go', 4]]), lessonWord, skipped: new Set(), seed: 3 }
const ids = r => r.map(x => x.module.id)

describe('previewOrders', () => {
  it('legacy-конфиг → порядок rankFeed без score; weighted → score и parts', () => {
    const leg = orderByConfig(mods, rank, DEFAULT_CONFIG)
    expect(ids(leg)).toEqual(['B', 'C', 'A'])
    expect(leg[0].score).toBe(null)
    const w = orderByConfig(mods, rank, { ...DEFAULT_CONFIG, engine: 'weighted', rules: { exploreEvery: 0 } })
    expect(ids(w)).toEqual(['B', 'C', 'A'])
    expect(w[0].score).toBeGreaterThan(w[2].score)
    expect(w[0].parts.length).toBe(5)
  })

  it('weightedOrder считает взвешенно даже при engine legacy; без памяти — порядок админа', () => {
    const w = weightedOrder(mods, rank, { ...DEFAULT_CONFIG, rules: { exploreEvery: 0 } })
    expect(w[0].score).not.toBe(null)
    expect(ids(weightedOrder(mods, null, DEFAULT_CONFIG))).toEqual(['A', 'B', 'C'])
    expect(ids(legacyOrder(mods, rank))).toEqual(['B', 'C', 'A'])
  })

  it('signalStats — среднее, высокие/низкие, причины; не-live → null', () => {
    const s = signalStats(mods, rank, 'memory_fit')
    expect(s.total).toBe(3)
    expect(s.high).toBe(1) // B
    expect(s.low).toBe(2) // A (0) и C (1/3)
    expect(s.mean).toBeCloseTo((1 + 0 + 1 / 3) / 3)
    expect(s.reasons.map(r => r.text)).toContain('все слова временные')
    expect(signalStats(mods, rank, 'review_urgency')).toBe(null)
    expect(signalStats(mods, null, 'memory_fit')).toBe(null)
  })
})
