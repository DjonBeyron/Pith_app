import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createStudentGame, stepStudent, REP_GAP_MS, MAX_HOLD_MS } from './wordLaneStudent.js'
import { buildRecipe } from './wordLaneRecipe.js'

// Репетиция (v3.3.87): пока Пит договаривает реплику (hold), новая пилюля не выезжает, а как только он договорил — выезжает; время ступени на ожидание не тратится
const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const DT = 16
const chunks = ['try']
const step = buildRecipe(chunks).rounds[0].steps[0]
const spawnTimes = (g, holdAt, until) => {
  const out = []
  for (let t = 0; t <= until; t += DT) for (const e of stepStudent(g, t, { hold: holdAt(t) })) if (e.type === 'spawn') out.push(t)
  return out
}

describe('hold: Пит говорит — пилюля ждёт', () => {
  it('в начале ступени: пока hold, первая пилюля не выезжает; сразу после — выезжает', () => {
    const g = createStudentGame({ step, chunks })
    const spawns = spawnTimes(g, t => t < 3000, 4000)
    expect(spawns[0]).toBeGreaterThanOrEqual(3000)
    expect(spawns[0]).toBeLessThan(3000 + 2 * DT)
  })
  it('без hold ничего не меняется: первая пилюля — в нулевой момент (обычная нода)', () => {
    const g = createStudentGame({ step, chunks })
    expect(spawnTimes(g, () => false, 100)[0]).toBe(0)
  })
  it('после «не успел»: повтор ждёт и конца реплики, и паузы REP_GAP_MS; выезд — сразу после того, как оба вышли', () => {
    const g = createStudentGame({ step, chunks })
    let failAt = null
    const spawns = []
    let hold = false
    for (let t = 0; t <= 20000; t += DT) {
      for (const e of stepStudent(g, t, { hold })) {
        if (e.type === 'spawn') spawns.push(t)
        if (e.type === 'fail' && failAt == null) { failAt = t; hold = true }   // Пит заговорил на «не успел»
      }
      if (failAt != null && t >= failAt + 5000) hold = false                 // и договорил через 5 с
      if (spawns.length >= 2) break
    }
    expect(failAt).not.toBeNull()
    expect(spawns[1]).toBeGreaterThanOrEqual(failAt + 5000)
    expect(spawns[1]).toBeLessThan(failAt + 5000 + 2 * DT)
    expect(5000).toBeGreaterThan(REP_GAP_MS)
  })
  it('время ступени (budget) на ожидание не тратится: бюджет сдвигается на время, пока Пит говорит', () => {
    const g = createStudentGame({ step, chunks })
    const b0 = g.budget
    for (let t = 0; t <= MAX_HOLD_MS - 100; t += DT) stepStudent(g, t, { hold: true })
    expect(g.budget).toBeGreaterThan(b0 + MAX_HOLD_MS - 300)
    expect(g.spawned).toBe(0)
    expect(g.reps[0].state).toBe('todo')   // повтор не потерян, хотя без сдвига бюджета он бы пропал
  })
  it('страховка: hold не длится дольше MAX_HOLD_MS — зависшая реплика пилюлю не задержит, она выезжает всё равно', () => {
    const g = createStudentGame({ step, chunks })
    const spawns = spawnTimes(g, () => true, MAX_HOLD_MS + 500)
    expect(MAX_HOLD_MS).toBeGreaterThanOrEqual(5000)
    expect(spawns).toHaveLength(1)
    expect(spawns[0]).toBeGreaterThan(MAX_HOLD_MS)
    expect(spawns[0]).toBeLessThan(MAX_HOLD_MS + 2 * DT)
  })
  it('hold на живой повтор не влияет: пилюля едет, слово принимается', () => {
    const g = createStudentGame({ step, chunks })
    stepStudent(g, 0, {})
    const types = []
    for (let t = DT; t <= 3000; t += DT) for (const e of stepStudent(g, t, { hold: true, seq: t > 900 ? [0] : [] })) types.push(e.type)
    expect(types).toContain('claim')
  })
})

describe('подключение', () => {
  it('движок пилюль берёт hold у Пита (fx.pitLeft), директор отдаёт его из busyLeft кота только в репетиции', () => {
    expect(read('./useWordLanePills.js')).toContain('const pitMs = fxRef.current?.pitLeft?.() ?? 0, hold = pitMs > 0')
    expect(read('./useWordLanePills.js')).toContain('tail: sig.tail ?? null, hold, pitMs, heardT })')
    expect(read('./useWordLaneFlow.js')).toContain('pitLeft: () => rh.pitLeft()')
    expect(read('./useWordLaneFlow.js')).toContain('pitLeft: () => handlersRef.current.pitLeft()')
    expect(read('../../../rehearsal/useRehearsalActs.js')).toContain('pitLeft: () => (on ? cat.busyLeft() : 0)')
  })
})
