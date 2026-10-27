import { describe, it, expect } from 'vitest'
import { parsePhrase, buildRecipe, buildParts, laneOf, orderLanes, normText, textOf, flattenRecipe, REPEATS, BLIND_FULL_REPS } from './wordLaneRecipe.js'

describe('фраза и куски', () => {
  it('куски через «|», пустые отбрасываются, не больше трёх (по числу дорожек)', () => {
    expect(parsePhrase("I'm | trying | to learn")).toEqual(["I'm", 'trying', 'to learn'])
    expect(parsePhrase(' a || b ')).toEqual(['a', 'b'])
    expect(parsePhrase('one')).toEqual(['one'])
    expect(parsePhrase('a | b | c | d')).toEqual(['a', 'b', 'c'])
    expect(parsePhrase('')).toEqual([])
    expect(parsePhrase(null)).toEqual([])
  })
  it('сравнение распознавания: сокращения раскрыты, регистр и знаки сняты', () => {
    expect(normText("I'm trying!")).toBe('i am trying')
    expect(textOf(['a', 'b', 'c'], [0, 2])).toBe('a c')
  })
})

describe('наращивание: ступени', () => {
  it('три куска: 1, 2, 1+2, 3, 1+2+3 — каждая три раза', () => {
    expect(buildParts(3)).toEqual([[0], [1], [0, 1], [2], [0, 1, 2]])
    expect(buildParts(2)).toEqual([[0], [1], [0, 1]])
    expect(buildParts(1)).toEqual([[0]])
    const r = buildRecipe(["I'm", 'trying', 'to learn'])
    const build = r.rounds[0]
    expect(build.kind).toBe('build')
    expect(build.steps.map(s => s.text)).toEqual(["I'm", 'trying', "I'm trying", 'to learn', "I'm trying to learn"])
    for (const s of build.steps) { expect(s.reps).toHaveLength(REPEATS); expect(s.kind).toBe('dictor-student') }
  })
  it('на ступени подсвечены только её куски (active), подписи видны всем', () => {
    const s = buildRecipe(['a', 'b', 'c']).rounds[0].steps[2]
    expect(s.active).toEqual([0, 1])
    expect(s.labels).toEqual([0, 1, 2])
  })
})

describe('раунды рецепта', () => {
  it('одно слово — только наращивание (диктор ×3, ученик ×3, три пилюли в трёх дорожках)', () => {
    const r = buildRecipe(['try'])
    expect(r.rounds.map(x => x.kind)).toEqual(['build'])
    expect(r.rounds[0].steps).toHaveLength(1)
    expect([0, 1, 2].map(i => laneOf(1, 0, i))).toEqual([0, 1, 2])
  })
  it('от двух кусков: build → order → blind', () => {
    for (const phrase of [['a', 'b'], ['a', 'b', 'c']]) expect(buildRecipe(phrase).rounds.map(x => x.kind)).toEqual(['build', 'order', 'blind'])
    expect(laneOf(3, 2, 1)).toBe(2)   // у фразы дорожка = номер куска
  })
  it('порядок: сначала куски по одному вперемешку (каждый ровно раз, не в порядке фразы), потом вся фраза', () => {
    const order = buildRecipe(['a', 'b', 'c']).rounds[1]
    expect(order.prompts.map(p => p.parts)).toEqual([[1], [2], [0], [0, 1, 2]])
    expect(buildRecipe(['a', 'b']).rounds[1].prompts.map(p => p.parts)).toEqual([[1], [0], [0, 1]])
  })
  it('дорожки в «Порядке» перемешаны, а не в порядке фразы, и это перестановка', () => {
    for (const n of [2, 3]) {
      const p = orderLanes(n)
      expect([...p].sort()).toEqual(Array.from({ length: n }, (_, i) => i))
      expect(p).not.toEqual(Array.from({ length: n }, (_, i) => i))
    }
  })
  it('вслепую: без подписей и перевода; сначала куски по одному (по пилюле на дорожку), потом вся фраза', () => {
    const blind = buildRecipe(['a', 'b', 'c']).rounds[2]
    expect(blind.steps[0].reps.map(r => r.parts)).toEqual([[0], [1], [2]])
    expect(blind.steps[1].reps).toHaveLength(BLIND_FULL_REPS)
    expect(blind.steps[1].reps[0].parts).toEqual([0, 1, 2])
    for (const s of blind.steps) { expect(s.labels).toEqual([]); expect(s.kind).toBe('student') }
  })
  it('пустая фраза — пустой рецепт; flatten собирает ступени и подсказки', () => {
    expect(buildRecipe([]).rounds).toEqual([])
    expect(flattenRecipe(buildRecipe(['a', 'b'])).length).toBe(3 + 3 + 2)
  })
})
