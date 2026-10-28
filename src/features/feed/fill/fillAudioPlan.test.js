import { describe, it, expect } from 'vitest'
import { planFillAudio, planLengthMs, MEOW_MS, LEAD_GUARD_S, LAST_WORD_S } from './fillAudioPlan.js'

describe('planFillAudio: до слова → мяу → после', () => {
  it('слово в середине: три шага, «мяу» — пауза 350 мс', () => {
    const plan = planFillAudio({ start: 1.2, end: 1.7, durationSec: 3 })
    expect(plan.steps).toEqual([
      { kind: 'play', stage: 'before', from: 0, to: 1.2 - LEAD_GUARD_S },
      { kind: 'meow', stage: 'meow', ms: MEOW_MS },
      { kind: 'play', stage: 'after', from: 1.7, to: null },
    ])
    expect(MEOW_MS).toBe(350)
  })

  it('слово первое: куска «до» нет', () => {
    const plan = planFillAudio({ start: 0.02, end: 0.5, durationSec: 2 })
    expect(plan.steps.map(s => s.stage)).toEqual(['meow', 'after'])
  })

  it('слово последнее: куска «после» нет (начало остатка у самого конца файла)', () => {
    const plan = planFillAudio({ start: 2.0, end: 2.6, durationSec: 2.62 })
    expect(plan.steps.map(s => s.stage)).toEqual(['before', 'meow'])
  })

  it('конец слова неизвестен: берём начало следующего слова, а его нет — условную длину', () => {
    expect(planFillAudio({ start: 1, nextStart: 1.4, durationSec: 5 }).steps.at(-1).from).toBe(1.4)
    expect(planFillAudio({ start: 1, durationSec: 5 }).steps.at(-1).from).toBeCloseTo(1 + LAST_WORD_S, 5)
    // конец раньше начала — мусор, как будто его нет
    expect(planFillAudio({ start: 1, end: 0.5, nextStart: 1.3, durationSec: 5 }).steps.at(-1).from).toBe(1.3)
  })

  it('длина файла неизвестна: «после» играет до конца файла', () => {
    const plan = planFillAudio({ start: 1, end: 1.5 })
    expect(plan.steps.at(-1)).toEqual({ kind: 'play', stage: 'after', from: 1.5, to: null })
  })

  it('нет начала слова — плана нет (реплика останется текстом)', () => {
    expect(planFillAudio({})).toBeNull()
    expect(planFillAudio({ start: NaN })).toBeNull()
    expect(planFillAudio({ start: -1 })).toBeNull()
    expect(planFillAudio()).toBeNull()
    expect(planFillAudio({ start: '1' })).toBeNull()
  })

  it('своя длина «мяу»', () => {
    expect(planFillAudio({ start: 1, end: 1.4, meowMs: 500 }).steps[1].ms).toBe(500)
  })

  it('planLengthMs: куски + пауза; хвост без длины файла не считается', () => {
    const plan = planFillAudio({ start: 1.03, end: 1.5, durationSec: 3 })
    expect(planLengthMs(plan, 3)).toBe(Math.round(1000 + MEOW_MS + 1500))
    expect(planLengthMs(plan)).toBe(1000 + MEOW_MS)
    expect(planLengthMs(null)).toBe(0)
  })
})
