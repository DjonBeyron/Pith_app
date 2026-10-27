import { describe, it, expect } from 'vitest'
import { analyzeTargets, targetGrammar } from './wordLaneMatch.js'

describe('несколько целей: что услышал Vosk', () => {
  const T = ["I'm", 'trying', 'to learn']
  it('цели по порядку, как прозвучали; повторы считаются', () => {
    expect(analyzeTargets('i am trying to learn', T)).toMatchObject({ seq: [0, 1, 2], misses: 0 })
    expect(analyzeTargets('trying trying i am', T)).toMatchObject({ seq: [1, 1, 0], misses: 0 })
    expect(analyzeTargets('', T)).toEqual({ seq: [], misses: 0, tail: null })
  })
  it('чужие слова и [unk] — промахи; идущее слово в конце не считается промахом', () => {
    expect(analyzeTargets('trying [unk] to learn', T)).toMatchObject({ seq: [1, 2], misses: 1 })
    expect(analyzeTargets('trying [unk]', T, false)).toMatchObject({ seq: [1], misses: 0 })
    expect(analyzeTargets('trying [unk]', T, true)).toMatchObject({ seq: [1], misses: 1 })
  })
  it('самая длинная цель берётся первой: фраза целиком не рассыпается на куски', () => {
    expect(analyzeTargets('i am trying to learn', ["i'm trying to learn", "i'm"])).toMatchObject({ seq: [0], misses: 0 })
  })
  it('недосказанная цель (tail): слова, которыми уже начата цель, — по ним пилюли заливаются по очереди', () => {
    const P = ["I'm trying to learn"]                                   // i am trying to learn — 5 слов
    expect(analyzeTargets('i am', P, false).tail).toEqual({ target: 0, tokens: 2 })
    expect(analyzeTargets('i am trying', P, false).tail).toEqual({ target: 0, tokens: 3 })
    expect(analyzeTargets('i am trying to learn', P, false).tail).toBeNull()      // договорено — это уже попадание
    expect(analyzeTargets('i am trying to learn i am', P, false)).toMatchObject({ seq: [0], tail: { target: 0, tokens: 2 } }) // второй повтор начат
    expect(analyzeTargets('hello', P, false).tail).toBeNull()
    expect(analyzeTargets('', P, false).tail).toBeNull()
  })
  it('одна цель из нескольких слов — одно попадание', () => {
    expect(analyzeTargets('to learn to learn', ['to learn']).seq).toEqual([0, 0])
  })
  it('словарь: все последовательности длиной 1–max из целей и [unk]; три цели × 3 = 84 + [unk]', () => {
    const g = JSON.parse(targetGrammar(T, 3))
    expect(g).toContain('trying')
    expect(g).toContain('i am trying to learn')
    expect(g).toContain('trying [unk] trying')
    expect(g.at(-1)).toBe('[unk]')
    expect(g.length).toBe(4 + 16 + 64 + 1)
    expect(JSON.parse(targetGrammar(['try'], 3)).length).toBe(2 + 4 + 8 + 1)
    expect(targetGrammar([], 3)).toBeNull()
    expect(JSON.parse(targetGrammar(['a', 'a'], 1))).toEqual(['a', '[unk]', '[unk]'])
  })
})
