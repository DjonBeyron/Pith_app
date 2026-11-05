import { describe, it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { useRaceActs } from './useRaceActs.js'
import { buildRaceStages } from './raceStages.js'
import { sprintTarget } from './raceSprint2.js'
import { GOOD_IDS, GOOD_DELAY_MS, GOOD_ARM_MS } from './raceGood.js'
import { fixturePlan } from '../rehearsal/rehearsalFixtures.js'
import { normalizePlan } from '../rehearsal/rehearsalPlan.js'
import { normalizeLines } from '../player/modules/rotate-phone/wordLaneCatLines.js'
import { createStudentGame, stepStudent } from '../player/modules/rotate-phone/wordLaneStudent.js'
import { stepTargets } from '../player/modules/rotate-phone/wordLaneRecipe.js'
import { LISTEN_Y_MIN } from '../player/modules/rotate-phone/wordLaneTimeline.js'

// Единый путь похвалы «Гонки» (v3.3.115): ЛЮБАЯ реплика race_good_* — голос, тап, второй круг — идёт через sayLineLater (Пит занят с зачёта), задержка GOOD_DELAY_MS отсчитывается от взлёта пилюли (win → cat.praiseTakeoff).
// Мгновенно (sayLine) похвала не звучит нигде, в том числе на «ловушка пропущена» (там зачёта-claim нет, реплики успеха нет).
const plan = normalizePlan({ ...fixturePlan('three'), game: 'race' })

function probe(sid, stagesIn = null) {
  const out = {}
  const stages = stagesIn ?? buildRaceStages({ plan, rate: 1, lib: () => null }).stages
  const sayLine = vi.fn(), sayLineLater = vi.fn(), sayText = vi.fn(), praiseTakeoff = vi.fn()
  const stageObj = stages.find(s => s.sid === sid)
  function P() {
    Object.assign(out, useRaceActs({ plan, stages, stage: 'run', at: 0, stageObj, setS() {}, sayLine, sayLineLater, sayText, cat: { busyLeft: () => 0, praiseTakeoff }, lines: normalizeLines(null), rate: 1, listenerRef: { current: null } }))
    return null
  }
  renderToStaticMarkup(createElement(P))
  return { rh: out, stages, stageObj, sayLine, sayLineLater, praiseTakeoff }
}
const goodCalls = h => h.sayLineLater.mock.calls.filter(c => GOOD_IDS.includes(c[0]))

describe('похвала: один путь для всех зачётов', () => {
  it('голос: claim → sayLineLater(id, null, GOOD_DELAY_MS, GOOD_ARM_MS), sayLine с похвалой не зовётся', () => {
    const h = probe('sprint')
    h.rh.claim({ idx: 0 }, 900)
    expect(h.sayLineLater).toHaveBeenCalledWith(h.stageObj.good[0].id, null, GOOD_DELAY_MS, GOOD_ARM_MS)
    expect(h.sayLine.mock.calls.filter(c => GOOD_IDS.includes(c[0]))).toEqual([])
  })
  it('тап вместо речи: движок отдаёт то же событие claim (слушатель принимает tap(цель) как сказанное слово) — тот же путь', () => {
    const st = buildRaceStages({ plan, rate: 1, lib: () => null }).stages.find(s => s.sid === 'sprint')
    const g = createStudentGame({ step: st.step, chunks: st.step.chunks, estMs: () => 400, maxTries: st.step.maxTries })
    const target = stepTargets(st.step, st.step.chunks).repTarget[0]
    let t = 0
    while (!stepStudent(g, (t += 16)).some(e => e.type === 'spawn')) { /* ждём пилюлю */ }
    while (!g.reps[0].pills.every(p => p.y >= LISTEN_Y_MIN)) stepStudent(g, (t += 16))
    const ev = stepStudent(g, (t += 16), { seq: [target], confirmed: true }).find(e => e.type === 'claim') // seq с тапа = seq с голоса
    expect(ev).toBeTruthy()
    const h = probe('sprint')
    h.rh.claim(ev.rep, ev.ms)
    expect(goodCalls(h)).toHaveLength(1); expect(h.sayLine).not.toHaveBeenCalled()
  })
  it('«Слушай и лови»: верное слово — через sayLineLater; «ловушка пропущена» (fail на ловушке) и «поверил» не вызывают мгновенной похвалы', () => {
    const h = probe('catch')
    const i = h.stageObj.words.findIndex(w => !w.trap), tr = h.stageObj.words.findIndex(w => w.trap)
    h.rh.claim({ idx: i }, 1200)
    expect(goodCalls(h)).toHaveLength(1)
    h.rh.rec('fail', { idx: tr }) // ловушка пропущена = верно
    h.rh.rec('miss', { idx: tr, believed: true })
    expect(h.sayLine.mock.calls.filter(c => GOOD_IDS.includes(c[0]))).toEqual([])
    expect(h.sayLineLater.mock.calls.length).toBe(1) // и отложенной второй тоже нет: claims не растут
  })
  it('второй круг: похвала по плану второго круга (первая не раньше 3-го принятия), тоже через sayLineLater', () => {
    const { stages } = buildRaceStages({ plan, rate: 1, lib: () => null })
    const first = stages.find(s => s.sid === 'sprint')
    sprintTarget(stages, first, { results: Object.fromEntries(first.words.map((_, i) => [i, { hit: i > 1, miss: false }])) }, plan.seed)
    const h = probe('sprint2', stages)
    const n = h.stageObj.words.length
    for (let i = 0; i < n; i++) h.rh.claim({ idx: i }, 800)
    expect(goodCalls(h).map(c => c[0])).toEqual(h.stageObj.good.map(g => g.id))
    expect(h.stageObj.good[0].at).toBeGreaterThanOrEqual(3)
    expect(h.sayLine).not.toHaveBeenCalled()
  })
  it('взлёт: win последнего куска → cat.praiseTakeoff (отсчёт задержки); win не последнего куска и промахи — нет', () => {
    const h = probe('sprint')
    h.rh.rec('win', { idx: 0, last: true }); expect(h.praiseTakeoff).toHaveBeenCalledTimes(1)
    h.rh.rec('win', { idx: 1, last: false }); expect(h.praiseTakeoff).toHaveBeenCalledTimes(1)
    h.rh.rec('miss', { idx: 2 }); h.rh.rec('fail', { idx: 3 }); expect(h.praiseTakeoff).toHaveBeenCalledTimes(1)
  })
  it('страховка отсчёта: GOOD_ARM_MS — потолок ожидания взлёта (больше ожидания зачёт → взлёт, меньше суммы с задержкой)', () => {
    expect(GOOD_ARM_MS).toBeGreaterThan(600); expect(GOOD_ARM_MS + GOOD_DELAY_MS).toBeLessThan(3500)
  })
})
