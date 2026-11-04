import { describe, it, expect } from 'vitest'
import { initRace, reduceRace } from './raceState.js'
import { buildRaceStages } from './raceStages.js'
import { fixturePlan } from '../rehearsal/rehearsalFixtures.js'
import { normalizePlan } from '../rehearsal/rehearsalPlan.js'

// «Слушай и лови» в состоянии гонки (raceState.js): результаты копятся отдельно (catch.results), как у разгона: hit / miss / ms / trap / believed.
const plan = normalizePlan({ ...fixturePlan('three'), game: 'race' })
const { stages } = buildRaceStages({ plan })
const stage = stages.find(s => s.sid === 'catch')
const second = stages.find(s => s.sid === 'catch2')
const ev = (s, t, st, info) => reduceRace(s, { t, stage: st, info })
const entered = () => ev(initRace(), 'enter', stage).state
const iTrap = stage.words.findIndex(w => w.trap), iOk = stage.words.findIndex(w => !w.trap)

describe('состояние гонки: «Слушай и лови»', () => {
  it('вход в этап: слова круга, их настоящие переводы (для слабых слов) и какие пилюли — ловушки; результаты разгона не тронуты', () => {
    const s = entered()
    expect(s.catch.words).toEqual(stage.words.map(w => w.text))
    expect(s.catch.caps[stage.words[0].text]).toBe(stage.words[0].translation)
    expect(s.catch.traps).toEqual(stage.words.map(w => w.trap)); expect(s.catch.traps.some(Boolean)).toBe(true)
    expect(s.sprint.results).toEqual({}); expect(s.catch.results).toEqual({})
  })
  it('верный перевод: принятие пишет время ответа (ms) и реплику успеха по плану; верное слово — hit, серия растёт', () => {
    let s = entered()
    const c = ev(s, 'claim', stage, { idx: iOk, ms: 1234 })
    expect(c.say).toBe(stage.good[0].id); expect(c.state.catch.results[iOk].ms).toBe(1234); expect(c.state.catch.claims).toBe(1)
    s = ev(c.state, 'win', stage, { idx: iOk })
    expect(s.state.catch.results[iOk]).toMatchObject({ hit: true, miss: false, ms: 1234 }); expect(s.state.streak).toBe(1); expect(s.log).toContain('1234')
  })
  it('верный перевод: «не успел» и чужое слово — ошибка (miss), серия 0, слово к повтору', () => {
    let s = ev(ev(entered(), 'win', stage, { idx: iOk }).state, 'fail', stage, { idx: iOk + 1 === iTrap ? iOk + 2 : iOk + 1 })
    expect(s.state.streak).toBe(0); expect(s.log).toContain('к повтору')
    const m = ev(entered(), 'miss', stage, { idx: iOk }).state
    expect(m.catch.results[iOk].miss).toBe(true); expect(m.streak).toBe(0)
  })
  it('ловушка (чужой перевод): промолчал — пилюля уехала (fail) — это верно: hit, серия растёт, ловушка пропущена', () => {
    const r = ev(entered(), 'fail', stage, { idx: iTrap })
    expect(r.state.catch.results[iTrap]).toMatchObject({ hit: true, trap: true }); expect(r.state.catch.results[iTrap].miss).toBeFalsy()
    expect(r.state.streak).toBe(1); expect(r.log).toContain('ловушка пропущена')
  })
  it('ловушка: сказал слово (believed) — ошибка «поверил чужому переводу», серия 0; пилюля потом уезжает — ошибка остаётся; чужое слово без believed на ловушке не считается', () => {
    const base = ev(entered(), 'win', stage, { idx: iOk }).state
    const b = ev(base, 'miss', stage, { idx: iTrap, believed: true })
    expect(b.state.catch.results[iTrap]).toMatchObject({ miss: true, believed: true, trap: true }); expect(b.state.streak).toBe(0); expect(b.log).toContain('поверил чужому переводу')
    const gone = ev(b.state, 'fail', stage, { idx: iTrap }).state
    expect(gone.catch.results[iTrap]).toMatchObject({ miss: true, believed: true }); expect(gone.streak).toBe(0)
    const other = ev(base, 'miss', stage, { idx: iTrap }) // шум / другое слово на ловушке: промолчание не нарушено
    expect(other.state).toBe(base); expect(other.log).toBeNull()
  })
  it('второй круг (catch2): результаты в catch.r2, первый круг не тронут', () => {
    const list = stage.words.slice(0, 3).map((w, idx) => ({ ...w, idx }))
    second.fill(list)
    let s = ev(entered(), 'fail', stage, { idx: iOk }).state
    s = ev(s, 'enter', second).state
    expect(s.catch.r2.words).toEqual(list.map(w => w.text)); expect(s.catch.r2.traps).toEqual(list.map(w => w.trap))
    s = ev(s, 'win', second, { idx: 0 }).state
    expect(s.catch.r2.results[0].hit).toBe(true)
    expect(s.catch.results[iOk].miss).toBe(true)
  })
})
