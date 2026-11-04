import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { round2Words, sprintTarget, failedIn, ROUND2_BOOST, ROUND2_STEP } from './raceSprint2.js'
import { buildRaceStages } from './raceStages.js'
import { sprintWords } from './raceWords.js'
import { fixturePlan } from '../rehearsal/rehearsalFixtures.js'
import { normalizePlan } from '../rehearsal/rehearsalPlan.js'

const plan = normalizePlan({ ...fixturePlan('three'), game: 'race' })
const words = sprintWords(plan)
const ok = { hit: true, miss: false }

describe('второй круг «Разгона»', () => {
  it('failedIn: нет результата, не сказал и сказал не то — ошибка; верно — нет', () => {
    expect(failedIn(undefined)).toBe(true); expect(failedIn({ hit: false, miss: false })).toBe(true); expect(failedIn({ hit: true, miss: true })).toBe(true); expect(failedIn(ok)).toBe(false)
  })
  it('без ошибок второго круга нет', () => {
    expect(round2Words(words, Object.fromEntries(words.map((_, i) => [i, ok])), plan.seed)).toEqual([])
  })
  it('слова с ошибками + 1–2 удавшихся вперемешку; скорость старта на 10 % выше конца первого круга, дальше +5 % на пилюлю', () => {
    const results = Object.fromEntries(words.map((_, i) => [i, i < 2 ? { hit: false, miss: false } : ok])) // два слова не дались
    const r2 = round2Words(words, results, plan.seed)
    const bad = new Set([words[0].text, words[1].text])
    expect(r2.filter(w => bad.has(w.text))).toHaveLength(2)
    const good = r2.filter(w => !bad.has(w.text)); expect(good.length).toBeGreaterThanOrEqual(1); expect(good.length).toBeLessThanOrEqual(2)
    const last = Math.max(...words.map(w => w.speed))
    expect(r2[0].speed).toBeCloseTo(last * ROUND2_BOOST, 3)
    r2.forEach((w, i) => { expect(w.idx).toBe(i); expect(w.lane).toBe(i % 3); if (i) expect(w.speed / r2[i - 1].speed).toBeCloseTo(ROUND2_STEP, 2) })
    expect(r2).toEqual(round2Words(words, results, plan.seed)) // от семени
  })
  it('sprintTarget: после первого круга без ошибок — мимо второго; с ошибкой — на объявление второго, слова вписаны в стадию', () => {
    const { stages } = buildRaceStages({ plan })
    const first = stages.find(s => s.sid === 'sprint'), second = stages.find(s => s.sid === 'sprint2'), ann = stages.find(s => s.sid === 'sprint2-ann')
    expect(ann.round.title).toBe(''); expect(ann.line).toBe('race_sprint_round2') // без плашки
    const clean = { results: Object.fromEntries(first.words.map((_, i) => [i, ok])) }
    expect(stages[sprintTarget(stages, first, clean, plan.seed)]).toBe(stages[stages.indexOf(second) + 1])
    const dirty = { results: { ...Object.fromEntries(first.words.map((_, i) => [i, ok])), 0: { hit: false, miss: true } } }
    const before = second.words.length
    expect(sprintTarget(stages, first, dirty, plan.seed)).toBe(stages.indexOf(ann))
    expect(second.words.length).toBeLessThan(before); expect(second.step.reps).toHaveLength(second.words.length); expect(second.step.id).toBe('sprint2')
    expect(second.step.reps[0].speed).toBeGreaterThan(Math.max(...first.words.map(w => w.speed)))
    expect(sprintTarget(stages, stages[0], dirty, plan.seed)).toBeNull() // не первый круг — обычный порядок
  })
  it('без Math.random', () => { expect(readFileSync(new URL('./raceSprint2.js', import.meta.url), 'utf8')).not.toMatch(/Math\.random\(/) })
})
