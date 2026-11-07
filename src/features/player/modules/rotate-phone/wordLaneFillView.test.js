import { describe, it, expect } from 'vitest'
import { createFillView, approachFill, FILL_MAX_STEP, FILL_UP_PER_S, FILL_DOWN_PER_S, FILL_ADVANCE } from './wordLaneFillView.js'
import { createStudentGame, stepStudent, PENDING_TOP, PENDING_MS } from './wordLaneStudent.js'
import { buildRecipe } from './wordLaneRecipe.js'
import { FILL_CAP } from './wordLaneTimeline.js'

// Заливка на экране догоняет цель каждый кадр с постоянной скоростью (без ступенек > 15 %), а цель «авансом» растёт с первым же черновиком распознавания (wordLaneStudent.stepFill, heardT)
const run = (goal, frames, dt) => { const v = createFillView(), out = [0]; for (let i = 0; i < frames; i++) out.push(v.step('p', goal, dt)); return out }
const one = (from, goal, dt) => { const v = createFillView(); for (let i = 0; i < 50; i++) v.step('p', from, 100); return v.step('p', goal, dt) }
const maxStep = vs => Math.max(...vs.slice(1).map((v, i) => Math.abs(v - vs[i])))

describe('createFillView: экран догоняет цель плавно', () => {
  it('скачок цели 0 → 0,85: движение с первого кадра, шаг за кадр ≤ 15 % и при 60 fps, и при кадре 50 мс (CPU 4×); подъём ровный, ≈ 0,85 / FILL_UP_PER_S', () => {
    for (const dt of [16, 33, 50, 120]) {
      const vs = run(FILL_CAP, 60, dt)
      expect(vs[1]).toBeGreaterThan(0.02)
      expect(maxStep(vs)).toBeLessThanOrEqual(Math.min(0.15, FILL_MAX_STEP) + 1e-9)
      expect(vs.every((v, i) => i === 0 || v >= vs[i - 1])).toBe(true)
      expect(vs.at(-1)).toBeCloseTo(FILL_CAP, 5)
    }
    const at60 = run(FILL_CAP, 40, 16).findIndex(v => v >= FILL_CAP - 1e-6)
    expect(at60 * 16).toBeLessThanOrEqual((FILL_CAP / FILL_UP_PER_S) * 1000 + 32)
    const st = run(FILL_CAP, 10, 16); expect(st[2] - st[1]).toBeCloseTo(st[1] - st[0], 6) // постоянная скорость
  })
  it('плавную цель экран проходит без задержки; вниз — мягче, не мгновенно; цель за пределами 0…1 — обрезается', () => {
    expect(approachFill(0.5, 0.52, 16)).toBe(0.52)
    expect(one(0.8, 0, 16)).toBeCloseTo(0.8 - (FILL_DOWN_PER_S * 16) / 1000, 6)
    expect(FILL_DOWN_PER_S).toBeLessThan(FILL_UP_PER_S)
    expect(one(0.99, 5, 50)).toBe(1); expect(approachFill(0.01, -1, 50)).toBe(0)
  })
  it('createFillView: своё значение у каждой пилюли, forget — с нуля', () => {
    const v = createFillView()
    v.step('a', 1, 16); v.step('a', 1, 16)
    expect(v.value('a')).toBeGreaterThan(0); expect(v.value('b')).toBe(0)
    v.forget('a'); expect(v.value('a')).toBe(0)
  })
})

describe('«аванс» заливки по первому черновику (stepStudent, heardT)', () => {
  const chunks = ['learn']
  const step = buildRecipe(chunks).rounds[0].steps[0]
  const play = heardFrom => {
    const g = createStudentGame({ step, chunks, estMs: () => 500 })
    const ps = []
    for (let t = 0; t <= 4000; t += 16) {
      stepStudent(g, t, { level: t > 1500 ? 0.03 : 0, seq: [], misses: 0, confirmed: heardFrom != null && t >= heardFrom, tail: null, heardT: heardFrom != null && t >= heardFrom ? heardFrom : -Infinity })
      ps.push({ t, p: g.reps[0].pills[0]?.p ?? 0 })
    }
    return ps
  }
  it('тихий голос без черновика — заливка едва заметна; первый черновик — цель сразу не ниже FILL_ADVANCE вклада слова', () => {
    const quiet = play(null).find(x => x.t === 2400).p
    const ahead = play(2000).find(x => x.t === 2016).p
    expect(quiet).toBeLessThan(FILL_ADVANCE)
    expect(ahead).toBeGreaterThanOrEqual(FILL_ADVANCE - 1e-9)
  })
  it('черновик до того, как пилюля стала слышна (прошлое слово), аванса не даёт', () => {
    const g = createStudentGame({ step, chunks, estMs: () => 500 })
    for (let t = 0; t <= 3000; t += 16) stepStudent(g, t, { level: 0.03, confirmed: true, heardT: -5 })
    expect(g.reps[0].pills[0].p).toBeLessThan(FILL_ADVANCE)
  })
  it('слово сказано, ждём принятия (русская выдержка): заливка не стоит на FILL_CAP, а ползёт к PENDING_TOP; 100 % — только принятие', () => {
    const g = createStudentGame({ step, chunks, estMs: () => 500 })
    const at = []
    for (let t = 0; t <= 3000; t += 16) {
      const tail = t >= 2000 ? { target: g.reps[0].target, tokens: 99 } : null
      stepStudent(g, t, { level: 0.3, confirmed: t >= 2000, tail, heardT: t >= 2000 ? 2000 : -Infinity })
      if (t >= 2000) at.push({ t, p: g.reps[0].pills[0].p })
    }
    const p = ms => at.find(x => x.t >= 2000 + ms).p
    expect(p(PENDING_MS / 2)).toBeGreaterThan(FILL_CAP); expect(p(PENDING_MS + 50)).toBeCloseTo(PENDING_TOP, 2); expect(at.at(-1).p).toBeLessThan(1)
  })
})
