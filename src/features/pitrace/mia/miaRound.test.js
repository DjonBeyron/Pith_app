import { describe, it, expect } from 'vitest'
import { miaWords, miaAfterPass, miaAllowed, miaSkip } from './miaRound.js'
import { buildRaceStages } from '../raceStages.js'
import { fixturePlan } from '../../rehearsal/rehearsalFixtures.js'
import { normalizePlan } from '../../rehearsal/rehearsalPlan.js'

// Маршрут эпизода «Мия» по стадиям: слова круга, прыжок на церемонию, обход скрытых стадий
const words = [{ text: 'a', speed: 1.2 }, { text: 'b', speed: 1.26 }, { text: 'c', speed: 1.32 }, { text: 'd', speed: 1.39 }]

describe('слова круга с Мией', () => {
  it('те же слова в другом порядке (по семени), дорожки по кругу, скорость от самой медленной +5 % на пилюлю', () => {
    const w = miaWords(words, 7, 'sprint')
    expect(w.map(x => x.text).sort()).toEqual(['a', 'b', 'c', 'd']); expect(w.map(x => x.idx)).toEqual([0, 1, 2, 3]); expect(w.map(x => x.lane)).toEqual([0, 1, 2, 0])
    expect(w[0].speed).toBe(1.2); expect(w[1].speed).toBeCloseTo(1.26, 3); expect(w[3].speed).toBeCloseTo(1.2 * 1.05 ** 3, 3)
    expect(miaWords(words, 7, 'sprint')).toEqual(w); expect(miaWords([], 7, 'sprint')).toEqual([])
  })
})

describe('стадии Мии в списке гонки', () => {
  const plan = normalizePlan({ ...fixturePlan('three'), game: 'race' })
  const stages = buildRaceStages({ plan, tap: true, ru: true }).stages
  it('после круга каждого прохода стоят церемония (…3-ann, mia: ann) и круг с Мией (…3, mia: round) — церемония держит три ноты за речью Мии (waitCap); дополнительного круга (…2) нет', () => {
    for (const act of ['sprint', 'catch']) {
      const i1 = stages.findIndex(s => s.sid === act)
      expect(stages.some(s => s.sid === `${act}2`)).toBe(false)
      expect(stages[i1 + 1]).toMatchObject({ sid: `${act}3-ann`, type: 'announce', mia: 'ann', line: 'pit_forgot' }); expect(stages[i1 + 1].waitCap).toBeGreaterThan(30000)
      expect(stages[i1 + 2]).toMatchObject({ sid: `${act}3`, type: 'student', mia: 'round' }); expect(stages[i1 + 2].step.boost).toEqual({ k: 1 })
      expect(stages[i1 + 1]).toMatchObject({ count: 'after', soft: true }) // три ноты после церемонии, перед кругом
    }
  })
  it('miaAfterPass: два слабых слова — церемония Мии, слова вписаны в её круг; меньше двух, Мия уже была, не проход — −1', () => {
    const r1 = stages.find(s => s.sid === 'sprint')
    const weak = { results: { 0: { hit: false, miss: true }, 1: { hit: false, miss: true } } }
    const i = miaAfterPass(stages, r1, weak, 5, { used: {} })
    expect(stages[i].sid).toBe('sprint3-ann'); const r3 = stages.find(s => s.sid === 'sprint3'); expect(r3.words.length).toBeGreaterThanOrEqual(2); expect(r3.step.reps).toHaveLength(r3.words.length)
    expect(miaAfterPass(stages, r1, weak, 5, { used: { catch: true } })).toBe(-1)
    const okAll = Object.fromEntries(r1.words.map((_, i) => [i, { hit: true, miss: false }]))
    expect(miaAfterPass(stages, r1, { results: { ...okAll, 0: { hit: false, miss: true } } }, 5, { used: {} })).toBe(-1) // одно слабое слово — Мии нет
    expect(miaAfterPass(stages, stages.find(s => s.sid === 'climb' || s.act === 'phrases'), weak, 5, { used: {} })).toBe(-1); expect(miaAfterPass([], r1, weak, 5, { used: {} })).toBe(-1)
  })
  it('обход: пока Мия не вызвана (фаза не in), nextIdx пропускает церемонию и круг; когда вызвана — идёт на них', () => {
    const ann = stages.findIndex(s => s.sid === 'sprint3-ann'), after = ann + 2
    expect(miaSkip(stages, ann, { phase: 'off', act: '' })).toBe(after)
    expect(miaSkip(stages, ann, { phase: 'in', act: 'sprint' })).toBe(ann); expect(miaSkip(stages, ann + 1, { phase: 'in', act: 'sprint' })).toBe(ann + 1)
    expect(miaSkip(stages, ann + 1, { phase: 'off', act: '' })).toBe(ann + 1) // круг сразу за церемонией открыт: конвейер заглядывает от церемонии вперёд, дорожки не гаснут
    expect(miaSkip(stages, ann, { phase: 'in', act: 'catch' })).toBe(after); expect(miaAllowed(stages[ann], { phase: 'in', act: 'sprint' })).toBe(true); expect(miaAllowed(stages[0], { phase: 'in', act: 'sprint' })).toBe(false)
  })
})
