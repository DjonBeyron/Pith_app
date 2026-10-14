import { describe, it, expect } from 'vitest'
import { SIGNALS, liveSignals, signalMeta, signalById, GROUPS } from './signalRegistry.js'

const ctx = { stepOf: new Map([['to', 1]]), skipped: new Set(), skippedWords: new Set(), seed: 7, count: 3 }
const item = { module: { id: 'm1', difficulty: 2, difficultyVotes: 9 }, index: 1, words: ['to', 'go'], info: { total: 2, newWords: ['go'], shaky: ['to'] } }

describe('реестр сигналов', () => {
  it('id уникальны, у каждого title/description/group/source/status/compute', () => {
    expect(new Set(SIGNALS.map(s => s.id)).size).toBe(SIGNALS.length)
    for (const s of SIGNALS) {
      expect(s.title.length).toBeGreaterThan(2)
      expect(s.description.length).toBeGreaterThan(20)
      expect(GROUPS[s.group]).toBeTruthy()
      expect(s.source.length).toBeGreaterThan(3)
      expect(['live', 'collecting', 'planned']).toContain(s.status)
      expect(typeof s.compute).toBe('function')
      expect(s.defaultWeight).toBeGreaterThanOrEqual(0)
    }
  })

  it('live-сигналы — ровно те, что были в rankFeed; будущие — нейтральны', () => {
    expect(liveSignals().map(s => s.id).sort()).toEqual(['admin_order', 'difficulty_fit', 'memory_fit', 'quick_skip_penalty', 'random_mix'])
    for (const s of SIGNALS.filter(s => s.status !== 'live')) {
      expect(s.compute(ctx, item).value).toBe(0.5)
      expect(s.defaultEnabled).toBe(false)
    }
    for (const id of ['review_urgency', 'interest_topic', 'search_boost', 'type_affinity', 'swipe_back', 'replay', 'explicit_feedback', 'fatigue', 'time_of_day', 'streak_mode']) {
      expect(signalById(id)).toBeTruthy()
    }
  })

  it('значения live-сигналов в 0..1 и объясняют себя', () => {
    for (const s of liveSignals()) {
      const r = s.compute(ctx, item)
      expect(r.value).toBeGreaterThanOrEqual(0)
      expect(r.value).toBeLessThanOrEqual(1)
    }
    expect(signalById('memory_fit').compute(ctx, item)).toEqual({ value: 1, reason: 'шатается: to' })
    expect(signalById('memory_fit').compute({ stepOf: new Map() }, item).reason).toBe('память пуста')
    expect(signalById('difficulty_fit').compute(ctx, item).value).toBe(0.5)
    expect(signalById('difficulty_fit').compute(ctx, { ...item, module: { id: 'x', difficulty: 3, difficultyVotes: 1 } }).value).toBe(1)
    expect(signalById('quick_skip_penalty').compute({ ...ctx, skippedWords: new Set(['go']) }, item).value).toBe(0)
    expect(signalById('admin_order').compute(ctx, item).value).toBe(0.5)
    expect(signalById('random_mix').compute(ctx, item).value).toBe(signalById('random_mix').compute(ctx, item).value)
  })

  it('метаданные для админки: compute убран, не-live заблокированы', () => {
    const meta = signalMeta()
    expect(meta.every(m => !('compute' in m))).toBe(true)
    expect(meta.find(m => m.id === 'memory_fit').uiLocked).toBe(false)
    expect(meta.find(m => m.id === 'review_urgency').uiLocked).toBe(true)
    expect(meta[0].groupTitle).toBe(GROUPS[meta[0].group])
  })
})
