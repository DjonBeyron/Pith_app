import { describe, it, expect } from 'vitest'
import { checkTableWidth } from './lessonLintTable.js'
import { suggestWidths, wrappingCells, SE_TABLE_PX } from './tableWidths.js'

const cell = (row, col, value, extra = {}) => ({ id: `r${row}c${col}`, row, col, value, rowspan: 1, colspan: 1, fontSize: 13, ...extra })
const table = (widths, rows) => ({ columns: widths.map((w, i) => ({ id: `c${i}`, widthPct: w })), colCount: widths.length, rows: [], cells: rows.flatMap((r, ri) => r.map((v, ci) => cell(ri, ci, v))) })
const node = t => ({ ref: 't', type: 'table', data: { mode: 'dictator', table: t }, triggers: [] })

describe('ширина колонок таблицы', () => {
  it('равные колонки с длинной первой переносятся, предложенные — нет', () => {
    const t = table([18, 50, 32], [['Кто', 'Сейчас', 'Какой'], ['we, you, they', 'are', 'happy']])
    expect(wrappingCells(t).map(c => c.value)).toEqual(['we, you, they'])
    const sug = suggestWidths(t)
    expect(sug.reduce((s, v) => s + v, 0)).toBe(100)
    expect(wrappingCells({ ...t, columns: t.columns.map((c, i) => ({ ...c, widthPct: sug[i] })) })).toEqual([])
    expect(checkTableWidth([node(t)]).join()).toContain('[R-table-width] t')
  })
  it('подогнанная таблица — без замечаний', () => {
    const t0 = table([18, 50, 32], [['Кто', 'Сейчас', 'Какой'], ['we, you, they', 'are', 'happy']])
    const sug = suggestWidths(t0)
    expect(checkTableWidth([node({ ...t0, columns: t0.columns.map((c, i) => ({ ...c, widthPct: sug[i] })) })])).toEqual([])
  })
  it('сначала однострочность, потом баланс: остаток выравнивает колонки', () => {
    const sug = suggestWidths(table([50, 50], [['a', 'b']]))
    expect(Math.abs(sug[0] - sug[1])).toBeLessThanOrEqual(1)
    expect(SE_TABLE_PX).toBe(355)
  })
  it('не влезает вовсе: короткие колонки не режем, длинные делят остаток', () => {
    const t = table([34, 33, 33], [['x', 'очень длинная ячейка номер один', 'очень длинная ячейка номер два']])
    const sug = suggestWidths(t)
    expect(sug[0]).toBeLessThan(sug[1])
    expect(sug.reduce((s, v) => s + v, 0)).toBe(100)
  })
})
