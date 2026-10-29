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
  it('черновик: начало цели — не промах (пауза между словами «I\'m … trying»), хвост хранит, сколько слов уже произнесено', () => {
    const P = ["I'm trying"]
    expect(analyzeTargets('i am', P, false)).toEqual({ seq: [], misses: 0, tail: { target: 0, tokens: 2 } })   // раньше: misses 1 — «i» промах, «am» — последнее слово
    expect(analyzeTargets('i am trying', P, false)).toEqual({ seq: [0], misses: 0, tail: null })
    const L = ["I'm trying to learn"]
    expect(analyzeTargets('i am trying to', L, false)).toEqual({ seq: [], misses: 0, tail: { target: 0, tokens: 4 } }) // раньше: misses 3
    expect(analyzeTargets('i', P, false)).toEqual({ seq: [], misses: 0, tail: { target: 0, tokens: 1 } })
  })
  it('черновик: хвостовой [unk] игнорируется, чужое слово — промах, только когда за ним уже началась цель', () => {
    const P = ["I'm trying"]
    expect(analyzeTargets('i am [unk]', P, false)).toEqual({ seq: [], misses: 0, tail: { target: 0, tokens: 2 } })
    expect(analyzeTargets('[unk]', P, false)).toEqual({ seq: [], misses: 0, tail: null })
    expect(analyzeTargets('cat', P, false).misses).toBe(0)                                   // последнее слово ещё может измениться
    expect(analyzeTargets('cat i am', P, false)).toEqual({ seq: [], misses: 1, tail: { target: 0, tokens: 2 } })  // «cat» устоялось: за ним началась цель
    expect(analyzeTargets('cat i am trying', P, false)).toMatchObject({ seq: [0], misses: 1 })
    expect(analyzeTargets('i am trying cat dog', P, false)).toMatchObject({ seq: [0], misses: 1 })
    expect(analyzeTargets('i am [unk] trying', P, false).misses).toBe(1)                  // [unk] посреди речи — не хвост
  })
  it('итог (final): всё, что не вошло в цели целиком, — промах, включая недосказанное начало; хвост по-прежнему найден', () => {
    const P = ["I'm trying"]
    expect(analyzeTargets('i am', P, true)).toEqual({ seq: [], misses: 2, tail: { target: 0, tokens: 2 } })
    expect(analyzeTargets('cat i am', P, true).misses).toBe(3)
    expect(analyzeTargets('i am trying', P, true)).toEqual({ seq: [0], misses: 0, tail: null })
    expect(analyzeTargets('i am trying [unk]', P, true)).toMatchObject({ seq: [0], misses: 1 })
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
