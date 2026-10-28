import { describe, it, expect } from 'vitest'
import { planLadder, planFromIds, putLadderFirst } from './ladderPlan.js'

// Модуль ленты с сложностью админа d (голосов нет)
const mod = (id, d, extra = {}) => ({ id, difficultyAdmin: d, difficulty: null, difficultyVotes: 0, ...extra })
const many = (prefix, d, n) => Array.from({ length: n }, (_, i) => mod(`${prefix}${i}`, d))
const diffs = plan => plan.map(s => s.difficulty)

describe('planLadder — пять фраз по нарастанию', () => {
  const full = [...many('e', 1, 4), ...many('m', 2, 4), ...many('h', 3, 3)]

  it('есть все сложности: 1, 1, 2, 2, 3', () => {
    const plan = planLadder(full, { seed: 7 })
    expect(diffs(plan)).toEqual([1, 1, 2, 2, 3])
    expect(new Set(plan.map(s => s.id)).size).toBe(5)
  })
  it('сложных нет: 1, 1, 2, 2, 2', () => {
    expect(diffs(planLadder([...many('e', 1, 3), ...many('m', 2, 5)], { seed: 7 }))).toEqual([1, 1, 2, 2, 2])
  })
  it('средних нет — лесенка невозможна', () => {
    expect(planLadder([...many('e', 1, 5), ...many('h', 3, 5)], { seed: 7 })).toBeNull()
    expect(planLadder([], { seed: 7 })).toBeNull()
    expect(planLadder(null)).toBeNull()
  })
  it('не хватает фраз: берём сколько есть, но не меньше трёх', () => {
    expect(diffs(planLadder([mod('e0', 1), mod('m0', 2), mod('h0', 3)], { seed: 1 }))).toEqual([1, 2, 3])
    expect(planLadder([mod('m0', 2), mod('h0', 3)], { seed: 1 })).toBeNull()
  })
  it('детерминированно по сиду дня: тот же сид — тот же план, другой — другие фразы', () => {
    const a = planLadder(full, { seed: 11 }).map(s => s.id)
    expect(planLadder(full, { seed: 11 }).map(s => s.id)).toEqual(a)
    const others = [12, 13, 14, 15, 16, 17].map(seed => planLadder(full, { seed }).map(s => s.id).join())
    expect(others.some(ids => ids !== a.join())).toBe(true)
  })
  it('не зависит от порядка входного списка', () => {
    const a = planLadder(full, { seed: 5 }).map(s => s.id)
    expect(planLadder([...full].reverse(), { seed: 5 }).map(s => s.id)).toEqual(a)
  })
  it('пропускает превью, песочницу, исключённые и фразы с неизвестной сложностью', () => {
    const list = [
      mod('e0', 1, { previewOnly: true }), mod('e1', 1, { isSandbox: true }), mod('e2', 1), mod('e3', 1), mod('eX', null),
      mod('m0', 2), mod('m1', 2), mod('mEx', 2), mod('h0', 3),
    ]
    const plan = planLadder(list, { seed: 3, exclude: new Set(['mEx']) })
    expect(plan.map(s => s.id).sort()).toEqual(['e2', 'e3', 'h0', 'm0', 'm1'])
  })
  it('сложность — эффективная: голоса от порога важнее админа, мало голосов — админ', () => {
    const list = [
      { id: 'a', difficulty: 3, difficultyVotes: 9, difficultyAdmin: 1 }, // по голосам сложная
      { id: 'b', difficulty: 1, difficultyVotes: 2, difficultyAdmin: 2 }, // голосов мало → админ: средняя
      mod('c', 1), mod('d', 2),
    ]
    const plan = planLadder(list, { seed: 1 })
    expect(Object.fromEntries(plan.map(s => [s.id, s.difficulty]))).toEqual({ a: 3, b: 2, c: 1, d: 2 })
  })
})

describe('planFromIds / putLadderFirst', () => {
  const list = [mod('x', 2), mod('a', 1), mod('b', 2), mod('c', 3), mod('y', 1)]
  const plan = [{ id: 'a', difficulty: 1 }, { id: 'b', difficulty: 2 }, { id: 'c', difficulty: 3 }]

  it('planFromIds: те же id в прежнем порядке, ушедшие из ленты отбрасываются', () => {
    expect(planFromIds(['c', 'a', 'gone'], list)).toEqual([{ id: 'c', difficulty: 3 }, { id: 'a', difficulty: 1 }])
    expect(planFromIds(null, list)).toEqual([])
  })
  it('лесенка встаёт первой, остальные — как были, без дублей', () => {
    const out = putLadderFirst(list, plan)
    expect(out.map(m => m.id)).toEqual(['a', 'b', 'c', 'x', 'y'])
    expect(out).toHaveLength(list.length)
  })
  it('нет плана или ни одной фразы плана в ленте — тот же массив', () => {
    expect(putLadderFirst(list, [])).toBe(list)
    expect(putLadderFirst(list, null)).toBe(list)
    expect(putLadderFirst(list, [{ id: 'nope', difficulty: 1 }])).toBe(list)
  })
  it('часть плана ушла из ленты — ставим то, что осталось', () => {
    expect(putLadderFirst(list, [{ id: 'gone', difficulty: 1 }, { id: 'c', difficulty: 3 }]).map(m => m.id)).toEqual(['c', 'x', 'a', 'b', 'y'])
  })
})
