import { describe, it, expect, vi, afterEach } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { useRaceActs } from './useRaceActs.js'
import { buildRaceStages } from './raceStages.js'
import { extraTarget } from './raceExtraRound.js'
import { GOOD_IDS, ALL_GOOD_IDS, OK_ID, GOOD_DELAY_MS, GOOD_ARM_MS } from './raceGood.js'
import { fixturePlan } from '../rehearsal/rehearsalFixtures.js'
import { normalizePlan } from '../rehearsal/rehearsalPlan.js'
import { normalizeLines } from '../player/modules/rotate-phone/wordLaneCatLines.js'
import { createStudentGame, stepStudent } from '../player/modules/rotate-phone/wordLaneStudent.js'
import { stepTargets } from '../player/modules/rotate-phone/wordLaneRecipe.js'
import { LISTEN_Y_MIN } from '../player/modules/rotate-phone/wordLaneTimeline.js'

// Единый путь похвалы «Гонки» (v3.3.117): ЛЮБАЯ реплика race_good_* — голос, тап, второй круг — идёт через секвенсор речи (raceSpeech.js): sayLine(id, null, { pause: 0, onSpeak, onEnd }) через GOOD_DELAY_MS от ВЗЛЁТА
// пилюли (rec('win')), а не sayLineLater (старый таймер остался репетиции). Мгновенно похвала не звучит нигде, в том числе на «ловушка пропущена» (там зачёта-claim нет, реплики успеха нет).
afterEach(() => vi.useRealTimers())
const plan = normalizePlan({ ...fixturePlan('three'), game: 'race' })

function probe(sid, stagesIn = null) {
  const out = {}
  const stages = stagesIn ?? buildRaceStages({ plan, rate: 1, lib: () => null }).stages
  const sayLine = vi.fn(), sayLineLater = vi.fn(), sayText = vi.fn()
  const stageObj = stages.find(s => s.sid === sid)
  function P() {
    Object.assign(out, useRaceActs({ plan, stages, stage: 'run', at: 0, stageObj, setS() {}, sayLine, sayLineLater, sayText, cat: { busyLeft: () => 0, onStop: () => () => {} }, lines: normalizeLines(null), rate: 1, listenerRef: { current: null } }))
    return null
  }
  renderToStaticMarkup(createElement(P))
  return { rh: out, stages, stageObj, sayLine, sayLineLater }
}
const goodCalls = h => h.sayLine.mock.calls.filter(c => ALL_GOOD_IDS.includes(c[0]))
const claimAndRise = (h, rep, ms, idx = rep.idx) => { h.rh.claim(rep, ms); h.rh.rec('win', { idx, last: true }); vi.advanceTimersByTime(GOOD_DELAY_MS + 50) } // зачёт → взлёт → похвала через 500 мс

describe('похвала: один путь для всех зачётов', () => {
  it('голос: claim → взлёт → через GOOD_DELAY_MS sayLine(id, null, { pause: 0, onSpeak, onEnd }); sayLineLater не зовётся', () => {
    vi.useFakeTimers()
    const h = probe('sprint')
    h.rh.claim({ idx: 0 }, 900)
    expect(goodCalls(h)).toEqual([]) // до взлёта пилюли похвалы нет
    h.rh.rec('win', { idx: 0, last: true })
    vi.advanceTimersByTime(GOOD_DELAY_MS - 1); expect(goodCalls(h)).toEqual([])
    vi.advanceTimersByTime(1)
    expect(h.sayLine).toHaveBeenCalledWith(h.stageObj.good[0].id, null, expect.objectContaining({ pause: 0, onSpeak: expect.any(Function), onEnd: expect.any(Function) }))
    expect(h.sayLineLater).not.toHaveBeenCalled()
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
    vi.useFakeTimers()
    const h = probe('sprint')
    claimAndRise(h, ev.rep, ev.ms)
    expect(goodCalls(h)).toHaveLength(1); expect(h.sayLineLater).not.toHaveBeenCalled()
  })
  it('«Слушай и лови»: верное слово — через секвенсор; «ловушка пропущена» (fail на ловушке) и «поверил» не вызывают похвалы', () => {
    vi.useFakeTimers()
    const h = probe('catch')
    const i = h.stageObj.words.findIndex(w => !w.trap), tr = h.stageObj.words.findIndex(w => w.trap)
    claimAndRise(h, { idx: i }, 1200)
    expect(goodCalls(h)).toHaveLength(1); expect(goodCalls(h)[0][0]).toBe(OK_ID) // проход B: просто «Отлично», не похвала за произношение
    h.rh.rec('fail', { idx: tr }) // ловушка пропущена = верно
    h.rh.rec('miss', { idx: tr, believed: true })
    vi.advanceTimersByTime(5000)
    expect(goodCalls(h)).toHaveLength(1) // второй похвалы нет: claims не растут
  })
  it('второй круг: похвала по плану второго круга (первая не раньше 3-го принятия), тоже через секвенсор', () => {
    vi.useFakeTimers()
    const { stages } = buildRaceStages({ plan, rate: 1, lib: () => null })
    const first = stages.find(s => s.sid === 'sprint')
    extraTarget(stages, first, { results: Object.fromEntries(first.words.map((_, i) => [i, { hit: i > 1, miss: false }])) }, plan.seed)
    const h = probe('sprint2', stages)
    const n = h.stageObj.words.length
    for (let i = 0; i < n; i++) claimAndRise(h, { idx: i }, 800)
    expect(goodCalls(h).map(c => c[0])).toEqual(h.stageObj.good.map(g => g.id))
    expect(h.stageObj.good[0].at).toBeGreaterThanOrEqual(3)
    expect(h.sayLine.mock.calls.every(c => GOOD_IDS.includes(c[0]))).toBe(true)
  })
  it('взлёт: win последнего куска запускает отсчёт похвалы; win не последнего куска и промахи — нет', () => {
    vi.useFakeTimers()
    const h = probe('sprint')
    h.rh.claim({ idx: 0 }, 900)
    h.rh.rec('win', { idx: 0, last: false }); h.rh.rec('miss', { idx: 2 }); h.rh.rec('fail', { idx: 3 })
    vi.advanceTimersByTime(GOOD_DELAY_MS + 50); expect(goodCalls(h)).toEqual([]) // это не взлёт пилюли
    h.rh.rec('win', { idx: 0, last: true }); vi.advanceTimersByTime(GOOD_DELAY_MS + 50); expect(goodCalls(h)).toHaveLength(1)
  })
  it('страховка отсчёта: GOOD_ARM_MS — потолок ожидания взлёта (больше ожидания зачёт → взлёт, меньше суммы с задержкой)', () => {
    expect(GOOD_ARM_MS).toBeGreaterThan(600); expect(GOOD_ARM_MS + GOOD_DELAY_MS).toBeLessThan(3500)
  })
})
