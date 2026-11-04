import { describe, it, expect } from 'vitest'
import { buildStages } from '../player/modules/rotate-phone/wordLaneStages.js'
import { createStudentGame, stepStudent, isDeaf, liveRep, yOfPill, FAIL_Y } from '../player/modules/rotate-phone/wordLaneStudent.js'
import { stepTargets } from '../player/modules/rotate-phone/wordLaneRecipe.js'
import { LISTEN_Y_MIN, LISTEN_Y_MAX } from '../player/modules/rotate-phone/wordLaneTimeline.js'
import { fixturePlan } from '../rehearsal/rehearsalFixtures.js'
import { normalizePlan } from '../rehearsal/rehearsalPlan.js'

// «Разгон» — очередь пилюль (step.overlap): дорожки 0, 1, 2, 0 …; следующая пилюля выезжает сразу, как текущая принята или недоступна; скорость +5 % сохраняется.
const plan = normalizePlan({ ...fixturePlan('three'), game: 'race' })
const sprint = () => buildStages({ chunks: plan.chunks, plan, rate: 1 }).stages.find(s => s.act === 'sprint' && s.type === 'student')
const make = (o = {}) => { const s = sprint(); return { s, g: createStudentGame({ step: { ...s.step, ...o }, chunks: s.step.chunks, estMs: () => 400, maxTries: s.step.maxTries }), targets: stepTargets(s.step, s.step.chunks).repTarget } }
/** Шаги по 16 мс, пока не случится событие нужного типа (или не пройдёт limit мс); input — функция времени */
function run(g, from, type, input = () => ({}), limit = 12000) {
  for (let t = from; t < from + limit; t += 16) {
    const ev = stepStudent(g, t, input(t))
    if (ev.some(e => e.type === type)) return { t, ev }
  }
  return null
}

describe('«Разгон»: очередь пилюль', () => {
  it('ступень помечена overlap, дорожки строго по очереди 0, 1, 2, 0, 1, 2, скорость +5 % за пилюлю', () => {
    const { s, g } = make()
    expect(s.step.overlap).toBe(true); expect(g.overlap).toBe(true)
    expect(s.step.reps.map(r => r.lane)).toEqual(s.step.reps.map((_, i) => i % 3))
    s.step.reps.forEach((r, i) => expect(r.speed).toBeCloseTo(1.05 ** i, 3))
  })
  it('верный ответ: следующая пилюля выезжает в тот же шаг, пока прежняя взлетает (две живые); слушаем только новую', () => {
    const { g, targets } = make({ goodAt: [] }) // принятие без мини-реплики Пита — выезд сразу
    const first = run(g, 0, 'spawn'); expect(first.ev.find(e => e.type === 'spawn').rep.idx).toBe(0)
    let t = first.t
    while (!g.reps[0].pills.every(p => p.y >= LISTEN_Y_MIN)) stepStudent(g, (t += 16))
    const ev = stepStudent(g, (t += 16), { seq: [targets[0]], confirmed: true })
    expect(ev.map(e => e.type)).toEqual(expect.arrayContaining(['claim', 'spawn']))
    const sp = ev.find(e => e.type === 'spawn')
    expect(sp.rep.idx).toBe(1); expect(sp.pills[0].lane).toBe(1); expect(sp.pills[0].speed).toBeCloseTo(1.05, 3)
    expect(g.reps[0].state).toBe('lock'); expect(g.reps[1].state).toBe('fly')
    expect(g.pills.length).toBe(2) // уходящая (взлетает) и новая
    expect(liveRep(g).idx).toBe(1)
    // слушатель слушает новую: пока она не открылась, слово — «ничьё» (late); открылась — слово первой пилюли для неё чужое, слово второй принимается
    expect(stepStudent(g, (t += 16), { seq: [targets[0], targets[0]], confirmed: true }).some(e => e.type === 'late')).toBe(true)
    while (!g.reps[1].pills.every(p => p.y >= LISTEN_Y_MIN)) stepStudent(g, (t += 16), { seq: [targets[0], targets[0]] })
    expect(stepStudent(g, (t += 16), { seq: [targets[0], targets[0], targets[0]], confirmed: true }).some(e => e.type === 'miss' && e.wrong)).toBe(true)
    while (g.reps[1].drain) stepStudent(g, (t += 16), { seq: [targets[0], targets[0], targets[0]] })
    expect(stepStudent(g, (t += 16), { seq: [targets[0], targets[0], targets[0], targets[1]], confirmed: true }).some(e => e.type === 'claim' && e.rep.idx === 1)).toBe(true)
  })
  it('принятие с мини-репликой успеха (goodAt): следующая пилюля выезжает не в тот же шаг, а через claimGap; пока Пит говорит (hold), ждёт и следующие пилюли', () => {
    const { s, g, targets } = make()
    expect(s.step.goodAt[0]).toBe(1); expect(s.step.holdAll).toBe(true)
    const first = run(g, 0, 'spawn')
    let t = first.t
    while (!g.reps[0].pills.every(p => p.y >= LISTEN_Y_MIN)) stepStudent(g, (t += 16))
    const claim = stepStudent(g, (t += 16), { seq: [targets[0]], confirmed: true })
    expect(claim.map(e => e.type)).toContain('claim'); expect(claim.some(e => e.type === 'spawn')).toBe(false)
    expect(stepStudent(g, (t += 16), { hold: true }).some(e => e.type === 'spawn')).toBe(false) // Пит говорит — ждём
    expect(stepStudent(g, (t += 600), { hold: false }).some(e => e.type === 'spawn')).toBe(true) // договорил — пилюля выехала
  })
  it('недоступная пилюля (ответить уже нельзя): следующая выезжает в тот же шаг, не дожидаясь полного ухода прежней', () => {
    const { g } = make()
    const first = run(g, 0, 'spawn')
    const f = run(g, first.t, 'fail')
    const ev = f.ev
    expect(ev.find(e => e.type === 'fail').rep.idx).toBe(0)
    const sp = ev.find(e => e.type === 'spawn')
    expect(sp.rep.idx).toBe(1); expect(sp.pills[0].lane).toBe(1)
    expect(g.failed.some(p => !p.gone)).toBe(true) // прежняя ещё на экране, доезжает вниз
    expect(g.pills.length).toBe(2)
    expect(FAIL_Y).toBeLessThan(LISTEN_Y_MAX) // «не успел» (96) наступает раньше, чем пилюля ушла на 50 % (100)
  })
  it('isDeaf: пилюля ниже LISTEN_Y_MAX недоступна', () => {
    const rep = y => ({ state: 'fly', pills: [{ state: 'fly', y }] })
    expect(isDeaf(rep(LISTEN_Y_MAX + 1))).toBe(true); expect(isDeaf(rep(LISTEN_Y_MAX - 1))).toBe(false)
  })
  it('без очереди (обычная игра) следующий повтор ждёт паузы после принятого, живой повтор один', () => {
    const step = { parts: [0, 1], reps: [{ parts: [0] }, { parts: [1] }] }
    const g = createStudentGame({ step, chunks: ['a', 'b'], estMs: () => 400 })
    const { repTarget } = stepTargets(step, ['a', 'b'])
    expect(g.overlap).toBe(false)
    const first = run(g, 0, 'spawn'); let t = first.t
    while (!g.reps[0].pills.every(p => p.y >= LISTEN_Y_MIN)) stepStudent(g, (t += 16))
    const ev = stepStudent(g, (t += 16), { seq: [repTarget[0]], confirmed: true })
    expect(ev.some(e => e.type === 'spawn')).toBe(false)
    expect(g.reps[1].state).toBe('todo')
  })
  it('скорость пилюли в очереди растёт на 5 %: yOfPill второй быстрее первой', () => {
    const { g } = make()
    const d = yOfPill({ spawnAt: 0, speed: g.reps[1].speed }, 1000) - yOfPill({ spawnAt: 0, speed: g.reps[0].speed }, 1000)
    expect(d).toBeGreaterThan(0)
  })
})
