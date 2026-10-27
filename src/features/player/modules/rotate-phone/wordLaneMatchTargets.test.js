import { describe, it, expect } from 'vitest'
import { analyzeTargets, targetGrammar } from './wordLaneMatch.js'

describe('несколько целей: что услышал Vosk', () => {
  const T = ["I'm", 'trying', 'to learn']
  it('цели по порядку, как прозвучали; повторы считаются', () => {
    expect(analyzeTargets('i am trying to learn', T)).toEqual({ seq: [0, 1, 2], misses: 0 })
    expect(analyzeTargets('trying trying i am', T)).toEqual({ seq: [1, 1, 0], misses: 0 })
    expect(analyzeTargets('', T)).toEqual({ seq: [], misses: 0 })
  })
  it('чужие слова и [unk] — промахи; идущее слово в конце не считается промахом', () => {
    expect(analyzeTargets('trying [unk] to learn', T)).toEqual({ seq: [1, 2], misses: 1 })
    expect(analyzeTargets('trying [unk]', T, false)).toEqual({ seq: [1], misses: 0 })
    expect(analyzeTargets('trying [unk]', T, true)).toEqual({ seq: [1], misses: 1 })
  })
  it('самая длинная цель берётся первой: фраза целиком не рассыпается на куски', () => {
    expect(analyzeTargets('i am trying to learn', ["i'm trying to learn", "i'm"])).toEqual({ seq: [0], misses: 0 })
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
