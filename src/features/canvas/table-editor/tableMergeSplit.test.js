import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  createInitialTable, mergeSelection, splitSelection, mergedCellsInSelection, bumpCellsFontSize,
  removeRows, removeCols, setCellValue,
} from './tableGridUtils.js'
import { gridHistoryReducer, initGridHistory, HISTORY_LIMIT } from './tableGridHistory.js'
import { pruneTimelineForCells } from './timelinePrune.js'

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const at = (t, r, c) => t.cells.find(x => x.row === r && x.col === c)

describe('объединение и обратное разбиение', () => {
  it('объединили 2×2 — стала одна ячейка на четыре клетки', () => {
    const t = mergeSelection(createInitialTable(2, 2), 0, 0, 1, 1)
    expect(t.cells).toHaveLength(1)
    expect([t.cells[0].rowspan, t.cells[0].colspan]).toEqual([2, 2])
  })

  it('разбили обратно — снова четыре отдельные ячейки', () => {
    const merged = mergeSelection(createInitialTable(2, 2), 0, 0, 1, 1)
    const back = splitSelection(merged, 0, 0, 1, 1)
    expect(back.cells).toHaveLength(4)
    expect(back.cells.every(c => c.rowspan === 1 && c.colspan === 1)).toBe(true)
  })

  it('разбиение берёт все объединённые ячейки выделения разом', () => {
    let t = createInitialTable(2, 4)
    t = mergeSelection(t, 0, 0, 0, 1)   // шапка слева
    t = mergeSelection(t, 0, 2, 0, 3)   // шапка справа
    expect(mergedCellsInSelection(t.cells, 0, 0, 0, 3)).toHaveLength(2)
    const back = splitSelection(t, 0, 0, 0, 3)
    expect(back.cells.every(c => c.rowspan === 1 && c.colspan === 1)).toBe(true)
  })

  it('в выделении нечего разбивать — таблица не меняется', () => {
    const t = createInitialTable(2, 2)
    expect(splitSelection(t, 0, 0, 0, 0)).toBe(t)
    expect(mergedCellsInSelection(t.cells, 0, 0, 1, 1)).toEqual([])
  })

  it('текст объединённой остаётся в её левой верхней клетке', () => {
    let t = createInitialTable(1, 2)
    t = { ...t, cells: t.cells.map(c => (c.col === 0 ? { ...c, value: 'шапка' } : c)) }
    const back = splitSelection(mergeSelection(t, 0, 0, 0, 1), 0, 0, 0, 1)
    expect(at(back, 0, 0).value).toBe('шапка')
    expect(at(back, 0, 1).value).toBe('')
  })
})

describe('размер текста сразу у нескольких ячеек', () => {
  const bounds = { min: 9, max: 15, def: 13 }

  it('A+ поднимает размер у всех выделенных', () => {
    const t = createInitialTable(1, 2)
    const ids = t.cells.map(c => c.id)
    const next = bumpCellsFontSize(t, ids, 1, bounds)
    expect(next.cells.map(c => c.fontSize)).toEqual([14, 14])
  })

  it('невыделенные ячейки не трогаются', () => {
    const t = createInitialTable(1, 2)
    const next = bumpCellsFontSize(t, [t.cells[0].id], -1, bounds)
    expect(next.cells[0].fontSize).toBe(12)
    expect(next.cells[1].fontSize).toBeUndefined()
  })

  it('за границы не выходит', () => {
    const t = createInitialTable(1, 1)
    const ids = t.cells.map(c => c.id)
    let next = t
    for (let i = 0; i < 10; i++) next = bumpCellsFontSize(next, ids, 1, bounds)
    expect(next.cells[0].fontSize).toBe(15)
    for (let i = 0; i < 20; i++) next = bumpCellsFontSize(next, ids, -1, bounds)
    expect(next.cells[0].fontSize).toBe(9)
  })
})

describe('тулбар конструктора', () => {
  const bar = read('./TableBuilderToolbar.jsx')

  it('у каждой кнопки есть подсказка по наведению', () => {
    const buttons = (bar.match(/<button/g) ?? []).length
    const titles  = (bar.match(/title=/g)  ?? []).length
    expect(buttons).toBeGreaterThanOrEqual(9)
    expect(titles).toBeGreaterThanOrEqual(buttons)
  })

  it('есть и объединение, и обратное разбиение', () => {
    expect(bar).toContain('onClick={onMerge}')
    expect(bar).toContain('onClick={onSplit}')
    expect(bar).toContain('disabled={!canSplit}')
  })

  it('после объединения режим выделения не выключается', () => {
    const builder = read('./TableGridBuilder.jsx')
    expect(builder).toContain('onMerge={mergeSelected}')
    expect(builder).toContain('onSplit={splitSelected}')
    expect(builder).not.toContain('setSelectMode(false)')
  })

  it('в редакторе таблицы текст не выделяется, кроме полей ввода', () => {
    const css = read('../../../styles/canvas/table-editor-modal.css')
    expect(css.slice(css.indexOf('.tableEditorModal {'))).toContain('user-select: none')
    expect(css).toContain('.tableEditorModal input,')
    expect(read('./TableGridBuilder.jsx')).toContain('e.preventDefault()')
  })
})

describe('удаление конкретных строк и колонок', () => {
  it('удаляет именно выделенную строку, остальные съезжают', () => {
    let t = createInitialTable(3, 2)
    t = { ...t, cells: t.cells.map(c => ({ ...c, value: `${c.row}${c.col}` })) }
    const next = removeRows(t, 1)
    expect(next.rowCount).toBe(2)
    expect(at(next, 0, 0).value).toBe('00')
    expect(at(next, 1, 0).value).toBe('20')   // бывшая третья строка встала второй
  })

  it('удаляет именно выделенную колонку', () => {
    let t = createInitialTable(2, 3)
    t = { ...t, cells: t.cells.map(c => ({ ...c, value: `${c.row}${c.col}` })) }
    const next = removeCols(t, 0)
    expect(next.colCount).toBe(2)
    expect(at(next, 0, 0).value).toBe('01')
  })

  it('объединённая ячейка теряет только попавшие под нож клетки', () => {
    const merged = mergeSelection(createInitialTable(3, 2), 0, 0, 1, 0)  // 2×1 слева
    const next = removeRows(merged, 1)
    const big = next.cells.find(c => c.row === 0 && c.col === 0)
    expect(big.rowspan).toBe(1)
    expect(next.rowCount).toBe(2)
  })

  it('диапазон строк удаляется целиком', () => {
    const next = removeRows(createInitialTable(4, 1), 1, 2)
    expect(next.rowCount).toBe(2)
    expect(next.rows.reduce((s, r) => s + r.heightPct, 0)).toBeCloseTo(100, 6)
  })

  it('последнюю строку/колонку не отдаёт — пустой таблицы не бывает', () => {
    const t = createInitialTable(1, 1)
    expect(removeRows(t, 0)).toBe(t)
    expect(removeCols(t, 0)).toBe(t)
  })

  it('пропорции оставшихся полос снова дают 100%', () => {
    const next = removeCols(createInitialTable(1, 4), 2)
    expect(next.columns.reduce((s, c) => s + c.widthPct, 0)).toBeCloseTo(100, 6)
  })
})

describe('отмена действий (10 шагов)', () => {
  const table0 = createInitialTable(2, 2)
  const apply = (st, fn, tag) => gridHistoryReducer(st, { type: 'apply', fn, tag })
  const undo  = st => gridHistoryReducer(st, { type: 'undo' })

  it('возвращает предыдущее состояние', () => {
    const st = apply(initGridHistory(table0), t => removeRows(t, 0))
    expect(st.table.rowCount).toBe(1)
    expect(undo(st).table).toBe(table0)
  })

  it('помнит ровно 10 шагов, старые забывает', () => {
    let st = initGridHistory(table0)
    for (let i = 0; i < 15; i++) st = apply(st, t => ({ ...t, colCount: t.colCount }))
    expect(st.past).toHaveLength(HISTORY_LIMIT)
  })

  it('набор текста в одной ячейке — один шаг, а не шаг на букву', () => {
    const id = table0.cells[0].id
    let st = initGridHistory(table0)
    for (const v of ['п', 'пр', 'при']) st = apply(st, t => setCellValue(t, id, v), `value:${id}`)
    expect(st.past).toHaveLength(1)
    expect(undo(st).table).toBe(table0)
  })

  it('другое действие прерывает склейку', () => {
    const id = table0.cells[0].id
    let st = initGridHistory(table0)
    st = apply(st, t => setCellValue(t, id, 'а'), `value:${id}`)
    st = apply(st, t => removeRows(t, 0))
    st = apply(st, t => setCellValue(t, t.cells[0].id, 'б'), 'value:other')
    expect(st.past.length).toBeGreaterThanOrEqual(2)
  })

  it('операция без изменений шаг не заводит', () => {
    const st = apply(initGridHistory(table0), t => t)
    expect(st.past).toHaveLength(0)
    expect(undo(st)).toBe(st)
  })
})

describe('таймлайн подчищается вслед за сеткой', () => {
  const tl = {
    layers: [
      { id: 'l1', cellId: 'a', clips: [{ start: 0, end: 1 }] },
      { id: 'l2', cellId: 'gone', clips: [{ start: 1, end: 2 }] },
      { id: 'l3', word: 'again', clips: [{ start: 2, end: 3 }] },
      { id: 'l4', isCheck: true, clips: [{ start: 3, end: 4 }] },
    ],
  }

  it('дорожка исчезнувшей ячейки уходит, остальные остаются', () => {
    const next = pruneTimelineForCells(tl, new Set(['a']))
    expect(next.layers.map(l => l.id)).toEqual(['l1', 'l3', 'l4'])
  })

  it('чистить нечего — возвращается тот же объект (лишнего рендера нет)', () => {
    expect(pruneTimelineForCells(tl, new Set(['a', 'gone']))).toBe(tl)
    expect(pruneTimelineForCells(null, new Set(['a']))).toBe(null)
  })

  it('редактор считает актуальный таймлайн производно от ячеек', () => {
    const modal = read('./TableEditorModal.jsx')
    expect(modal).toContain('pruneTimelineForCells(timeline, new Set(cells.map(c => c.id)))')
    expect(modal).toContain('timeline={liveTimeline}')
    expect(modal).toContain('timeline: liveTimeline')
  })
})
