import { describe, it, expect } from 'vitest'
import { timelineEndSec, computeHighlightedCellIds, computeRevealedCellIds, sameIdSet } from './tableDictatorTiming.js'

const cellLayer = (id, hl, reveal, over = {}) => ({
  id, cellId: id, clips: [hl, reveal].filter(Boolean), ...over,
})

describe('timelineEndSec', () => {
  it('берёт самый поздний конец среди всех клипов', () => {
    expect(timelineEndSec([
      cellLayer('a', { start: 0, end: 2 }, { start: 0, end: 9 }),
      cellLayer('b', { start: 3, end: 4.5 }),
    ])).toBe(9)
  })

  it('пустой таймлайн — ноль, без падений', () => {
    expect(timelineEndSec([])).toBe(0)
    expect(timelineEndSec(null)).toBe(0)
    expect(timelineEndSec([{ id: 'x' }])).toBe(0)
  })
})

describe('состояние таблицы в момент t', () => {
  const layers = [
    cellLayer('a', { start: 1, end: 2 }, { start: 0, end: 10 }),
    cellLayer('b', { start: 2, end: 3 }, { start: 2, end: 10 }),
  ]

  it('подсвечена та ячейка, чей клип идёт сейчас', () => {
    expect([...computeHighlightedCellIds(layers, 1.5)]).toEqual(['a'])
    expect([...computeHighlightedCellIds(layers, 2.5)]).toEqual(['b'])
    expect(computeHighlightedCellIds(layers, 5).size).toBe(0)
  })

  it('скрытый слой и снятая подсветка не горят', () => {
    expect(computeHighlightedCellIds([cellLayer('a', { start: 0, end: 5 }, null, { visible: false })], 1).size).toBe(0)
    expect(computeHighlightedCellIds([cellLayer('a', { start: 0, end: 5 }, null, { highlightOn: false })], 1).size).toBe(0)
  })

  it('таймлайна нет — текст ячеек виден весь (иначе таблица выглядит пустой)', () => {
    // ровно случай из лога: у ноды нет таймлайна, панель открылась, а текста нет
    expect(computeRevealedCellIds([], 0)).toBe(null)
    expect(computeRevealedCellIds(null, 0)).toBe(null)
    // только слова и проверка, дорожек ячеек нет — гейтить тоже нечем
    expect(computeRevealedCellIds([
      { id: 'w1', word: 'a', clips: [{ start: 0, end: 1 }] },
      { id: 'chk', isCheck: true, clips: [{ start: 2, end: 3 }] },
    ], 0)).toBe(null)
  })

  it('дорожка ячейки без клипа проявления — её текст виден всегда', () => {
    const ids = computeRevealedCellIds([cellLayer('a', { start: 1, end: 2 })], 5)
    expect([...ids]).toEqual(['a'])
  })

  it('сравнение наборов не падает на «гейта нет»', () => {
    expect(sameIdSet(null, null)).toBe(true)
    expect(sameIdSet(null, new Set(['a']))).toBe(false)
    expect(sameIdSet(new Set(['a']), null)).toBe(false)
  })

  it('текст проявляется по своему клипу', () => {
    expect([...computeRevealedCellIds(layers, 0.5)]).toEqual(['a'])
    expect([...computeRevealedCellIds(layers, 3)].sort()).toEqual(['a', 'b'])
  })
})
