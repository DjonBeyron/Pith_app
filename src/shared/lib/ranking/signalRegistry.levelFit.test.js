import { describe, it, expect } from 'vitest'
import { signalById, signalMeta, isLiveSignal } from './signalRegistry.js'

const sig = signalById('level_fit')
const lvl = ear => ({ ear: { level: ear, sigma: 0.1, n: 5 }, vocab: { level: 0.5, sigma: 0.1, n: 5 }, updatedAt: 0 })
// difficultyVotes 9: голосов хватает, сложность — медиана (effectiveDifficulty)
const item = (difficulty, index = 0) => ({ module: { id: 'm', difficulty, difficultyVotes: 9 }, index, words: [], info: { total: 0, newWords: [], shaky: [] } })

describe('сигнал level_fit', () => {
  it('описан: группа content, collecting, выключен, вес 15, в админке заблокирован', () => {
    expect(sig.group).toBe('content')
    expect(sig.status).toBe('collecting')
    expect(sig.defaultWeight).toBe(15)
    expect(sig.defaultEnabled).toBe(false)
    expect(sig.source).toContain('pithy_level_v1')
    expect(isLiveSignal('level_fit')).toBe(false)
    expect(signalMeta().find(m => m.id === 'level_fit').uiLocked).toBe(true)
  })

  it('нет уровня — нейтрально с причиной', () => {
    expect(sig.compute({}, item(2))).toEqual({ value: 0.5, reason: 'уровень не известен' })
  })

  it('чем ближе сложность к уровню, тем выше; значение в 0..1', () => {
    const ctx = { level: lvl(0.5) }
    expect(sig.compute(ctx, item(2)).value).toBe(1)
    expect(sig.compute(ctx, item(1)).value).toBeCloseTo(1 - 0.25 / 0.75, 6)
    expect(sig.compute(ctx, item(3)).value).toBeCloseTo(1 - 0.25 / 0.75, 6)
    const far = sig.compute({ level: lvl(0) }, item(3)).value
    expect(far).toBeGreaterThanOrEqual(0)
    expect(far).toBeLessThan(0.1)
  })

  it('каждый 5-й слайд целится на ступень выше', () => {
    const ctx = { level: lvl(0.25) }
    expect(sig.compute(ctx, item(1, 3)).value).toBe(1) // обычный: по уровню
    expect(sig.compute(ctx, item(2, 4)).value).toBe(1) // рывок: ступень выше
    expect(sig.compute(ctx, item(1, 4)).value).toBeLessThan(1)
  })

  it('голосов мало — читает сложность админа, а не сырую медиану', () => {
    const adminItem = { module: { id: 'm', difficulty: 1, difficultyVotes: 1, difficultyAdmin: 3 }, index: 0, words: [], info: { total: 0, newWords: [], shaky: [] } }
    expect(sig.compute({ level: lvl(0.75) }, adminItem).value).toBe(1)
    expect(sig.compute({ level: lvl(0.25) }, adminItem).value).toBeLessThan(1)
  })

  it('мусорная сложность не ломает (считается как 1)', () => {
    const v = sig.compute({ level: lvl(0.25) }, item(null)).value
    expect(v).toBe(1)
  })
})
