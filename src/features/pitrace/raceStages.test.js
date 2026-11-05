import { describe, it, expect } from 'vitest'
import { buildStages, listenStepOf, labelsFor } from '../player/modules/rotate-phone/wordLaneStages.js'
import { buildRaceStages } from './raceStages.js'
import { createStudentGame, yOfPill } from '../player/modules/rotate-phone/wordLaneStudent.js'
import { stepTargets } from '../player/modules/rotate-phone/wordLaneRecipe.js'
import { SPEED } from '../player/modules/rotate-phone/wordLaneTimeline.js'
import { fixturePlan } from '../rehearsal/rehearsalFixtures.js'
import { normalizePlan } from '../rehearsal/rehearsalPlan.js'
import { isStudentStage, engineKind } from '../rehearsal/rehearsalKinds.js'
import { PRE_SAY_GAP_MS } from './raceStageKit.js'
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
  it('порядок: плашка и разгон, плашка и «Слушай и лови» (по два круга), плашка и ступени с плашками вершины и «время вышло», спуск (плашка, читка, «твоя очередь», ответ), итог', () => {
    const st = build().stages
    const seq = st.map(s => `${s.act}:${s.type}`)
    expect(seq.slice(0, 4)).toEqual(['sprint:announce', 'sprint:student', 'sprint:announce', 'sprint:student']) // первый и второй круг разгона (второй идёт, только если были ошибки)
    expect(seq.slice(4, 8)).toEqual(['catch:announce', 'catch:student', 'catch:announce', 'catch:student']) // «Слушай и лови» — инверсия разгона: тоже два круга
    expect(of(st, 'climb').filter(s => s.type === 'student')).toHaveLength(4)
    expect(seq.slice(-5)).toEqual(['descent:announce', 'descent:read', 'descent:turn', 'descent:student', 'summary:summary'])
    expect(st.filter(s => s.type === 'announce').map(s => s.line)).toEqual(['race_sprint', 'race_sprint_round2', 'race_catch', 'race_sprint_round2', 'race_climb', 'race_climb_top', 'race_climb_time', 'race_descent'])
  })
  it('разгон: одна ступень ученика, по повтору на пилюлю; у повтора своя дорожка, скорость (+5 %), перевод внутри, без слова, которое проявлялось при промахе (тихий промах)', () => {
    const [s] = of(build().stages, 'sprint').filter(x => x.type === 'student')
    const { reps, chunks } = s.step
    expect(isStudentStage(s)).toBe(true)
    expect(reps.length).toBeGreaterThanOrEqual(6)
    expect(reps[0].speed).toBe(1); expect(reps[1].speed).toBeCloseTo(1.05, 3)
    expect(reps.every((r, i) => r.parts[0] === i && [0, 1, 2].includes(r.lane) && r.cap && r.reveal === undefined)).toBe(true)
    expect(s.step).toMatchObject({ quiet: true, edge: true, holdAll: true, overlap: true }); expect(s.step.id).toBe('sprint')
    expect(s.step.maxTries).toBe(1) // упущенную пилюлю не повторяют
    expect(s.step.labels).toEqual([]) // перевод внутри пилюли, а не над дорожкой
    expect(stepTargets(s.step, chunks).texts.length).toBe(new Set(chunks).size) // цели — английские слова, словарь Vosk шире (двойники)
    expect(s.step.extra).toEqual(expect.arrayContaining(['earn', 'lean']))
  })
  it('движок: у повтора своя дорожка и скорость — пилюля падает быстрее на 5 % (yOfPill), без rep.lane / speed всё как было', () => {
    const [s] = of(build().stages, 'sprint').filter(x => x.type === 'student')
    const g = createStudentGame({ step: s.step, chunks: s.step.chunks, estMs: () => 400 })
    expect(g.reps.map(r => r.lanes[0])).toEqual(s.step.reps.map(r => r.lane))
    expect(g.reps[1].cap).toBe(s.step.reps[1].cap); expect(g.reps[2].reveal).toBeNull()
    const p0 = { spawnAt: 0, speed: 1 }, p1 = { spawnAt: 0, speed: 1.05 }
    expect(yOfPill(p1, 1000) - yOfPill(p0, 1000)).toBeCloseTo(SPEED * 0.05, 5)
    expect(yOfPill({ spawnAt: 0 }, 1000)).toBe(yOfPill(p0, 1000))
    const plain = createStudentGame({ step: { reps: [{ parts: [0] }, { parts: [1] }], parts: [0, 1] }, chunks: ['a', 'b'] })
    expect(plain.reps.map(r => [r.lanes[0], r.speed, r.cap])).toEqual([[0, 1, null], [1, 1, null]])
  })
  it('проход B (инверсия прохода A): та же ступень одной пилюли, на пилюле русский перевод (cap), английское слово для голоса Пита (say), цель — русский перевод, ловушки (trap); дополнительный круг catch2; сцены discern / speak больше нет', () => {
    const stages = build().stages
    const st = of(stages, 'catch').filter(s => s.type === 'student')
    expect(st.map(s => s.sid)).toEqual(['catch', 'catch2'])
    expect(of(stages, 'catch').some(s => s.type === 'discern' || s.speak)).toBe(false)
    const [s] = st, { reps, chunks } = s.step
    expect(isStudentStage(s)).toBe(true); expect(engineKind(s)).toBe('student')
    expect(s.step).toMatchObject({ id: 'catch', quiet: true, edge: true, holdAll: true, overlap: true, preSay: true, preGap: PRE_SAY_GAP_MS, maxTries: 1 })
    expect(s.step.labels).toEqual([])
    expect(reps.length).toBe(s.words.length)
    reps.forEach((r, i) => {
      const w = s.words[i]
      expect(r.parts).toEqual([i]); expect(r.lane).toBe(i % 3); expect(r.cap).toBe(w.translation); expect(r.say).toBe(w.text); expect(r.trap).toBeUndefined() // ловушек нет
      expect(chunks[i]).toBe(w.translation) // цель — русский перевод (то, что ученик говорит); в голосе Пита — английское слово, на пилюле — этот же перевод
    })
    expect(reps.every(r => !r.trap)).toBe(true); expect(s.words.every(w => !w.trap && w.shown === w.translation)).toBe(true)
    const g = createStudentGame({ step: s.step, chunks, estMs: () => 400, maxTries: 1 })
    expect(g.reps.map(r => [r.trap, r.say])).toEqual(reps.map(r => [!!r.trap, r.say]))
    const i = stages.indexOf(s)
    expect(listenStepOf(stages, i)).toBe(s.step) // слушатель — на ступени
    expect(stages.filter(x => x.act === 'catch' && x.type === 'announce').map(x => x.line)).toEqual(['race_catch', 'race_sprint_round2'])
    expect(s.step.tapOnly).toBe(true); expect(s.step.lang).toBeUndefined() // русской модели в этом тесте нет — проход B на тапе, переключения слуха нет
    expect(stages.some(x => x.switchTo)).toBe(false)
  })
  it('проход B голосом (русская модель скачана, «Говорю»): перед ним плашка переключения слуха, step.lang = ru, цели — переводы; в полной гонке перед вершиной слух возвращается; demote переводит проход на тап', () => {
    const stages = buildRaceStages({ plan: plan(), tap: false, ru: true }).stages
    const sw = stages.filter(x => x.switchTo), ids = stages.map(x => x.sid)
    expect(sw.map(x => [x.sid, x.switchTo, x.line])).toEqual([['catch-sw', 'ru', 'race_switch_ru'], ['climb-sw', 'en', null]])
    expect(sw[0].round.title).toBe('Секунду'); expect(sw[0].round.brief).toBe('переключаю слух')
    expect(ids.indexOf('catch2')).toBeLessThan(ids.indexOf('climb-sw')); expect(ids.indexOf('sprint2')).toBeLessThan(ids.indexOf('catch-sw')); expect(ids.indexOf('catch-sw')).toBeLessThan(ids.indexOf('catch-ann'))
    const [b, b2] = of(stages, 'catch').filter(x => x.type === 'student')
    expect(b.step.lang).toBe('ru'); expect(b.step.tapOnly).toBeUndefined(); expect(b.step.extra).toEqual([]); expect(b2.step.lang).toBe('ru')
    expect(of(stages, 'sprint').find(x => x.type === 'student').step.lang).toBeUndefined() // проход A — английская модель
    b.demote(); expect(b.step.lang).toBeUndefined(); expect(b.step.tapOnly).toBe(true); expect(b2.step.tapOnly).toBe(true)
    expect(of(buildRaceStages({ plan: plan(), tap: true, ru: true }).stages, 'catch').some(x => x.switchTo)).toBe(false) // «Тапаю»: модель не нужна
    expect(of(buildRaceStages({ plan: plan('three', { round: 'stages' }), tap: false, ru: true }).stages, 'climb')).toHaveLength(0) // «Вспомни на слух + финал»: вершины нет — возвращать слух перед ней не нужно
  })
  it('разгон и слушай и лови собираются одним набором (raceStageKit.queueStep): общие флаги и выдержка PRE_SAY_GAP_MS; у разгона нет say / trap', () => {
    const stages = build().stages
    const sp = of(stages, 'sprint').find(x => x.type === 'student').step, ct = of(stages, 'catch').find(x => x.type === 'student').step
    for (const k of ['quiet', 'edge', 'holdAll', 'overlap', 'preSay', 'preGap', 'claimGap', 'maxTries']) expect(sp[k]).toEqual(ct[k])
    expect(sp.reps.every(r => r.say === undefined && r.trap === undefined)).toBe(true)
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
