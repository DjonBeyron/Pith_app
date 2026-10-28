import { describe, it, expect } from 'vitest'
import { buildLadder } from '../memoryLadder.js'
import { pickRoundWords, canSayAloud, playableWords, roundResult, resultTitle, ROUND_MAX, MIN_TO_SHOW } from './sayAloudRound.js'

// Слова памяти: [слово, шаг, срок, перевод]. wordHome даёт переводу «дом» (как learnView)
const row = ([word, step, due, tr]) => ({ memory: { word, step, due_on: due }, home: [word, { translation: tr ?? '' }] })
function viewOf(rows, settled = []) {
  const rs = rows.map(row)
  const memory = [...rs.map(r => r.memory), ...settled.map(row).map(r => ({ ...r.memory, settled_on: '2026-10-01' }))]
  const wordHome = new Map([...rs.map(r => r.home), ...settled.map(row).map(r => r.home)])
  return { ladder: buildLadder(memory, { wordHome }) }
}
const eight = [
  ['cat', 1, '2026-10-30', 'кот'], ['dog', 1, '2026-10-28', 'собака'], ['sun', 2, '2026-10-29', 'солнце'], ['cup', 3, '2026-11-02', 'чашка'],
  ['tree', 3, '2026-10-27', 'дерево'], ['book', 4, '2026-11-05', 'книга'], ['milk', 5, '2026-11-20', 'молоко'], ['rain', 2, '2026-10-31', 'дождь'],
  ['road', 1, '2026-11-01', 'дорога'], ['bird', 1, '2026-11-03', 'птица'],
]

describe('pickRoundWords', () => {
  it('ближайший срок первым, не больше max (8)', () => {
    const w = pickRoundWords(viewOf(eight))
    expect(w).toHaveLength(ROUND_MAX)
    expect(w.map(x => x.word).slice(0, 4)).toEqual(['tree', 'dog', 'sun', 'cat'])
    expect(w[0]).toEqual({ word: 'tree', translation: 'дерево' })
  })

  it('withWord — слово из окна слова идёт первым, остальные по сроку', () => {
    const w = pickRoundWords(viewOf(eight), { withWord: 'milk' })
    expect(w[0].word).toBe('milk')
    expect(w[1].word).toBe('tree')
    expect(new Set(w.map(x => x.word)).size).toBe(w.length)
  })

  it('слово без перевода или не для Vosk (цифры, кириллица) в раунд не берём', () => {
    const v = viewOf([['cat', 1, '2026-10-30', 'кот'], ['dog', 1, '2026-10-28', ''], ['b2b', 1, '2026-10-28', 'сделка'], ['кот', 1, '2026-10-28', 'cat'], ['sun', 2, '2026-10-29', 'солнце'], ['cup', 3, '2026-11-02', 'чашка']])
    expect(playableWords(v).map(w => w.word).sort()).toEqual(['cat', 'cup', 'sun'])
  })

  it('меньше min подходящих слов — раунда нет', () => {
    const v = viewOf(eight.slice(0, 4))
    expect(pickRoundWords(v)).toEqual([])               // min по умолчанию 5
    expect(pickRoundWords(v, { min: 3 })).toHaveLength(4)
  })

  it('постоянная память тоже в игре; слово без срока — в конец', () => {
    const v = viewOf([['cat', 1, null, 'кот'], ['dog', 1, '2026-10-28', 'собака'], ['sun', 2, '2026-10-29', 'солнце']], [['moon', 5, '2026-12-01', 'луна']])
    const w = pickRoundWords(v, { min: 3 })
    expect(w.map(x => x.word)).toEqual(['dog', 'sun', 'moon', 'cat'])
  })

  it('нет лестницы (загрузка) — пусто', () => {
    expect(pickRoundWords(null)).toEqual([])
    expect(pickRoundWords({})).toEqual([])
  })
})

describe('canSayAloud', () => {
  it(`кнопка видна при ≥ ${MIN_TO_SHOW} подходящих словах`, () => {
    expect(canSayAloud(viewOf(eight.slice(0, 2)))).toBe(false)
    expect(canSayAloud(viewOf(eight.slice(0, 3)))).toBe(true)
  })
  it('из окна слова — только если слово само годится (есть перевод)', () => {
    const v = viewOf([...eight.slice(0, 3), ['nop', 1, '2026-10-28', '']])
    expect(canSayAloud(v, 'cat')).toBe(true)
    expect(canSayAloud(v, 'nop')).toBe(false)
    expect(canSayAloud(null)).toBe(false)
  })
})

describe('roundResult / resultTitle', () => {
  it('hits, misses, words и список', () => {
    const r = roundResult([{ word: 'cat', translation: 'кот', ok: true }, { word: 'dog', translation: 'собака', ok: false }, { word: 'sun', ok: true }])
    expect(r).toMatchObject({ hits: 2, misses: 1, words: 3 })
    expect(r.items.map(i => i.ok)).toEqual([true, false, true])
    expect(roundResult([])).toMatchObject({ hits: 0, misses: 0, words: 0 })
    expect(roundResult(undefined).words).toBe(0)
  })
  it('«Я услышал N слов» со склонением', () => {
    expect(resultTitle(1)).toBe('Я услышал 1 слово')
    expect(resultTitle(3)).toBe('Я услышал 3 слова')
    expect(resultTitle(5)).toBe('Я услышал 5 слов')
    expect(resultTitle(0)).toBe('Я услышал 0 слов')
  })
})
