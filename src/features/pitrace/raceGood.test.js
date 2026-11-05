import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { goodPlan, GOOD_IDS, GOOD_GAP_MIN, GOOD_GAP_MAX, GOOD_DELAY_MS } from './raceGood.js'
import { RACE_LINES } from './raceLines.js'
import { buildStages } from '../player/modules/rotate-phone/wordLaneStages.js'
import { createStudentGame, stepStudent } from '../player/modules/rotate-phone/wordLaneStudent.js'
import { stepTargets } from '../player/modules/rotate-phone/wordLaneRecipe.js'
import { LISTEN_Y_MIN } from '../player/modules/rotate-phone/wordLaneTimeline.js'
import { fixturePlan } from '../rehearsal/rehearsalFixtures.js'
import { normalizePlan } from '../rehearsal/rehearsalPlan.js'

const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')

describe('мини-реплики успеха «Разгона»: план от семени', () => {
  it('на первом верном слове уже реплика, дальше шаг 3–4 верных слова, номера по возрастанию, не дальше числа слов', () => {
    for (const seed of ['a', 'b', '2026-11-04|x']) {
      const plan = goodPlan(seed, 'sprint', 10)
      expect(plan[0].at).toBe(1)
      plan.forEach((g, i) => { expect(GOOD_IDS).toContain(g.id); expect(g.at).toBeLessThanOrEqual(10); if (i) { const gap = g.at - plan[i - 1].at; expect(gap).toBeGreaterThanOrEqual(GOOD_GAP_MIN); expect(gap).toBeLessThanOrEqual(GOOD_GAP_MAX) } })
      expect(plan.length).toBeGreaterThanOrEqual(3)
    }
  })
  it('две реплики подряд не повторяются; тот же семя — тот же план, другое — другая раскладка', () => {
    const a = goodPlan('s1', 'sprint', 40), b = goodPlan('s1', 'sprint', 40), c = goodPlan('s2', 'sprint', 40)
    expect(b).toEqual(a); expect(c).not.toEqual(a)
    a.forEach((g, i) => { if (i) expect(g.id).not.toBe(a[i - 1].id) })
  })
  it('второй круг (first: false): первая реплика не раньше 3-го верного слова', () => {
    const plan = goodPlan('s1', 'sprint2', 8, { first: false })
    expect(plan[0].at).toBeGreaterThanOrEqual(GOOD_GAP_MIN); expect(plan[0].at).toBeLessThanOrEqual(GOOD_GAP_MAX)
  })
  it('ключи из каталога реплик, без Math.random', () => {
    expect(GOOD_IDS.every(id => RACE_LINES.some(l => l.id === id))).toBe(true)
    expect(read('./raceGood.js')).not.toMatch(/Math\.random\(/)
  })
})

describe('похвала начинается с задержкой после зачёта (v3.3.113)', () => {
  it('GOOD_DELAY_MS около 500 мс; директор отправляет реплику успеха через sayLineLater, а не сразу', () => {
    expect(GOOD_DELAY_MS).toBeGreaterThanOrEqual(400); expect(GOOD_DELAY_MS).toBeLessThanOrEqual(600)
    const src = read('./useRaceActs.js')
    expect(src).toContain('GOOD_IDS.includes(r.say)')
    expect(src).toContain('praiseRef.current = r.say') // любая похвала, не только на claim: id уходит секвенсору речи (v3.3.117)
    expect(src).not.toContain("ev.t === 'claim' && GOOD_IDS") // единый путь
    expect(src).not.toContain('sayLineLater?.(r.say') // старый разрозненный таймер гонке не нужен
    expect(src).toContain('speech.riseStart()') // отсчёт задержки — от взлёта пилюли (win)
    expect(src).toContain('speech.claim(praiseRef.current)')
    expect(read('../player/modules/rotate-phone/useWordLaneFlow.js')).toContain('cat.sayLineLater(id, vars, ms') // для репетиции остаётся
  })
  it('на зачёте Пит занят С ЭТОГО МОМЕНТА: пока идёт задержка (hold от резерва), следующая пилюля не выезжает; реплика кончилась — выезжает', () => {
    const plan = normalizePlan({ ...fixturePlan('three'), game: 'race' })
    const s = buildStages({ chunks: plan.chunks, plan, rate: 1 }).stages.find(x => x.act === 'sprint' && x.type === 'student')
    const g = createStudentGame({ step: s.step, chunks: s.step.chunks, estMs: () => 400, maxTries: s.step.maxTries })
    const targets = stepTargets(s.step, s.step.chunks).repTarget
    let t = 0
    while (!stepStudent(g, (t += 16)).some(e => e.type === 'spawn')) { /* ждём первую пилюлю */ }
    while (!g.reps[0].pills.every(p => p.y >= LISTEN_Y_MIN)) stepStudent(g, (t += 16))
    const claimed = stepStudent(g, (t += 16), { seq: [targets[0]], confirmed: true, hold: true })
    expect(claimed.map(e => e.type)).toContain('claim')
    for (let i = 0; i < (GOOD_DELAY_MS + 1800) / 16; i++) expect(stepStudent(g, (t += 16), { hold: true }).some(e => e.type === 'spawn')).toBe(false) // задержка + голос Пита
    let spawned = false
    for (let i = 0; i < 30 && !spawned; i++) spawned = stepStudent(g, (t += 16), { hold: false }).some(e => e.type === 'spawn' || e.type === 'pre')
    expect(spawned).toBe(true)
  })
})
