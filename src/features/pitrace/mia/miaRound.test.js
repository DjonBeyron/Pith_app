import { describe, it, expect } from 'vitest'
import { miaWords, miaTarget, miaAllowed, miaSkip, miaRoute } from './miaRound.js'
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
  it('после каждого второго круга стоят церемония (…3-ann, mia: ann) и круг с Мией (…3, mia: round) — церемония держит три ноты за речью Мии (waitCap)', () => {
    for (const act of ['sprint', 'catch']) {
      const i2 = stages.findIndex(s => s.sid === `${act}2`)
      expect(stages[i2 + 1]).toMatchObject({ sid: `${act}3-ann`, type: 'announce', mia: 'ann', line: 'pit_forgot' }); expect(stages[i2 + 1].waitCap).toBeGreaterThan(30000)
      expect(stages[i2 + 2]).toMatchObject({ sid: `${act}3`, type: 'student', mia: 'round' }); expect(stages[i2 + 2].step.boost).toEqual({ k: 1 })
      expect(stages[i2 + 1]).toMatchObject({ count: 'after', soft: true }) // три ноты после церемонии, перед кругом
    }
  })
  it('miaTarget вписывает слова в круг с Мией (из слов круга 2) и возвращает номер церемонии; нет стадий — −1', () => {
    const r1 = stages.find(s => s.sid === 'sprint'), r2 = stages.find(s => s.sid === 'sprint2'), real = r1.words.slice(0, 4).map((w, i) => ({ ...w, idx: i, speed: 1.2 + i * 0.06 })); r2.fill(real)
    const i = miaTarget(stages, 'sprint', 5)
    expect(stages[i].sid).toBe('sprint3-ann'); const r3 = stages.find(s => s.sid === 'sprint3'); expect(r3.words.map(w => w.text).sort()).toEqual(real.map(w => w.text).sort()); expect(r3.step.reps).toHaveLength(real.length)
    expect(miaTarget(stages, 'climb', 5)).toBe(-1); expect(miaTarget([], 'sprint', 5)).toBe(-1)
  })
  it('miaRoute: шёл на плашку круга 2 — ведёт на церемонию Мии (один раз на проход); на другие стадии и после прихода Мии — −1', () => {
    const r1 = stages.find(s => s.sid === 'catch'), r2 = stages.find(s => s.sid === 'catch2'); r2.fill(r1.words.slice(0, 3).map((w, i) => ({ ...w, idx: i, speed: 1.2 })))
    const a2 = stages.findIndex(s => s.sid === 'catch2-ann'), a3 = stages.findIndex(s => s.sid === 'catch3-ann')
    expect(miaRoute(stages, a2, { used: {} }, 9)).toBe(a3); expect(miaRoute(stages, a2, { used: { catch: true } }, 9)).toBe(-1)
    expect(miaRoute(stages, a3, { used: {} }, 9)).toBe(-1); expect(miaRoute(stages, 0, { used: {} }, 9)).toBe(-1)
  })
  it('обход: пока Мия не вызвана (фаза не in), nextIdx пропускает церемонию и круг; когда вызвана — идёт на них', () => {
    const ann = stages.findIndex(s => s.sid === 'sprint3-ann'), after = ann + 2
    expect(miaSkip(stages, ann, { phase: 'off', act: '' })).toBe(after)
    expect(miaSkip(stages, ann, { phase: 'in', act: 'sprint' })).toBe(ann); expect(miaSkip(stages, ann + 1, { phase: 'in', act: 'sprint' })).toBe(ann + 1)
    expect(miaSkip(stages, ann, { phase: 'in', act: 'catch' })).toBe(after); expect(miaAllowed(stages[ann], { phase: 'in', act: 'sprint' })).toBe(true); expect(miaAllowed(stages[0], { phase: 'in', act: 'sprint' })).toBe(false)
  })
})
