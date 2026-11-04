import { describe, it, expect } from 'vitest'
import { buildStages, listenStepOf, labelsFor } from '../player/modules/rotate-phone/wordLaneStages.js'
import { buildRaceStages } from './raceStages.js'
import { createStudentGame, yOfPill } from '../player/modules/rotate-phone/wordLaneStudent.js'
import { stepTargets } from '../player/modules/rotate-phone/wordLaneRecipe.js'
import { SPEED } from '../player/modules/rotate-phone/wordLaneTimeline.js'
import { fixturePlan } from '../rehearsal/rehearsalFixtures.js'
import { normalizePlan } from '../rehearsal/rehearsalPlan.js'
import { isStudentStage, engineKind } from '../rehearsal/rehearsalKinds.js'
import { estChunkMs } from '../player/modules/rotate-phone/wordLaneAudio.js'
import { CATCH_AFTER_WORD_MS } from './raceStagesCatch.js'
import { CLIMB_STEP_SPEED, CLIMB_PILL_Y0 } from './raceClimbTimer.js'

const plan = (id = 'three', extra = {}) => normalizePlan({ ...fixturePlan(id), game: 'race', ...extra })
const build = (p = plan(), rate = 1) => buildStages({ chunks: p.chunks, plan: p, rate })
const of = (stages, act) => stages.filter(s => s.act === act)

describe('стадии гонки в формате движка', () => {
  it('buildStages с plan.game = race делегирует в raceStages; без race — репетиция как раньше', () => {
    const r = build()
    expect(r.stages.every(s => s.race === true)).toBe(true)
    expect(r.stages.map((s, i) => s.idx === i)).not.toContain(false)
    expect(Object.keys(r).sort()).toEqual(['chunkCurves', 'chunkMs', 'clipMode', 'lanes', 'recipe', 'stages'])
    const rh = buildStages({ chunks: ['a'], plan: normalizePlan({ phrase: 'a', words: [] }) })
    expect(rh.stages.some(s => s.race)).toBe(false)
    expect(buildRaceStages({ plan: plan() }).stages.map(s => s.type)).toEqual(r.stages.map(s => s.type))
  })
  it('порядок: плашка и разгон, плашка и три захода, плашка и ступени с плашками вершины и «время вышло», спуск (плашка, читка, «твоя очередь», ответ), итог', () => {
    const st = build().stages
    const seq = st.map(s => `${s.act}:${s.type}`)
    expect(seq[0]).toBe('sprint:announce'); expect(seq[1]).toBe('sprint:student')
    expect(seq.slice(2, 6)).toEqual(['catch:announce', 'catch:discern', 'catch:discern', 'catch:discern'])
    expect(of(st, 'climb').filter(s => s.type === 'student')).toHaveLength(4)
    expect(seq.slice(-5)).toEqual(['descent:announce', 'descent:read', 'descent:turn', 'descent:student', 'summary:summary'])
    expect(st.filter(s => s.type === 'announce').map(s => s.line)).toEqual(['race_sprint', 'race_catch', 'race_climb', 'race_climb_top', 'race_climb_time', 'race_descent'])
  })
  it('разгон: одна ступень ученика, по повтору на пилюлю; у повтора своя дорожка, скорость (+5 %), перевод внутри и слово, которое проявится при промахе', () => {
    const [s] = of(build().stages, 'sprint').filter(x => x.type === 'student')
    const { reps, chunks } = s.step
    expect(isStudentStage(s)).toBe(true)
    expect(reps.length).toBeGreaterThanOrEqual(6)
    expect(reps[0].speed).toBe(1); expect(reps[1].speed).toBeCloseTo(1.05, 3)
    expect(reps.every((r, i) => r.parts[0] === i && [0, 1, 2].includes(r.lane) && r.cap && r.reveal === chunks[i])).toBe(true)
    expect(s.step.maxTries).toBe(1) // упущенную пилюлю не повторяют
    expect(s.step.labels).toEqual([]) // перевод внутри пилюли, а не над дорожкой
    expect(stepTargets(s.step, chunks).texts.length).toBe(new Set(chunks).size) // цели — английские слова, словарь Vosk шире (двойники)
    expect(s.step.extra).toEqual(expect.arrayContaining(['earn', 'lean']))
  })
  it('движок: у повтора своя дорожка и скорость — пилюля падает быстрее на 5 % (yOfPill), без rep.lane / speed всё как было', () => {
    const [s] = of(build().stages, 'sprint').filter(x => x.type === 'student')
    const g = createStudentGame({ step: s.step, chunks: s.step.chunks, estMs: () => 400 })
    expect(g.reps.map(r => r.lanes[0])).toEqual(s.step.reps.map(r => r.lane))
    expect(g.reps[1].cap).toBe(s.step.reps[1].cap); expect(g.reps[2].reveal).toBe(s.step.chunks[2])
    const p0 = { spawnAt: 0, speed: 1 }, p1 = { spawnAt: 0, speed: 1.05 }
    expect(yOfPill(p1, 1000) - yOfPill(p0, 1000)).toBeCloseTo(SPEED * 0.05, 5)
    expect(yOfPill({ spawnAt: 0 }, 1000)).toBe(yOfPill(p0, 1000))
    const plain = createStudentGame({ step: { reps: [{ parts: [0] }, { parts: [1] }], parts: [0, 1] }, chunks: ['a', 'b'] })
    expect(plain.reps.map(r => [r.lanes[0], r.speed, r.cap])).toEqual([[0, 1, null], [1, 1, null]])
  })
  it('слушай и лови: три захода типа discern; пилюли молчат (written), слово — голосом (sayText), ответ голосом (speak), слушатель берёт ступень; заход повторяется один раз', () => {
    const stages = build().stages
    const st = of(stages, 'catch').filter(s => s.type === 'discern')
    expect(st).toHaveLength(3)
    for (const s of st) {
      expect(engineKind(s)).toBe('discern')
      expect(s.speak).toBe(true); expect(s.maxTries).toBe(2)
      expect(s.sayText).toBe(s.prompts[0].text)
      expect(s.prompts[0].written).toBe(true)
      const p = s.prompts[0] // слово звучит ДО пилюль: сразу (sayAt 0), пилюли выезжают после слова + 300 мс, речь считается, когда все три открылись
      expect(p.sayAt).toBe(0); expect(p.lead).toBe(Math.round(estChunkMs(s.sayText) + CATCH_AFTER_WORD_MS)) // длина слова (нет озвучки — оценка) + пауза
      expect(p.voiceFrom).toBeGreaterThan(p.lead)
      expect(s.prompts[0].caps.filter(Boolean)).toHaveLength(3)
      expect(s.prompts[0].texts[s.prompts[0].answer[0]]).toBe(s.sayText)
      expect(s.step.chunks).toEqual([s.sayText]) // верно засчитывается только оно
      expect(s.step.extra.length).toBeGreaterThanOrEqual(2) // чужие слова и двойники — в словаре, но не цели
    }
    const i = stages.indexOf(st[0])
    expect(listenStepOf(stages, i)).toBe(st[0].step) // слушатель — на заходе
    expect(listenStepOf(stages, i - 1)).toBe(st[0].step) // и уже под плашкой раунда
  })
  it('вершина: ступень k — первые k слов одним высказыванием; пилюля — одна, подписей над дорожками нет, времени ступени нет (пилюля почти стоит), maxTries 1', () => {
    const st = of(build().stages, 'climb').filter(s => s.type === 'student')
    expect(st.map(s => s.step.text)).toEqual(["I'm", "I'm trying", "I'm trying to", "I'm trying to learn"])
    expect(st.map(s => s.k)).toEqual([1, 2, 3, 4])
    expect(st.every(s => s.step.maxTries === 1 && s.step.reps.length === 1 && s.step.labels.length === 0)).toBe(true)
    expect(st.map(s => s.step.maxWords)).toEqual([1, 2, 2, 2])
    expect(labelsFor(st[0], ['a', 'b', 'c'], [0, 1, 2]).every(l => !l.text)).toBe(true)
    expect(st.every(s => s.step.reps[0].speed === CLIMB_STEP_SPEED && s.step.reps[0].y0 === CLIMB_PILL_Y0)).toBe(true) // собственное «не успел» движка ≈ 36 с: время ограничивает общий таймер
    const tail = of(build().stages, 'climb').slice(-2)
    expect(tail.map(s => s.sid)).toEqual(['climb-top', 'climb-time']); expect(tail.map(s => s.line)).toEqual(['race_climb_top', 'race_climb_time'])
  })
  it('спуск: читка на rate 1,1 (озвучка короче в 1,1 раза), потом человек ровно один раз всей фразой', () => {
    const slow = buildRaceStages({ plan: plan(), rate: 1 }).stages, fast = buildRaceStages({ plan: plan(), rate: 1 }).stages
    const d = of(fast, 'descent'), s = d.find(x => x.type === 'student'), read = d.find(x => x.type === 'read')
    expect(s.step.parts).toEqual([0, 1, 2]); expect(s.step.maxTries).toBe(1)
    expect(read.plan.reps).toHaveLength(1)
    expect(s.step.chunkMs[0]).toBeCloseTo(buildRaceStages({ plan: plan(), rate: 1 }).chunkMs[0] / 1.1, 5)
    expect(slow.filter(x => x.act === 'descent' && x.type === 'student')).toHaveLength(1)
    expect(labelsFor(s, ['a', 'b', 'c'], [0, 1, 2]).map(l => l.text)).toEqual(['a', 'b', 'c']) // подписи кусков над дорожками остались
  })
  it('один раунд — только его стадии; итога нет', () => {
    const st = build(plan('three', { round: 'catch' })).stages
    expect(new Set(st.map(s => s.act))).toEqual(new Set(['catch']))
  })
})
