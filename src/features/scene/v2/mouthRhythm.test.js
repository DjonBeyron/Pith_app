import { describe, it, expect } from 'vitest'
import { visemeAt, wordIndexAt, shapeInWord, syllableCount, validTimings, syntheticTimings, timingsEnd } from './mouthRhythm.js'

// Реплика «Дымка, у нас дедлайн» с паузами между словами (секунды медиа-времени)
const timings = [
  { word: 'Дымка,', start: 0.10, end: 0.50 },
  { word: 'у', start: 0.58, end: 0.64 },
  { word: 'нас', start: 0.70, end: 0.95 },
  { word: 'дедлайн', start: 1.10, end: 1.70 },
]

describe('mouthRhythm — визема по таймингам слов', () => {
  it('до первого слова, в паузах и после последнего — рот закрыт', () => {
    expect(visemeAt(timings, 0)).toBe('closed')
    expect(visemeAt(timings, 0.54)).toBe('closed')
    expect(visemeAt(timings, 1.0)).toBe('closed')
    expect(visemeAt(timings, 1.71)).toBe('closed')
    expect(visemeAt(timings, 9)).toBe('closed')
    expect(visemeAt([], 1)).toBe('closed')
    expect(visemeAt(timings, NaN)).toBe('closed')
  })

  it('внутри слова рот открыт; слоги чередуют open/half (Дымка: 2 слога, дедлайн: 2)', () => {
    expect(visemeAt(timings, 0.15)).toBe('open')   // 1-й слог
    expect(visemeAt(timings, 0.45)).toBe('half')   // 2-й слог
    expect(visemeAt(timings, 0.60)).toBe('open')   // «у» — один слог, всегда open
    expect(visemeAt(timings, 0.80)).toBe('open')   // «нас» — один слог
    expect(visemeAt(timings, 1.20)).toBe('open')
    expect(visemeAt(timings, 1.60)).toBe('half')
    expect(shapeInWord({ word: 'переговоры', start: 0, end: 1 }, 0.99)).toBe('open') // 5 слогов: 0,2,4 → open
  })

  it('wordIndexAt с подсказкой идёт вперёд, при t раньше подсказки ищет с нуля', () => {
    expect(wordIndexAt(timings, 0.8, 2)).toBe(2)
    expect(wordIndexAt(timings, 1.2, 2)).toBe(3)
    expect(wordIndexAt(timings, 0.2, 3)).toBe(0) // seek назад
    expect(wordIndexAt(timings, 0.05, 0)).toBe(-1)
  })

  it('слоги по гласным, минимум один', () => {
    expect(syllableCount('кот')).toBe(1)
    expect(syllableCount('Дымка')).toBe(2)
    expect(syllableCount('hello')).toBe(2)
    expect(syllableCount('')).toBe(1)
    expect(syllableCount('—')).toBe(1)
  })

  it('validTimings: только возрастающие числовые интервалы', () => {
    expect(validTimings(timings)).toBe(true)
    expect(validTimings([])).toBe(false)
    expect(validTimings(null)).toBe(false)
    expect(validTimings([{ start: 0, end: 0 }])).toBe(false)
    expect(validTimings([{ start: 1, end: 2 }, { start: 0.5, end: 3 }])).toBe(false)
    expect(validTimings([{ start: '0', end: 1 }])).toBe(false)
    expect(timingsEnd(timings)).toBe(1.7)
    expect(timingsEnd([])).toBeNull()
  })

  it('syntheticTimings раскладывает слова по длительности с паузами, длинным — больше', () => {
    const t = syntheticTimings('Да, это очень длинное-предложение', 3)
    expect(t).toHaveLength(4)
    expect(t[0].start).toBe(0)
    expect(t[3].end).toBeLessThan(3)
    expect(t[3].end - t[3].start).toBeGreaterThan(t[0].end - t[0].start)
    for (let i = 1; i < t.length; i++) expect(t[i].start).toBeGreaterThan(t[i - 1].end) // пауза между словами
    expect(validTimings(t)).toBe(true)
    expect(syntheticTimings('', 2)).toEqual([])
    expect(syntheticTimings('а б', 0)).toEqual([])
    expect(visemeAt(t, 0.05)).not.toBe('closed')
  })
})
