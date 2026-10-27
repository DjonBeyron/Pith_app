import { describe, it, expect } from 'vitest'
import { codeOf, mouthTrack, codeAt } from './wordLaneVisemes.js'

describe('рот кота по буквам', () => {
  it('«о» круглит рот (E), «а» открывает (D), «у» — трубочка (F), «м/б/п» — сомкнуты (A), «ф/в» — G, «л» — H', () => {
    expect(['o', 'о', 'a', 'я', 'u', 'у', 'm', 'б', 'f', 'в', 'l'].map(codeOf)).toEqual(['E', 'E', 'D', 'D', 'F', 'F', 'A', 'A', 'G', 'G', 'H'])
    expect(codeOf("'")).toBeNull()
    expect(codeOf('k')).toBe('B')
  })
  it('дорожка рта: слово «to» — согласная и круглое «о», между словами и после конца рот закрыт', () => {
    const tr = mouthTrack('go on', 1000)
    expect(tr.length).toBeGreaterThan(2)
    expect(tr.map(s => s.code)).toContain('E')
    expect(codeAt(tr, 5)).toBe('B')                       // «g» — согласная
    expect(codeAt(tr, 1500)).toBe('X')
    for (let i = 1; i < tr.length; i++) expect(tr[i].at).toBeGreaterThanOrEqual(tr[i - 1].end - 1e-6)   // отрезки идут по порядку, не перекрываясь
  })
  it('с таймингами слов каждое слово встаёт на своё место', () => {
    const tr = mouthTrack('hello world', 2000, [{ w: 'hello', t: 1, e: 1.5 }, { w: 'world', t: 1.8, e: 2.5 }])
    expect(codeAt(tr, 100)).not.toBe('X')                 // «hello» с самого начала
    expect(codeAt(tr, 1000)).toBe('X')                    // пауза между словами
    expect(tr.at(-1).end).toBeLessThanOrEqual(2000)
  })
  it('пустой текст или нулевая длина — дорожки нет', () => {
    expect(mouthTrack('', 1000)).toEqual([])
    expect(mouthTrack('abc', 0)).toEqual([])
    expect(codeAt([], 10)).toBe('X')
  })
})
