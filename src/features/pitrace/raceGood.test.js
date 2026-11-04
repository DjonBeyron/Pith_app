import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { goodPlan, GOOD_IDS, GOOD_GAP_MIN, GOOD_GAP_MAX } from './raceGood.js'
import { RACE_LINES } from './raceLines.js'

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
