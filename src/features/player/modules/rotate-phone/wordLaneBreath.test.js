import { describe, it, expect } from 'vitest'
import { createStudentGame, stepStudent } from './wordLaneStudent.js'
import { breathStep, FILL_CAP, PRE_CONFIRM_CAP } from './wordLaneTimeline.js'
import { buildRecipe } from './wordLaneRecipe.js'

// Заливка пилюль фазы ученика: пока слово куска не распознано, текущая пилюля показывает только голос («дыхание» — мягко, не выше FILL_CAP), распознанный кусок зеленеет (piece-ok),
// следующий кусок до своего первого слова пуст, две пилюли одного повтора голосом одновременно не наливаются. Один живой повтор за раз — wordLaneSerial.test.js.
const DT = 16
const chunks = ["I'm", 'trying', 'to learn']
const build = buildRecipe(chunks).rounds[0].steps
const game = step => createStudentGame({ step, chunks, estMs: () => 500 })

describe('заливка: голос текущего куска, распознанный — зелёный, следующий до первого слова пуст', () => {
  const three = build[4]                                              // «I'm trying to learn»: куски «i am» (2 слова) / «trying» / «to learn» (2 слова); cum = 0, 2, 3, 5
  const filling = g => g.reps[0].pills.filter(p => p.state === 'fly' && p.p > 0)

  it('breathStep: мягкая атака к цели FILL_CAP·уровень и ещё более мягкий спад; выше FILL_CAP не бывает', () => {
    let p = 0
    const up = []
    for (let i = 0; i < 40; i++) { p = breathStep(p, DT / 1000, 1); up.push(p) }
    expect(Math.max(...up)).toBeLessThanOrEqual(FILL_CAP + 1e-9)
    expect(up[0]).toBeLessThan(0.16)                                   // первый кадр — не скачок
    expect(up.every((v, i) => i === 0 || v >= up[i - 1])).toBe(true)
    expect(up.at(-1)).toBeGreaterThan(FILL_CAP * 0.9)
    const attack = up.findIndex(v => v >= FILL_CAP * 0.5)
    let q = FILL_CAP
    let release = 0
    while (q > FILL_CAP * 0.5 && release < 200) { q = breathStep(q, DT / 1000, 0); release += 1 }
    expect(release).toBeGreaterThan(attack * 2)                        // спад заметно медленнее атаки
    expect(breathStep(0.4, 0.016, 0.05)).toBeGreaterThanOrEqual(0)
  })

  it('пока слово не распознано: только голос; заливка текущего куска дышит с голосом и не выше FILL_CAP, скачков нет', () => {
    const g = game(three)
    let prev = 0
    let maxJump = 0
    let peak = 0
    for (let t = 0; t <= 3000; t += DT) {
      const level = t > 800 && t < 1900 ? 0.6 : 0                       // слово прозвучало между 0,8 и 1,9 с, распознавания нет
      stepStudent(g, t, { level, seq: [], misses: 0, confirmed: true, tail: null })
      const p = g.reps[0].pills[0].p
      if (t > 0) maxJump = Math.max(maxJump, Math.abs(p - prev))
      prev = p; peak = Math.max(peak, p)
      expect(g.reps[0].pills[1].p).toBe(0)
      expect(g.reps[0].pills[2].p).toBe(0)
    }
    expect(peak).toBeGreaterThan(0.5)
    expect(peak).toBeLessThanOrEqual(FILL_CAP + 1e-9)
    expect(maxJump).toBeLessThan(0.16)
    expect(g.reps[0].pills[0].p).toBeLessThan(peak)                    // голос кончился, а слово не распознано — заливка спадает, зелёного нет
    expect(g.reps[0].pills[0].state).toBe('fly')
  })

  it('следующий кусок до своего первого слова пуст: «i am» распознано → первый зелёный, второй 0 при любом голосе; слово второго услышано → зелёный, третий 0 до «to»', () => {
    const g = game(three)
    const frames = (ms, tokens, level = 0.7) => {
      for (const end = g.t + ms; g.t < end;) stepStudent(g, g.t + DT, { level, seq: [], misses: 0, confirmed: true, tail: tokens ? { target: g.reps[0].target, tokens } : null })
    }
    frames(1200, 0)
    expect(g.reps[0].pills[0].p).toBeGreaterThan(0.3)
    frames(400, 2)                                                       // «i am» распознано
    expect(g.reps[0].pills[0].state === 'lock' || g.reps[0].pills[0].state === 'won').toBe(true)
    expect(g.reps[0].pills[1].p).toBe(0)
    frames(600, 2)                                                       // голос идёт, но «trying» не услышано
    expect(g.reps[0].pills[1].p).toBe(0)
    frames(400, 3)                                                       // «trying» распознано
    expect(g.reps[0].pills[1].state === 'lock' || g.reps[0].pills[1].state === 'won').toBe(true)
    frames(600, 3)
    expect(g.reps[0].pills[2].p).toBe(0)                                 // «to learn» ещё не начато
    frames(400, 4)                                                       // «to» услышано — третий кусок наливается (голосом)
    expect(g.reps[0].pills[2].p).toBeGreaterThan(0)
    expect(g.reps[0].pills[2].p).toBeLessThanOrEqual(FILL_CAP + 1e-9)
  })

  it('две пилюли одного повтора никогда не наливаются голосом одновременно', () => {
    const g = game(three)
    let both = 0
    for (let t = 0; t <= 4200; t += DT) {
      const tokens = t < 700 ? 0 : t < 1500 ? 2 : t < 2300 ? 3 : 4
      stepStudent(g, t, { level: 0.6, seq: [], misses: 0, confirmed: true, tail: tokens ? { target: g.reps[0].target, tokens } : null })
      if (g.reps[0].pills.length && filling(g).length > 1) both += 1
    }
    expect(both).toBe(0)
  })

  it('все пилюли повтора берут p из одного шага: после stepStudent значения согласованы с состояниями (зелёные 1, пустые 0)', () => {
    const g = game(three)
    for (let t = 0; t <= 6000; t += DT) {
      stepStudent(g, t, { level: 0.6, seq: [], misses: 0, confirmed: true, tail: { target: 0, tokens: t > 1500 ? 3 : 0 } })
      for (const p of g.reps[0].pills) {
        if (p.state === 'won') expect(p.p).toBe(1)
        expect(p.p).toBeGreaterThanOrEqual(0)
        expect(p.p).toBeLessThanOrEqual(1)
      }
    }
  })
})

describe('до подтверждения речи', () => {
  it('голос дышит не выше PRE_CONFIRM_CAP, после первого partial — растёт до FILL_CAP без скачка', () => {
    const g = game(build[4])
    let prev = 0
    let maxJump = 0
    let peakBefore = 0
    for (let t = 0; t <= 2400; t += DT) {
      const confirmed = t > 1200                                          // partial пришёл с лагом 1,2 с после начала голоса
      stepStudent(g, t, { level: 0.6, seq: [], misses: 0, confirmed, tail: null })
      const p = g.reps[0].pills[0].p
      if (t > 0) maxJump = Math.max(maxJump, Math.abs(p - prev))
      if (!confirmed) peakBefore = Math.max(peakBefore, p)
      prev = p
    }
    expect(peakBefore).toBeGreaterThan(0.2)
    expect(peakBefore).toBeLessThanOrEqual(PRE_CONFIRM_CAP + 1e-9)
    expect(g.reps[0].pills[0].p).toBeGreaterThan(PRE_CONFIRM_CAP + 0.2)
    expect(g.reps[0].pills[0].p).toBeLessThanOrEqual(FILL_CAP + 1e-9)
    expect(maxJump).toBeLessThan(0.16)
  })
})
