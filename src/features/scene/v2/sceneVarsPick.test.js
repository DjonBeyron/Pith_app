import { describe, it, expect } from 'vitest'
import { pickWordForVar, pickWordsForScene, candidatesFor, seededRng } from './sceneVarsPick.js'

const mem = [
  { text: 'juice', translation: 'сок', level: 0 },
  { text: 'cheese', translation: 'сыр', level: 1 },
  { text: 'soup', translation: 'суп', level: 2, due: true },
  { text: 'tea', translation: 'чай', level: 3 },
  { text: 'bread', translation: 'хлеб', level: 4 },
]
const def = pick => ({ pick, fallback: { text: 'a sandwich' } })
const first = () => 0

describe('pickWordForVar — уровни и типы отбора', () => {
  it('weak = уровень 1; known = уровни 2–4; уровень 0 не подходит никому', () => {
    expect(candidatesFor(def('weak'), mem).map(w => w.text)).toEqual(['cheese'])
    expect(candidatesFor(def('known'), mem).map(w => w.text)).toEqual(['soup', 'tea', 'bread'])
    expect(candidatesFor(def('due'), [{ text: 'x', level: 0, due: true }])).toEqual([])
  })
  it('due — только слова с флагом «просрочено» (уровень ≥ 1)', () => {
    expect(candidatesFor(def('due'), mem).map(w => w.text)).toEqual(['soup'])
    expect(pickWordForVar(def('due'), mem, first)).toEqual({ source: 'memory', word: { text: 'soup', translation: 'суп', level: 2 } })
  })
  it('известное слово без перевода — без поля translation', () => {
    expect(pickWordForVar(def('weak'), [{ text: ' cheese ', level: 1 }], first).word).toEqual({ text: 'cheese', level: 1 })
  })
  it('нет слова нужного уровня → запасное; пустая/кривая память и неизвестный pick тоже', () => {
    const fb = { source: 'fallback', word: null }
    expect(pickWordForVar(def('weak'), [{ text: 'tea', level: 3 }], first)).toEqual(fb)
    expect(pickWordForVar(def('known'), [], first)).toEqual(fb)
    expect(pickWordForVar(def('weak'), null, first)).toEqual(fb)
    expect(pickWordForVar({ pick: 'zzz' }, mem, first)).toEqual(fb)
    expect(pickWordForVar(def('weak'), [{ text: '  ', level: 1 }, null, { level: 1 }], first)).toEqual(fb)
  })
})

describe('детерминированность и повторы', () => {
  it('одно зерно — один выбор; rng управляет индексом', () => {
    const pick = seed => pickWordForVar(def('known'), mem, seededRng(seed)).word.text
    expect(pick('a')).toBe(pick('a'))
    const seen = new Set(Array.from({ length: 40 }, (_, i) => pick(`s${i}`)))
    expect(seen.size).toBeGreaterThan(1)
    expect(pickWordForVar(def('known'), mem, () => 0.99).word.text).toBe('bread')
    expect(pickWordForVar(def('known'), mem, () => 0).word.text).toBe('soup')
  })
  it('seededRng даёт числа в [0, 1)', () => {
    const r = seededRng('x')
    for (let i = 0; i < 100; i++) { const v = r(); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1) }
  })
  it('два слова сцены не получают одно и то же слово, пока есть другие; единственное — повторяется', () => {
    const vars = { a: def('known'), b: def('known') }
    const r = pickWordsForScene(vars, mem, first)
    expect(r.a.word.text).toBe('soup')
    expect(r.b.word.text).toBe('tea')
    const one = pickWordsForScene(vars, [{ text: 'tea', level: 3 }], first)
    expect(one.a.word.text).toBe('tea')
    expect(one.b.word.text).toBe('tea')
  })
})
