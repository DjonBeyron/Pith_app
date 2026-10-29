import { describe, it, expect } from 'vitest'
import { buildMirrorView, litSchedule } from './mirrorLane.js'
import { measureTake } from './mirrorMeasure.js'
import { CHUNKS, DICTOR, STUDENT_CLEAN, STUDENT_MISSING, STUDENT_PAUSE } from './mirrorFixtures.js'

const view = student => {
  const measure = measureTake({ dictor: DICTOR, student, chunks: CHUNKS })
  return buildMirrorView({ dictor: DICTOR, student, chunks: CHUNKS, measure })
}
const noOverlap = pills => pills.every((p, k) => k === 0 || p.left + 0.01 >= pills[k - 1].left + pills[k - 1].width)

describe('buildMirrorView: две полосы на общей шкале', () => {
  it('чистый дубль: пилюли обеих полос совпадают по месту и ширине (первая речь — в нуле), зазоров-пауз нет', () => {
    const v = view(STUDENT_CLEAN)
    expect(v.scaleMs).toBe(1600)
    expect(v.dictor.pills.map(p => p.text)).toEqual(CHUNKS)
    expect(v.dictor.pills[0].left).toBe(0)
    expect(v.student.pills.map(p => [p.left, p.width])).toEqual(v.dictor.pills.map(p => [p.left, p.width]))
    expect(v.student.pills.some(p => p.ghost)).toBe(false)
    expect(v.student.gaps).toEqual([])
  })
  it('пропущенный кусок — призрак шириной в длину куска у диктора, остальные не наезжают на него', () => {
    const v = view(STUDENT_MISSING)
    const ghost = v.student.pills.filter(p => p.ghost)
    expect(ghost.map(p => p.text)).toEqual(['trying'])
    expect(ghost[0].width).toBeGreaterThan(20) // 520 мс диктора на шкале ~2 с
    expect(v.student.pills.map(p => p.i)).toEqual([0, 1, 2])
    expect(noOverlap(v.student.pills)).toBe(true)
    expect(v.scaleMs).toBeGreaterThanOrEqual(v.student.durationMs - 1)
    expect(v.student.pills.every(p => p.left + p.width <= 100.01)).toBe(true)
  })
  it('долгая пауза: подсвечен зазор между «trying» и «to learn», шкала по длинной полосе', () => {
    const v = view(STUDENT_PAUSE)
    expect(v.scaleMs).toBe(2620)
    expect(v.student.gaps).toHaveLength(1)
    const [trying, toLearn] = [v.student.pills[1], v.student.pills[2]]
    expect(v.student.gaps[0].left).toBeCloseTo(trying.left + trying.width, 1)
    expect(v.student.gaps[0].left + v.student.gaps[0].width).toBeCloseTo(toLearn.left, 1)
    expect(v.dictor.pills.at(-1).left + v.dictor.pills.at(-1).width).toBeLessThan(65) // диктор короче — полоса не растянута на всю ширину
  })
  it('записи нет — только полоса диктора; нет слов диктора — одна общая полоса длины', () => {
    const v = buildMirrorView({ dictor: DICTOR, student: null, chunks: CHUNKS })
    expect(v.student).toBeNull()
    const whole = buildMirrorView({ dictor: { words: [], durationMs: 1800 }, student: null, chunks: CHUNKS })
    expect(whole.dictor).toMatchObject({ whole: true, pills: [], durationMs: 1800 })
    expect(whole.scaleMs).toBe(1800)
  })
})

describe('litSchedule: подсветка по ходу звука', () => {
  it('диктор: события в порядке времени, смещение на leadMs; призраки не горят', () => {
    const ev = litSchedule(view(STUDENT_CLEAN).dictor.pills, 25)
    expect(ev.slice(0, 3)).toEqual([{ at: 25, i: 0, on: true }, { at: 325, i: 0, on: false }, { at: 405, i: 1, on: true }])
    expect(ev).toHaveLength(6)
    expect(ev.every((e, k) => k === 0 || e.at >= ev[k - 1].at)).toBe(true)
    expect(litSchedule(view(STUDENT_MISSING).student.pills).map(e => e.i)).not.toContain(1)
  })
  it('запись человека: время от старта записи (реакция до первого слова сохраняется)', () => {
    const ev = litSchedule(view(STUDENT_CLEAN).student.pills)
    expect(ev[0]).toEqual({ at: 400, i: 0, on: true })
  })
})
