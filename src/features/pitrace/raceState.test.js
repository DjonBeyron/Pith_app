import { describe, it, expect } from 'vitest'
import { initRace, reduceRace, climbTarget, STREAK_GOLD, STREAK_FIRE } from './raceState.js'
import { buildRaceStages } from './raceStages.js'
import { fixturePlan } from '../rehearsal/rehearsalFixtures.js'
import { normalizePlan } from '../rehearsal/rehearsalPlan.js'

const plan = normalizePlan({ ...fixturePlan('three'), game: 'race' })
const { stages } = buildRaceStages({ plan })
const stageOf = (act, type) => stages.find(s => s.act === act && s.type === type)
const sprintStage = stageOf('sprint', 'student')
const ev = (s, t, stage, info) => reduceRace(s, { t, stage, info })
function feed(s, list) { const out = []; for (const e of list) { const r = ev(s, e[0], e[1], e[2]); s = r.state; out.push(r) } return { s, out } }

describe('состояние гонки: события движка → серия, лестница', () => {
  it('разгон: серия растёт на верных, на 3 — золото, на 5 — огонь, голосом серий нет; промах и «не успел» обнуляют, слово — к повтору', () => {
    let s = ev(initRace(), 'enter', sprintStage).state
    expect(s.sprint.words.length).toBeGreaterThanOrEqual(6)
    const wins = Array.from({ length: 5 }, (_, i) => ['win', sprintStage, { idx: i }])
    const { s: s5, out } = feed(s, wins)
    expect(out.map(r => r.say)).toEqual([null, null, null, null, null])
    expect(s5.streak).toBe(5); expect(s5.streakMode).toBe('fire'); expect(STREAK_GOLD).toBe(3); expect(STREAK_FIRE).toBe(5)
    expect(out[2].state.streakMode).toBe('gold')
    const miss = ev(s5, 'miss', sprintStage, { idx: 5 }).state
    expect(miss.streak).toBe(0); expect(miss.streakMode).toBeUndefined(); expect(miss.sprint.results[5].miss).toBe(true)
    const fail = ev(s5, 'fail', sprintStage, { idx: 5 })
    expect(fail.state.streak).toBe(0); expect(fail.log).toContain('к повтору'); expect(fail.state.best).toBe(5)
  })
  it('разгон: мини-реплика успеха на принятии слова по плану круга (первое верное и далее раз в 3–4), в «Вершине» claim ничего не делает (в «Слушай и лови» он работает как в разгоне: raceStateCatch.test.js)', () => {
    let s = ev(initRace(), 'enter', sprintStage).state
    const said = []
    for (let i = 0; i < sprintStage.words.length; i++) { const r = ev(s, 'claim', sprintStage, { idx: i }); s = r.state; said.push(r.say) }
    expect(said.filter(Boolean)).toEqual(sprintStage.good.map(g => g.id))
    expect(said.findIndex(Boolean)).toBe(0) // первое принятое слово — уже реплика
    expect(said.every(x => x === null || x.startsWith('race_good_'))).toBe(true)
    const c = stages.find(x => x.act === 'climb' && x.type === 'student')
    expect(ev(s, 'claim', c).state).toBe(s)
  })
  it('разгон, второй круг: результаты пишутся отдельно (r2), слова круга и счёт принятий — свои', () => {
    const second = stages.find(x => x.sid === 'sprint2')
    second.fill(sprintStage.words.slice(0, 3).map((w, idx) => ({ ...w, idx })))
    let s = ev(initRace(), 'enter', sprintStage).state
    s = ev(s, 'fail', sprintStage, { idx: 0 }).state
    s = ev(s, 'enter', second).state
    expect(s.sprint.r2.words).toEqual(sprintStage.words.slice(0, 3).map(w => w.text))
    s = ev(s, 'win', second, { idx: 1 }).state; s = ev(s, 'miss', second, { idx: 2 }).state
    expect(s.sprint.r2.results).toEqual({ 1: { hit: true, miss: false }, 2: { hit: false, miss: true } })
    expect(s.sprint.results).toEqual({ 0: { hit: false, miss: true } }) // первый круг не тронут
    expect(s.sprint.claims).toBe(0)
  })
  it('вершина: заходы и ступень по событиям; nextIdx лестницы ведёт на ступень k + 1 после попадания, ниже после промаха, на плашку вершины после верха', () => {
    const k = n => stages.find(s => s.sid === `climb-${n}`)
    const at = s => climbTarget(stages, stages[stages.indexOf(k(1))], s)
    let s = ev(initRace(), 'enter', k(1)).state
    expect(s.climb.attempts).toBe(1)
    s = ev(s, 'win', k(1)).state
    expect(stages[at(s)].sid).toBe('climb-2')
    s = ev(ev(s, 'enter', k(2)).state, 'fail', k(2)).state // стоял на 1-й, остаётся
    expect(stages[at(s)].sid).toBe('climb-2')
    for (const n of [2, 3, 4]) s = ev(ev(s, 'enter', k(n)).state, 'win', k(n)).state
    expect(s.climb.top).toBe(true)
    expect(stages[at(s)].sid).toBe('climb-top')
    expect(climbTarget(stages, stages[0], s)).toBeNull() // не лестница — обычный порядок стадий
  })
  it('вершина, общий таймер: первый заход запускает часы, взятая ступень +1 к запасу; timeout — подъём стоит на текущем острове, дальше плашка climb-time, а после climb-top она перескакивается', () => {
    const k = n => stages.find(s => s.sid === `climb-${n}`)
    let s = reduceRace(initRace(), { t: 'enter', stage: k(1), now: 7000 }).state
    expect(s.climb.t0).toBe(7000)
    s = ev(s, 'win', k(1)).state; s = reduceRace(s, { t: 'enter', stage: k(2), now: 9000 }).state
    expect(s.climb.t0).toBe(7000); expect(s.climb.wins).toBe(1)
    const out = reduceRace(s, { t: 'timeout', stage: k(2) })
    expect(out.state.climb).toMatchObject({ timedOut: true, rung: 1, top: false }); expect(out.log).toContain('время вышло')
    expect(stages[climbTarget(stages, k(2), out.state)].sid).toBe('climb-time')
    const top = stages.find(x => x.sid === 'climb-top'), time = stages.find(x => x.sid === 'climb-time')
    expect(stages[climbTarget(stages, top, { climb: { top: true } })].sid).toBe(stages[stages.indexOf(time) + 1].sid) // плашку «время вышло» после вершины пропускаем
    expect(climbTarget(stages, time, out.state)).toBeNull() // после climb-time — обычный порядок: спуск
  })
  it('вершина: сказал не то (miss) — соскальзывание с репликой «ой, соскользнул»; на подсказке голосом реплики нет, Пит говорит слово', () => {
    const k = n => stages.find(s => s.sid === `climb-${n}`)
    let s = ev(ev(initRace(), 'enter', k(1)).state, 'win', k(1)).state
    s = ev(s, 'enter', k(2)).state
    const first = ev(s, 'miss', k(2)); expect(first.say).toBe('race_climb_slip'); expect(first.state.climb.last).toBe('slip'); expect(first.hint).toBeNull()
    const second = ev(ev(first.state, 'enter', k(2)).state, 'miss', k(2)); expect(second.hint).toBe(2); expect(second.say).toBeNull()
  })
  it('подсказка: на втором промахе ступени редюсер просит Пита сказать слово этой ступени', () => {
    const k = n => stages.find(s => s.sid === `climb-${n}`)
    let s = ev(initRace(), 'enter', k(1)).state
    s = ev(ev(s, 'win', k(1)).state, 'enter', k(2)).state
    const first = ev(s, 'fail', k(2)); expect(first.hint).toBeNull()
    const second = ev(ev(first.state, 'enter', k(2)).state, 'fail', k(2))
    expect(second.hint).toBe(2); expect(k(2).word).toBe('trying')
  })
  it('спуск: win приходит на каждый кусок фразы — считается только последний (info.last)', () => {
    const d = stageOf('descent', 'student')
    const mid = reduceRace(initRace(), { t: 'win', stage: d, info: { last: false, count: 3 } })
    expect(mid.state.descent).toBeNull(); expect(mid.log).toBeNull()
    const end = reduceRace(mid.state, { t: 'win', stage: d, info: { last: true, count: 3 } })
    expect(end.state.descent).toBe('ok'); expect(end.log).toContain('спуск')
  })
  it('спуск: один раз — верно или нет; чужие стадии и события без race игнорируются', () => {
    const d = stageOf('descent', 'student')
    expect(ev(initRace(), 'win', d).state.descent).toBe('ok')
    expect(ev(initRace(), 'fail', d).state.descent).toBe('miss')
    expect(ev(initRace(), 'win', { act: 'sprint', type: 'student' }).state).toEqual(initRace())
  })
})
