import { describe, it, expect } from 'vitest'
import { planDictor, REP_MIN_MS, FIRST_AT_PAD_MS } from './wordLaneDictor.js'
import { buildRecipe } from './wordLaneRecipe.js'
import { clipsFromTimings, utterances, clipsFromFills } from './wordLaneAudio.js'
import { pillYAt, TRAVEL_MS, OPEN_Y, ENTER_Y, END_TAIL_MS } from './wordLaneTimeline.js'

const chunks = ["I'm", 'trying', 'to learn']
const recipe = buildRecipe(chunks)
const steps = recipe.rounds[0].steps
const wordsOf = cs => utterances(cs.length).flatMap(p => p.flatMap(i => cs[i].split(/\s+/)))
const timings = cs => wordsOf(cs).map((w, i) => ({ w, t: +(0.3 + i * 0.5).toFixed(2), e: +(0.3 + i * 0.5 + 0.4).toFixed(2) }))
const clips = clipsFromTimings(timings(chunks), chunks, 10)
const wave = Array.from({ length: 400 }, (_, i) => (i % 20 < 8 ? 200 : 10))

describe('план диктора: ступень «I\'m» ×3', () => {
  const plan = planDictor({ step: steps[0], chunks, clips, audio: { wave, duration: 10 } })
  it('три повтора, по пилюле в дорожке куска (дорожка 0), шаг не короче REP_MIN_MS', () => {
    expect(plan.reps).toHaveLength(3)
    expect(plan.pills).toHaveLength(3)
    expect(plan.pills.every(p => p.lane === 0)).toBe(true)
    expect(plan.reps[1].at - plan.reps[0].at).toBeGreaterThanOrEqual(REP_MIN_MS)
    expect(plan.period).toBeGreaterThanOrEqual(REP_MIN_MS)
  })
  it('слово первого повтора начинается, когда первая пилюля полностью открыта: через TRAVEL_MS после выката (+ запас)', () => {
    const p = plan.pills[0]
    expect(p.at).toBeCloseTo(TRAVEL_MS + FIRST_AT_PAD_MS, 6)
    expect(pillYAt(p.at, p.at)).toBeCloseTo(OPEN_Y, 6)
    expect(pillYAt(p.at - TRAVEL_MS, p.at)).toBeCloseTo(ENTER_Y, 6)     // выкатилась из-за верхнего края за TRAVEL_MS до слова
  })
  it('звук включается раньше слова на запас перед ним; пилюля заливается по кривой громкости клипа', () => {
    const r = plan.reps[0]
    expect(r.span.start).toBeLessThan(clips[0][0].start)
    expect(plan.pills[0].at - r.at).toBeCloseTo((clips[0][0].start - r.span.start) * 1000, 6)
    expect(typeof plan.pills[0].curve).toBe('function')
  })
  it('конец ступени — конец последнего повтора + хвост; рот кота открывается только во время высказывания', () => {
    const last = plan.reps.at(-1)
    expect(plan.listenMs).toBeCloseTo(last.at + last.ms + END_TAIL_MS, 6)
    expect(plan.mouth(last.at - 100)).toBe(0)
    expect(plan.mouth(plan.listenMs)).toBe(0)
    let opened = 0
    for (let t = last.at; t < last.at + last.ms; t += 10) if (plan.mouth(t) > 0.3) opened++
    expect(opened).toBeGreaterThan(5)
  })
})

describe('ступень из нескольких кусков', () => {
  it('«I\'m trying» ×3: на повтор две пилюли в дорожках 0 и 1, слово второго куска позже первого; повторы с шагом не короче высказывания', () => {
    const plan = planDictor({ step: steps[2], chunks, clips, audio: { wave, duration: 10 } })
    expect(plan.pills).toHaveLength(6)
    const r0 = plan.reps[0].pieces
    expect(r0.map(p => p.lane)).toEqual([0, 1])
    expect(r0[1].at).toBeGreaterThan(r0[0].at)
    expect(plan.period).toBeGreaterThanOrEqual(plan.reps[0].ms)
    expect(plan.reps[2].pieces[0].at - plan.reps[1].pieces[0].at).toBeCloseTo(plan.period, 6)
  })
  it('вся фраза: три пилюли на повтор — по одной в каждой дорожке', () => {
    const plan = planDictor({ step: steps[4], chunks, clips })
    expect(plan.pills).toHaveLength(9)
    expect(plan.reps[0].pieces.map(p => p.lane)).toEqual([0, 1, 2])
    expect(plan.pills[0].curve).toBeNull()                                // без волны — заливка линейная
  })
  it('одна дорожка не занята двумя пилюлями сразу: пилюли дорожки идут с шагом ≥ высоты пилюли в пути', () => {
    const plan = planDictor({ step: steps[4], chunks, clips })
    for (const lane of [0, 1, 2]) {
      const at = plan.pills.filter(p => p.lane === lane).map(p => p.at)
      for (let i = 1; i < at.length; i++) expect(at[i] - at[i - 1]).toBeGreaterThanOrEqual(800)  // 20 % высоты при 26 %/с ≈ 770 мс
    }
  })
})

describe('без записи (голос системы) и скорость голоса', () => {
  it('длительности куска — по оценке; куски идут друг за другом', () => {
    const plan = planDictor({ step: steps[2], chunks })
    const [a, b] = plan.reps[0].pieces
    expect(b.at).toBeGreaterThan(a.at + a.ms - 1)
    expect(plan.reps[0].span).toBeNull()
  })
  it('скорость голоса 2× — высказывания короче вдвое, план плотнее', () => {
    const base = planDictor({ step: steps[2], chunks, clips })
    const fast = planDictor({ step: steps[2], chunks, clips, rate: 2 })
    expect(fast.reps[0].ms).toBeCloseTo(base.reps[0].ms / 2, 3)
  })
  it('старое одно слово с таймлайном fills: у каждого повтора своя запись, повторы — в трёх дорожках', () => {
    const one = buildRecipe(['try']).rounds[0].steps[0]
    const fills = clipsFromFills([{ start: 0.3, end: 0.8 }, { start: 1.6, end: 2.1 }, { start: 3.1, end: 3.6 }])
    const plan = planDictor({ step: one, chunks: ['try'], clips: fills })
    expect(plan.pills.map(p => p.lane)).toEqual([0, 1, 2])
    expect(plan.reps.map(r => Math.round(r.span.start * 1000))).toEqual([240, 1540, 3040])
  })
})
