import { describe, it, expect } from 'vitest'
import { signalFromEvent } from './levelSignals.js'
import { applySignal, emptyLevel } from './levelModel.js'
import { SIGNAL_WEIGHT, DIFF_TO_LEVEL } from './levelRules.js'

// Сигнал «лесенки» второго визита (features/feed/ladder): событие feed_ladder { steps, top, hard }

describe('signalFromEvent: feed_ladder', () => {
  it('top и hard → сигнал ladder', () => {
    expect(signalFromEvent('feed_ladder', { steps: '1:9000:0', top: 2, hard: 3 }, null)).toEqual({ type: 'ladder', top: 2, hardAt: 3 })
    expect(signalFromEvent('feed_ladder', { top: 1, hard: 0 }, null)).toEqual({ type: 'ladder', top: 1, hardAt: null })
    expect(signalFromEvent('feed_ladder', { top: 0, hard: 2 }, null)).toEqual({ type: 'ladder', top: null, hardAt: 2 })
  })
  it('ни потолка, ни трудности (или мусор) — сигнала нет', () => {
    expect(signalFromEvent('feed_ladder', { top: 0, hard: 0 }, null)).toBeNull()
    expect(signalFromEvent('feed_ladder', { top: 7, hard: '2' }, null)).toBeNull()
    expect(signalFromEvent('feed_ladder', null, null)).toBeNull()
  })
  it('вес сигнала умеренный: между одиночным досмотром и полным ответом', () => {
    expect(SIGNAL_WEIGHT.ladder).toBeGreaterThan(SIGNAL_WEIGHT.watched)
    expect(SIGNAL_WEIGHT.ladder).toBeLessThan(SIGNAL_WEIGHT.answer)
  })
})

describe('applySignal: ladder', () => {
  const base = emptyLevel()

  it('потолок «спокойно» поднимает ось ear и сужает неопределённость; vocab не трогает', () => {
    const out = applySignal(base, { type: 'ladder', top: 3, hardAt: null }, 1)
    expect(out.ear.level).toBeGreaterThan(base.ear.level)
    expect(out.ear.sigma).toBeLessThan(base.ear.sigma)
    expect(out.ear.n).toBe(1)
    expect(out.vocab).toEqual(base.vocab)
  })
  it('первая трудная ступень опускает ear; потолок + трудность — две наблюдения (n 2)', () => {
    const hard = applySignal(base, { type: 'ladder', top: null, hardAt: 1 }, 1)
    expect(hard.ear.level).toBeLessThan(base.ear.level)
    const both = applySignal(base, { type: 'ladder', top: 1, hardAt: 2 }, 1)
    expect(both.ear.n).toBe(2)
    expect(both.ear.level).toBeLessThan(base.ear.level) // трудно уже на средних — уровень ниже середины
  })
  it('потолок выше уровня тянет вверх сильнее, чем потолок ниже', () => {
    const high = applySignal(base, { type: 'ladder', top: 3, hardAt: null }, 1).ear.level
    const low = applySignal(base, { type: 'ladder', top: 1, hardAt: null }, 1).ear.level
    expect(high).toBeGreaterThan(low)
    expect(low).toBeGreaterThanOrEqual(DIFF_TO_LEVEL[1])
  })
  it('пустой сигнал уровень не меняет', () => {
    expect(applySignal(base, { type: 'ladder', top: null, hardAt: null }, 1).ear).toEqual(base.ear)
  })
})
