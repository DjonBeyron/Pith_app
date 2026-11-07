import { describe, it, expect } from 'vitest'
import { initRace, reduceRace } from './raceState.js'
import { buildRaceStages } from './raceStages.js'
import { fixturePlan } from '../rehearsal/rehearsalFixtures.js'
import { normalizePlan } from '../rehearsal/rehearsalPlan.js'
import { createStudentGame, stepStudent, resumeIdx } from '../player/modules/rotate-phone/wordLaneStudent.js'
import { createDodge } from './raceDodge.js'
import { setupScene } from './racePhraseSceneRig.js'
import { CENTER_Y } from './racePhraseScene.js'
import { phraseStep, PHRASE_SPEED } from './raceStagesPhrases.js'
import { round1Turns } from './racePhraseTurns.js'
import { phrasesOf } from './racePhraseData.js'
import { PHRASE_FIXTURE } from './racePhraseFixture.js'

// «Продолжить» после паузы в «Встряхни память»: ступень идёт с хода, на котором была пауза (он заново), сыгранные ходы не повторяются,
// их итоги остаются в состоянии гонки один раз (raceState.resumeQueue), сцена фраз начинает с хода from (racePhraseScene), Пит встаёт под дорожку текущей пилюли (raceDodge).
const plan = normalizePlan({ ...fixturePlan('three'), game: 'race' })
const { stages } = buildRaceStages({ plan })
const sprint = stages.find(s => s.act === 'sprint' && s.type === 'student')
const sprint2 = stages.find(s => s.sid === 'sprint2')
const ev = (s, t, stage, info, from) => reduceRace(s, { t, stage, info, from }).state

describe('ступень очереди с повтора from (wordLaneStudent)', () => {
  const step = { ...sprint.step, preSay: false, holdAll: false }
  const chunks = step.chunks
  it('повторы до from не выкатываются (skip), первый выезд — повтор from, ступень кончается без них', () => {
    const g = createStudentGame({ step, chunks, maxTries: 1, from: 2 })
    expect(g.reps.slice(0, 2).map(r => r.state)).toEqual(['skip', 'skip'])
    const spawned = [], seq = []
    let done = null
    for (let t = 0; t < 120000 && !done; t += 16) {
      for (const e of stepStudent(g, t, { seq })) {
        if (e.type === 'spawn') { spawned.push(e.rep.idx); seq.push(e.rep.target) }
        if (e.type === 'done') done = e
      }
    }
    expect(spawned[0]).toBe(2)
    expect(spawned).toEqual(Array.from({ length: chunks.length - 2 }, (_, i) => i + 2))
    expect(done).toBeTruthy()
  })
  it('resumeIdx: первый ещё не разрешённый повтор (todo / fly); принятый (lock) и потерянный — сыграны', () => {
    const g = createStudentGame({ step, chunks, maxTries: 1 })
    expect(resumeIdx(g)).toBe(0)
    g.reps[0].state = 'won'; g.reps[1].state = 'lock'; g.reps[2].state = 'fly'
    expect(resumeIdx(g)).toBe(2)
    g.reps.forEach(r => { r.state = 'lost' })
    expect(resumeIdx(g)).toBe(g.reps.length)
  })
  it('без from — как раньше: все повторы todo', () => {
    expect(createStudentGame({ step, chunks }).reps.every(r => r.state === 'todo')).toBe(true)
  })
})

describe('состояние гонки: enter с from — круг не обнуляется, итоги не дублируются', () => {
  it('проход A: пауза на 2-м повторе (1-й верно, у 2-го промах до паузы) → после прохода 3 итога, а не 4; промах 2-го стёрт', () => {
    let s = ev(initRace(), 'enter', sprint)
    s = ev(s, 'claim', sprint, { idx: 0, ms: 900 }); s = ev(s, 'win', sprint, { idx: 0 })
    s = ev(s, 'miss', sprint, { idx: 1 })
    s = ev(s, 'enter', sprint, null, 1) // «Продолжить» с повтора 2
    expect(Object.keys(s.sprint.results)).toEqual(['0']); expect(s.sprint.claims).toBe(1)
    s = ev(s, 'claim', sprint, { idx: 1, ms: 800 }); s = ev(s, 'win', sprint, { idx: 1 }); s = ev(s, 'fail', sprint, { idx: 2 })
    expect(Object.keys(s.sprint.results)).toHaveLength(3)
    expect(s.sprint.results[1]).toMatchObject({ hit: true, miss: false })
    expect(s.sprint.claims).toBe(2)
    expect(s.sprint.words).toHaveLength(sprint.words.length)
  })
  it('принятый, но не долетевший до паузы (claim без win) — верно; второй круг не обнуляется', () => {
    let s = ev(initRace(), 'enter', sprint)
    s = ev(s, 'claim', sprint, { idx: 0, ms: 700 })
    s = ev(s, 'enter', sprint, null, 1)
    expect(s.sprint.results[0].hit).toBe(true)
    s = ev(s, 'enter', sprint2); s = ev(s, 'win', sprint2, { idx: 0 }); s = ev(s, 'fail', sprint2, { idx: 1 })
    s = ev(s, 'enter', sprint2, null, 1)
    expect(s.sprint.r2.results).toEqual({ 0: { hit: true, miss: false } })
    expect(s.sprint.r2.words).toHaveLength(sprint2.words.length)
  })
})

describe('сцена фраз с хода from (racePhraseScene)', () => {
  const ph = phrasesOf({ phrases: PHRASE_FIXTURE })
  const turns = round1Turns(ph, 's1')
  const step = phraseStep('phrases1', turns, { round: 1, mode: 'pick', voice: false, speed: PHRASE_SPEED })
  it('первый ход — from (Пит говорит его смысл), resumeAt до итога — он же', () => {
    const s = setupScene(step, { from: 1 })
    expect(s.run.api.resumeAt()).toBe(1)
    s.go(100)
    expect(s.fx.pre).toHaveBeenCalledTimes(1); expect(s.fx.pre.mock.calls[0][0].rep.idx).toBe(1)
    expect(s.run.api.resumeAt()).toBe(1)
  })
  it('после итога хода resumeAt — следующий; from = число ходов — круг сразу кончается', () => {
    const s = setupScene(step)
    s.go(100); expect(s.run.api.resumeAt()).toBe(0)
    const key = turns[0].cands.find(c => c.right).key
    for (let i = 0; i < 2000; i++) { const p = s.run.api.state().pills.find(x => x.key === key); if (p && Math.abs(p.y - CENTER_Y) < 3) break; s.go(16) }
    s.run.api.tap(1)
    expect(s.fx.win).toHaveBeenCalledTimes(1); expect(s.run.api.resumeAt()).toBe(1)
    const e = setupScene(step, { from: turns.length }); e.go(50)
    expect(e.fx.finished).toHaveBeenCalledTimes(1); expect(e.fx.pre).not.toHaveBeenCalled()
  })
})

describe('Пит ныряет под дорожку текущей пилюли (raceDodge, from)', () => {
  it('start: дорожка повтора from, а не первого', () => {
    const d = createDodge({ lanes: [0, 2, 1], from: 1 })
    expect(d.start()).toMatchObject({ kind: 'dive', toLane: 2, why: 'продолжаем' })
    expect(createDodge({ lanes: [0, 2, 1] }).start()).toMatchObject({ toLane: 0, why: 'старт' })
  })
})
