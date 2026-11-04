import { describe, it, expect } from 'vitest'
import { buildStages } from '../player/modules/rotate-phone/wordLaneStages.js'
import { createStudentGame, stepStudent } from '../player/modules/rotate-phone/wordLaneStudent.js'
import { stepTargets } from '../player/modules/rotate-phone/wordLaneRecipe.js'
import { LISTEN_Y_MIN } from '../player/modules/rotate-phone/wordLaneTimeline.js'
import { PRE_SAY_GAP_MS } from './raceStageKit.js'
import { fixturePlan } from '../rehearsal/rehearsalFixtures.js'
import { normalizePlan } from '../rehearsal/rehearsalPlan.js'

// «Слушай и лови» на движке пилюль (wordLaneStudent.js): ступень та же, что у разгона; у пилюли с чужим переводом (rep.trap) слово не принимается — это «поверил», а упущенная пилюля — верное действие.
const plan = normalizePlan({ ...fixturePlan('three'), game: 'race' })
const stage = buildStages({ chunks: plan.chunks, plan, rate: 1 }).stages.find(s => s.act === 'catch' && s.type === 'student' && s.sid === 'catch')
const make = () => ({ g: createStudentGame({ step: { ...stage.step, goodAt: [] }, chunks: stage.step.chunks, estMs: () => 400, maxTries: 1 }), targets: stepTargets(stage.step, stage.step.chunks).repTarget })
function until(g, from, type, input = () => ({}), limit = 15000) {
  for (let t = from; t < from + limit; t += 16) { const ev = stepStudent(g, t, input(t)); if (ev.some(e => e.type === type)) return { t, ev } }
  return null
}
/** Довести игру до выезда пилюли № idx и до того, как она открылась (слышно) */
function reach(g, idx) {
  let t = 0
  for (let k = 0; k <= idx; k++) {
    const sp = until(g, t, 'spawn'); t = sp.t
    while (!g.reps[k].pills.every(p => p.y >= LISTEN_Y_MIN)) stepStudent(g, (t += 16))
    if (k < idx) { const f = until(g, t, 'fail'); t = f.t + PRE_SAY_GAP_MS + 60 } // пропустили пилюлю — «не успел», выдержка
  }
  return t
}

describe('«Слушай и лови»: движок', () => {
  it('на верный перевод слово принимается как в разгоне: claim со временем ответа (ms от выезда пилюли)', () => {
    const { g, targets } = make()
    const t = reach(g, 0)
    const ev = stepStudent(g, t + 16, { seq: [targets[0]], confirmed: true })
    const claim = ev.find(e => e.type === 'claim')
    expect(claim.rep.idx).toBe(0); expect(claim.ms).toBe(Math.round(t + 16 - g.reps[0].spawnAt)); expect(claim.ms).toBeGreaterThan(0)
  })
  it('пилюля с ЧУЖИМ переводом (trap): слово не принимается — miss «поверил» (rep.believed), claim нет; упущенная пилюля — fail (верное действие)', () => {
    const { g, targets } = make()
    const iTrap = g.reps.findIndex(r => r.trap)
    expect(iTrap).toBeGreaterThan(0)
    const t = reach(g, iTrap)
    const ev = stepStudent(g, t + 16, { seq: [targets[iTrap]], confirmed: true })
    expect(ev.some(e => e.type === 'claim')).toBe(false); expect(g.reps[iTrap].state).toBe('fly')
    const miss = ev.find(e => e.type === 'miss')
    expect(miss.rep.idx).toBe(iTrap); expect(miss.wrong).toBe(true); expect(g.reps[iTrap].believed).toBe(true)
    const f = until(g, t + 32, 'fail', () => ({ seq: [targets[iTrap]] })) // пилюля уезжает вниз
    expect(f.ev.find(e => e.type === 'fail').rep.idx).toBe(iTrap)
  })
  it('ловушка, на которую промолчали: упущенная пилюля — fail без believed, следующая выезжает после выдержки PRE_SAY_GAP_MS (перевод — слово Пита)', () => {
    const { g } = make()
    const iTrap = g.reps.findIndex(r => r.trap)
    const t = reach(g, iTrap)
    const f = until(g, t, 'fail')
    expect(g.reps[iTrap].believed).toBeUndefined(); expect(f.ev.some(e => e.type === 'pre')).toBe(false)
    const pre = until(g, f.t + 16, 'pre', () => ({}), 1000)
    expect(pre.t - f.t).toBeGreaterThanOrEqual(PRE_SAY_GAP_MS - 16)
    expect(pre.ev.find(e => e.type === 'pre').rep.say).toBe(g.reps[iTrap + 1].say) // голосом — английское слово следующей пилюли
  })
  it('чужое слово на верной пилюле — обычный промах (wrong), не «поверил»', () => {
    const { g, targets } = make()
    const t = reach(g, 0)
    const ev = stepStudent(g, t + 16, { seq: [targets[1]], confirmed: true })
    expect(ev.find(e => e.type === 'miss').wrong).toBe(true); expect(g.reps[0].believed).toBeUndefined()
  })
})
