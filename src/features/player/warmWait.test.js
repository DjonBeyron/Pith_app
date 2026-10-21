import { describe, it, expect } from 'vitest'
import { keepWaiting, WARM_HARD_MS, WARM_STALL_MS } from './warmWait.js'
import { WARM_MAX_MS } from './preloadWarm.js'

const start = 10000, deadline = start + WARM_MAX_MS

describe('keepWaiting — точки «печатает» перед не прогретой нодой', () => {
  it('прогрета — не ждём; не прогрета — ждём обычный порог', () => {
    expect(keepWaiting({ warm: true, now: start, deadline, lastProgressAt: start })).toBe(false)
    expect(keepWaiting({ warm: false, now: deadline - 1, deadline, lastProgressAt: null })).toBe(true)
  })

  it('порог вышел, файл качается (байты приходили недавно) — ждём дальше, но не дольше WARM_HARD_MS от начала', () => {
    expect(keepWaiting({ warm: false, now: deadline + 1, deadline, lastProgressAt: deadline })).toBe(true)
    expect(keepWaiting({ warm: false, now: start + WARM_HARD_MS - 1, deadline, lastProgressAt: start + WARM_HARD_MS - 100 })).toBe(true)
    expect(keepWaiting({ warm: false, now: start + WARM_HARD_MS, deadline, lastProgressAt: start + WARM_HARD_MS })).toBe(false)
  })

  it('порог вышел, загрузка встала (нет байтов дольше WARM_STALL_MS) или ничего не качается — отпускаем', () => {
    expect(keepWaiting({ warm: false, now: deadline + 1, deadline, lastProgressAt: deadline + 1 - WARM_STALL_MS })).toBe(false)
    expect(keepWaiting({ warm: false, now: deadline + 1, deadline, lastProgressAt: null })).toBe(false)
  })
})
