import { describe, it, expect } from 'vitest'
import { createStudentGame, stepStudent } from './wordLaneStudent.js'

// «Мия ускоряет дорожку» (pitrace/mia): step.boost.k умножает скорость ещё не выехавших повторов; пока k = 1 всё как раньше
const mkStep = k => ({
  id: 'x', kind: 'student', labels: [], active: [0, 1, 2], parts: [0, 1, 2], text: 'a b c', chunks: ['a', 'b', 'c'],
  reps: [0, 1, 2].map(i => ({ parts: [i], lane: i, speed: 1 + i * 0.1 })), overlap: true, boost: { k },
})
const build = step => createStudentGame({ step, chunks: step.chunks, estMs: () => 400 })

describe('step.boost: ускорение дорожки', () => {
  it('k = 1: скорости повторов не меняются', () => {
    const g = build(mkStep(1)); stepStudent(g, 16)
    expect(g.reps.map(r => r.speed)).toEqual([1, 1.1, 1.2])
  })
  it('k = 1,15: невыехавшие повторы быстрее на 15 %, база запоминается; уже выехавший (летит) скорость не меняет', () => {
    const step = mkStep(1), g = build(step); stepStudent(g, 16)
    step.boost.k = 1.15; stepStudent(g, 32)
    expect(g.reps[0].state).toBe('fly'); expect(g.reps.map(r => r.speed)).toEqual([1, 1.265, 1.38])
    expect(g.reps[2].baseSpeed).toBe(1.2)
  })
  it('вернули k = 1: ещё не выехавшие повторы снова на базовой скорости (выехавший остаётся как выехал)', () => {
    const step = mkStep(1.15), g = build(step); stepStudent(g, 16)
    step.boost.k = 1; stepStudent(g, 32)
    expect(g.reps.map(r => r.speed)).toEqual([1.15, 1.1, 1.2])
  })
  it('без step.boost (обычные ступени) ничего не трогает', () => {
    const step = mkStep(1); delete step.boost
    const g = build(step); stepStudent(g, 16)
    expect(g.boost).toBeNull(); expect(g.reps.map(r => r.speed)).toEqual([1, 1.1, 1.2])
  })
})
