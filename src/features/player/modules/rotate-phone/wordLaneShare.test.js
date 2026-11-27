import { describe, it, expect, vi } from 'vitest'
import { createStudentGame, stepStudent } from './wordLaneStudent.js'
import { buildStages } from './wordLaneStages.js'
import { stepTargets } from './wordLaneRecipe.js'
import { LISTEN_Y_MIN, SPEED, ENTER_Y } from './wordLaneTimeline.js'
import { simpleFrames, simpleMs, startRiseSimple, SIMPLE_MS, SIMPLE_FADE_FROM, RISE_END_Y, RISE_DELAY_MS } from './wordLaneRise.js'
import { snapPill } from './wordLaneSnap.js'
import { shareOfLogical } from '../../../pitrace/racePathShare.js'
import { fixturePlan } from '../../../rehearsal/rehearsalFixtures.js'
import { normalizePlan } from '../../../rehearsal/rehearsalPlan.js'

// Доля пути в событии claim движка и простой улёт (владелец 2026-11-27)
const plan = normalizePlan({ ...fixturePlan('three'), game: 'race' })
const sprint = buildStages({ chunks: plan.chunks, plan, rate: 1 }).stages.find(x => x.act === 'sprint' && x.type === 'student')

/** Играем первое слово: отвечаем, когда низ пилюли дошёл до доли share; → событие claim */
function claimAt(share, { reverse = false } = {}) {
  const step = reverse ? { ...sprint.step, reverse: true } : sprint.step
  const g = createStudentGame({ step, chunks: step.chunks, estMs: () => 400, maxTries: step.maxTries })
  const targets = stepTargets(step, step.chunks).repTarget
  let t = 0
  while (!stepStudent(g, (t += 8)).some(e => e.type === 'spawn')) { /* ждём пилюлю */ }
  while (!(g.reps[0].pills[0].y + 10 >= share * 100 && g.reps[0].pills.every(p => p.y >= LISTEN_Y_MIN))) stepStudent(g, (t += 8))
  return stepStudent(g, (t += 8), { seq: [targets[0]], confirmed: true }).find(e => e.type === 'claim')
}

describe('доля пути в событии claim движка', () => {
  it('проход A: доля ≈ низ пилюли / высота экрана; она же в rep.share', () => {
    for (const share of [0.3, 0.65, 0.8]) { const c = claimAt(share); expect(c.share).toBeGreaterThanOrEqual(share - 0.001); expect(c.share).toBeLessThan(share + 0.02); expect(c.rep.share).toBe(c.share); expect(c.share).toBeCloseTo(shareOfLogical(c.y, false), 6) }
  })
  it('обратный проход B (step.reverse): та же логическая высота даёт ту же долю', () => {
    const a = claimAt(0.5), b = claimAt(0.5, { reverse: true })
    expect(b.share).toBeCloseTo(a.share, 2); expect(b.share).toBeCloseTo(shareOfLogical(b.y, true), 6)
  })
  it('поздний ответ у границы «не успел» — доля 1; ранний — меньше 0,65', () => {
    expect(claimAt(0.95).share).toBeGreaterThan(0.94)
    expect(claimAt(0.2).share).toBeLessThan(0.65)
    expect(SPEED).toBeGreaterThan(0); expect(ENTER_Y).toBeLessThan(0)
  })
  it('поздний верный ответ не откладывает выезд следующей пилюли «под похвалу»: паузы claimGap нет, если похвала не прозвучит', () => {
    const step = { ...sprint.step, claimGap: 900, goodAt: [1] }
    const play = share => {
      const g = createStudentGame({ step, chunks: step.chunks, estMs: () => 400, maxTries: step.maxTries })
      const targets = stepTargets(step, step.chunks).repTarget
      let t = 0
      while (!stepStudent(g, (t += 8)).some(e => e.type === 'spawn')) { /* ждём пилюлю */ }
      while (!(g.reps[0].pills[0].y + 10 >= share * 100 && g.reps[0].pills.every(p => p.y >= LISTEN_Y_MIN))) stepStudent(g, (t += 8))
      stepStudent(g, (t += 8), { seq: [targets[0]], confirmed: true })
      return { gap: g.nextSpawn - t, goodDone: g.goodDone }
    }
    const early = play(0.4), late = play(0.8)
    expect(early.goodDone).toBe(1); expect(early.gap).toBeGreaterThan(800) // ранний: пауза под реплику успеха
    expect(late.goodDone).toBe(0); expect(late.gap).toBeLessThan(800)       // поздний: похвалы нет — паузы под неё нет
  })
})

describe('простой улёт ≥ 80 % пути', () => {
  it('одна анимация translate прямо вверх без rotate / scale и без задержки; opacity гаснет к концу', () => {
    const f = simpleFrames(70)
    expect(f.map(x => x.offset)).toEqual([0, SIMPLE_FADE_FROM, 1])
    expect(f.every(x => !('rotate' in x) && !('scale' in x))).toBe(true)
    expect(f[0].translate).toBe('calc(-50% + 0.00px) calc(70.000dvh - 50%)')
    expect(f[2].translate).toContain(`calc(${RISE_END_Y.toFixed(3)}dvh - 50%)`); expect(f[2].opacity).toBe(0)
    expect(f.every(x => !x.translate || x.translate.includes('+ 0.00px'))).toBe(true) // ни волны, ни сдвига по x
  })
  it('длительность 300–400 мс: дальше путь — немного дольше', () => {
    expect(SIMPLE_MS).toBe(300)
    expect(simpleMs(30)).toBeGreaterThanOrEqual(300); expect(simpleMs(95)).toBeLessThanOrEqual(420); expect(simpleMs(90)).toBeGreaterThan(simpleMs(30))
    const el = { animate: vi.fn(() => ({})) }
    startRiseSimple(el, 60)
    const [frames, opts] = el.animate.mock.calls[0]
    expect(frames.length).toBe(3); expect(opts).toMatchObject({ duration: simpleMs(60), fill: 'both' }); expect(opts.delay).toBeUndefined()
    expect(RISE_DELAY_MS).toBeGreaterThan(0)
  })
  it('snapPill с simple: ни хлопка, ни вспышек, ни искр, ни пузырей — ни одной анимации и ни одного нового узла', () => {
    const pill = { animate: vi.fn(), querySelector: vi.fn(), getBoundingClientRect: vi.fn(), hasAttribute: () => false }
    expect(snapPill(pill, 0, { full: true, simple: true })).toBe(0)
    expect(pill.animate).not.toHaveBeenCalled(); expect(pill.querySelector).not.toHaveBeenCalled(); expect(pill.getBoundingClientRect).not.toHaveBeenCalled()
  })
})
