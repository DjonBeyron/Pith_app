import { describe, it, expect } from 'vitest'
import { resultScore, wordWeakness, bossWords, bossFill, BOSS_MAX, BOSS_MIN, BOSS_SPEED } from './bossWords.js'
import { buildRaceStages } from '../raceStages.js'
import { initRace } from '../raceState.js'
import { miaSkip } from '../mia/miaRound.js'
import { reduceMia, miaInit, MIA } from '../mia/raceMia.js'
import { fixturePlan } from '../../rehearsal/rehearsalFixtures.js'
import { normalizePlan } from '../../rehearsal/rehearsalPlan.js'

const W = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((text, idx) => ({ text, translation: text.toUpperCase(), idx, lane: idx % 3, speed: 1 }))
const state = results => { const s = initRace(); s.sprint = { ...s.sprint, words: W.map(w => w.text), results }; return s }

describe('слабость слова', () => {
  it('ошибка / молчание — 3, ответ в последний момент — 2, иначе время ответа в долях 4 с, нет результата — 1', () => {
    expect(resultScore({ hit: false })).toBe(3); expect(resultScore({ hit: true, miss: true })).toBe(3); expect(resultScore({ hit: true, late: true })).toBe(2)
    expect(resultScore({ hit: true, ms: 2000 })).toBe(0.5); expect(resultScore({ hit: true, ms: 99999 })).toBe(1.5); expect(resultScore(undefined)).toBe(1)
  })
  it('по всем проходам берётся наибольшая слабость (ошибка в круге 2 — слово слабое)', () => {
    const s = state({ 0: { hit: true, ms: 800 } }); s.sprint.r2 = { words: ['a'], results: { 0: { hit: false, miss: true } } }
    expect(wordWeakness(s, 'a')).toBe(3); expect(wordWeakness(s, 'zzz')).toBe(1)
  })
})

describe('слова финала', () => {
  it('до BOSS_MAX самых слабых; порядок — от прочных к слабым; одна дорожка по центру, скорость BOSS_SPEED', () => {
    const s = state({ 0: { hit: false }, 1: { hit: true, late: true }, 2: { hit: true, ms: 500 }, 3: { hit: true, ms: 1500 }, 4: { hit: false }, 5: { hit: true, ms: 100 }, 6: { hit: true, ms: 3000 }, 7: { hit: true, late: true } })
    const out = bossWords(W, s, 7)
    expect(out).toHaveLength(BOSS_MAX); expect(out.every(w => w.lane === 1 && w.speed === BOSS_SPEED)).toBe(true); expect(out.map(w => w.idx)).toEqual([0, 1, 2, 3, 4, 5])
    const sc = out.map(w => wordWeakness(s, w.text)); expect(sc).toEqual([...sc].sort((a, b) => a - b)) // от прочных к слабым
    expect(out.map(w => w.text)).toEqual(expect.arrayContaining(['a', 'e'])) // обе ошибки в финале
    expect(out.map(w => w.text)).not.toContain('f') // самое прочное слово в финал не попало
  })
  it('слов меньше BOSS_MIN — пусто; тот же семя — тот же набор', () => {
    expect(bossWords(W.slice(0, BOSS_MIN - 1), initRace(), 1)).toEqual([]); expect(bossWords(W, initRace(), 5)).toEqual(bossWords(W, initRace(), 5))
  })
})

describe('финал в стадиях гонки', () => {
  const plan = normalizePlan({ ...fixturePlan('three'), game: 'race' })
  const stages = () => buildRaceStages({ plan, tap: false, ru: true }).stages
  it('перед итогом церемония Мии (boss-ann: always, mia ann, реплика pit_forgot) и круг (boss: mia round, wide, noBoost, noLeave, одна дорожка)', () => {
    const st = stages(), i = st.findIndex(x => x.sid === 'boss-ann')
    expect(st[i]).toMatchObject({ type: 'announce', mia: 'ann', always: true, line: 'pit_forgot', act: 'boss' }); expect(st[i].waitCap).toBeGreaterThan(30000); expect(st[i]).toMatchObject({ count: 'after', soft: true })
    expect(st[i + 1]).toMatchObject({ type: 'student', sid: 'boss', mia: 'round', noBoost: true, noLeave: true }); expect(st[i + 1].step).toMatchObject({ wide: true, overlap: false }); expect(st[i + 1].step.reps.every(r => r.lane === 1)).toBe(true)
    expect(st[i + 2].type).toBe('summary')
  })
  it('в «Тапаю» финала нет', () => { expect(buildRaceStages({ plan, tap: true, ru: true }).stages.some(x => x.act === 'boss')).toBe(false) })
  it('bossFill вписывает слабые слова этой игры; мало слов — empty, и nextIdx обходит финал (miaSkip: always)', () => {
    const st = stages(), i = st.findIndex(x => x.sid === 'boss-ann'), r = st[i + 1]
    const sp = st.find(x => x.sid === 'sprint'); const s = initRace(); s.sprint = { ...s.sprint, words: sp.words.map(w => w.text), results: { 0: { hit: false } } }
    expect(bossFill(st, s, 3)).toBe(i); expect(r.words.map(w => w.text)).toContain(sp.words[0].text); expect(r.step.reps).toHaveLength(r.words.length); expect(st[i].empty).toBe(false)
    expect(miaSkip(st, i, { phase: 'off' })).toBe(i)
    st[i].empty = r.empty = true; expect(miaSkip(st, i, { phase: 'off' }, j => j)).toBe(i + 2)
  })
})

describe('Мия в финале', () => {
  const ann = { type: 'announce', act: 'boss', sid: 'boss-ann', mia: 'ann', always: true }
  const round = { type: 'student', act: 'boss', sid: 'boss', mia: 'round', noBoost: true, noLeave: true, words: [{ text: 'a' }] }
  it('ускорения нет (noBoost), цвет дорожки меняется (fast), три верных подряд Мия не уходит (noLeave)', () => {
    let m = reduceMia(miaInit(), { t: 'enter', stage: ann, now: 1000 }).mia
    const r = reduceMia(m, { t: 'enter', stage: round }); expect(r.boost).toBeNull(); expect(r.mia.fast).toBe(true); m = r.mia
    for (let i = 0; i < MIA.STREAK_LEAVE + 1; i++) m = reduceMia(m, { t: 'win', stage: round, idx: 0, now: 2000 }).mia
    expect(m.phase).toBe('in'); expect(m.streak).toBe(MIA.STREAK_LEAVE + 1)
    expect(reduceMia(m, { t: 'enter', stage: { type: 'summary', act: 'summary' }, now: 3000 }).mia.phase).toBe('out') // уходит на итоге
  })
})
