import { describe, it, expect } from 'vitest'
import { codeOf, mouthTrack, codeAt, chatterTrack } from './wordLaneVisemes.js'
import { MOUTH_MIN_HOLD_MS } from './wordLaneMouthHold.js'

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

  it('«learn» на дорожке кота — округлый E между языком и зубами (H → E → B), а не C → D → B', () => {
    const tr = mouthTrack('learn', 800)
    expect(tr.map(s => s.code)).toEqual(['H', 'E', 'B'])
    expect(codeAt(tr, 10)).toBe('H')
  })
  it('без таймингов текст растягивается на ВСЮ длительность: дорожка не пустая, слова идут по порядку и кончаются у конца реплики', () => {
    const ms = 2000
    const tr = mouthTrack('Теперь твоя очередь', ms)
    expect(tr.length).toBeGreaterThan(6)
    expect(tr[0].at).toBeLessThan(ms * 0.1)
    expect(tr.at(-1).end).toBeGreaterThan(ms * 0.8)
    expect(tr.at(-1).end).toBeLessThanOrEqual(ms)
    expect(codeAt(tr, ms * 0.5)).not.toBe('X')
  })
  it('тайминги с лишними «словами»-знаками не ломают привязку: «—» отдельным токеном игнорируется', () => {
    const words = [{ w: 'Go', t: 0, e: 0.4 }, { w: '—', t: 0.4, e: 0.5 }, { w: 'now', t: 0.6, e: 1 }]
    const tr = mouthTrack('Go now', 1000, words)
    expect(codeAt(tr, 100)).not.toBe('X')                  // «Go» в своём месте
    expect(codeAt(tr, 520)).toBe('X')                      // пауза между словами
    expect(codeAt(tr, 800)).not.toBe('X')                  // «now»
  })
  it('длина озвучки total: тишина в начале файла остаётся тишиной (рот не опережает голос)', () => {
    const words = [{ w: 'hello', t: 0.5, e: 1.0 }, { w: 'world', t: 1.1, e: 1.6 }]
    const lead = mouthTrack('hello world', 2000, words, 2)
    expect(codeAt(lead, 100)).toBe('X')                    // 0,1 с — в файле ещё тишина
    expect(lead[0].at).toBeGreaterThanOrEqual(500 - 1)     // первое слово — на 0,5 с
    expect(lead.at(-1).end).toBeLessThanOrEqual(1600 + 1)
    const stretched = mouthTrack('hello world', 2000, words)
    expect(stretched[0].at).toBeLessThan(5)                // без total слова растягиваются от начала дорожки (как раньше)
  })
  it('быстрые формы не короче выдержки рта: дорожка не требует смен чаще, чем рот успевает рисовать', () => {
    const tr = mouthTrack('I am trying to learn English', 2200)
    for (const s of tr) expect(s.end - s.at).toBeGreaterThanOrEqual(MOUTH_MIN_HOLD_MS - 1e-6)
  })
  it('chatterTrack: запасной цикл форм на всю длительность без пауз, по порядку', () => {
    const tr = chatterTrack(1000)
    expect(tr.length).toBeGreaterThan(6)
    expect(tr[0].at).toBe(0)
    expect(tr.at(-1).end).toBeLessThanOrEqual(1000)
    expect(new Set(tr.map(s => s.code)).size).toBeGreaterThan(2)
    for (let i = 1; i < tr.length; i++) expect(tr[i].at).toBeCloseTo(tr[i - 1].end)
    expect(chatterTrack(0)).toEqual([])
  })
})
