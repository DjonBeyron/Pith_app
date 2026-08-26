import { useState, useCallback, useReducer } from 'react'
import * as G from './tableGridUtils.js'
import { autoFitTableText, FONT_MIN, FONT_MAX, DEFAULT_FONT_SIZE } from './tableAutoFitText.js'
import { gridHistoryReducer, initGridHistory } from './tableGridHistory.js'

// Состояние конструктора сетки: сама таблица + drag-выделение диапазона ячеек
// для объединения. Ничего не отправляет наружу автоматически — коммит наружу
// делает вызывающий (TableEditorModal) по кнопке «Сохранить».
export function useTableGrid(initialTable) {
  // Таблица живёт вместе со своей историей (10 шагов «Отменить») — один
  // reducer, а не два состояния: снимок берётся ровно из того же значения,
  // которое правка заменяет собой (tableGridHistory.js)
  const [state, dispatch] = useReducer(
    gridHistoryReducer,
    G.normalizeTable(initialTable) ?? G.createInitialTable(),
    initGridHistory,
  )
  const table = state.table
  const canUndo = state.past.length > 0
  // tag (необязательный) склеивает подряд идущие правки одного вида в один шаг
  const setTable = useCallback(
    (fn, tag) => dispatch({ type: 'apply', fn: typeof fn === 'function' ? fn : () => fn, tag }), [])
  const undo = useCallback(() => dispatch({ type: 'undo' }), [])
  const [selection, setSelection] = useState(null) // {r1,c1,r2,c2} | null
  const [, setDragAnchor] = useState(null)

  const addRow    = useCallback(() => setTable(t => G.addRow(t)), [setTable])
  const addColumn = useCallback(() => setTable(t => G.addColumn(t)), [setTable])
  const removeRow    = useCallback(() => setTable(t => G.removeLastRow(t)), [setTable])
  const removeColumn = useCallback(() => setTable(t => G.removeLastColumn(t)), [setTable])
  // Набор текста в одной ячейке — один шаг отмены (tag), а не шаг на букву
  const setCellValue  = useCallback((id, value) =>
    setTable(t => G.setCellValue(t, id, value), `value:${id}`), [setTable])
  const setCellFontSize = useCallback((id, size) => setTable(t => G.setCellFontSize(t, id, size)), [setTable])
  const setCellOptions  = useCallback((id, options) => setTable(t => G.setCellOptions(t, id, options)), [setTable])
  // A−/A+ по всему выделению: размер текста меняется у всех выделенных ячеек разом
  const bumpFontSize = useCallback((ids, delta) => setTable(t =>
    G.bumpCellsFontSize(t, ids, delta, { min: FONT_MIN, max: FONT_MAX, def: DEFAULT_FONT_SIZE })), [setTable])
  const setColumnWidth = useCallback((idx, pct) => setTable(t => G.setColumnWidth(t, idx, pct)), [setTable])
  const setRowHeight   = useCallback((idx, pct) => setTable(t => G.setRowHeight(t, idx, pct)), [setTable])
  // Разбить — обратное объединению: разом для всех объединённых ячеек выделения
  const loadTable = useCallback(next => { setTable(G.normalizeTable(next)); setSelection(null) }, [setTable])

  // anchor и курсор хранятся как полные прямоугольники (r1..r2, c1..c2) — нужно
  // чтобы объединённые ячейки (rowspan/colspan > 1) попадали в выделение целиком.
  const startSelect  = useCallback((r1, c1, r2, c2) => {
    setDragAnchor({ r1, c1, r2, c2 })
    setSelection({ r1, c1, r2, c2 })
  }, [])
  const extendSelect = useCallback((r1, c1, r2, c2) => {
    setDragAnchor(anchor => {
      if (anchor) setSelection({
        r1: Math.min(anchor.r1, r1), c1: Math.min(anchor.c1, c1),
        r2: Math.max(anchor.r2, r2), c2: Math.max(anchor.c2, c2),
      })
      return anchor
    })
  }, [])
  const endSelect = useCallback(() => setDragAnchor(null), [])
  const clearSelection = useCallback(() => setSelection(null), [])

  const canMerge = !!selection && G.canMergeSelection(table.cells, selection.r1, selection.c1, selection.r2, selection.c2)
  const canSplit = !!selection &&
    G.mergedCellsInSelection(table.cells, selection.r1, selection.c1, selection.r2, selection.c2).length > 0
  const isHeaderSelected = !!selection &&
    G.isHeaderSelection(table.cells, table.rowCount, table.colCount, selection.r1, selection.c1, selection.r2, selection.c2)

  // Удаление КОНКРЕТНЫХ строк/колонок — тех, что попали в выделение
  const removeSelectedRows = useCallback(() => {
    setTable(t => (selection ? G.removeRows(t, selection.r1, selection.r2) : t))
    setSelection(null)
  }, [selection, setTable])

  const removeSelectedColumns = useCallback(() => {
    setTable(t => (selection ? G.removeCols(t, selection.c1, selection.c2) : t))
    setSelection(null)
  }, [selection, setTable])

  const splitSelected = useCallback(() => {
    setTable(t => (selection ? G.splitSelection(t, selection.r1, selection.c1, selection.r2, selection.c2) : t))
    setSelection(null)
  }, [selection, setTable])

  const mergeSelected = useCallback(() => {
    setTable(t => (selection ? G.mergeSelection(t, selection.r1, selection.c1, selection.r2, selection.c2) : t))
    setSelection(null)
  }, [selection, setTable])

  // Ставит/снимает isHeader сразу у всех ячеек выделения (см. tableGridUtils.js:toggleHeaderSelection)
  const toggleHeaderSelected = useCallback(() => {
    setTable(t => (selection ? G.toggleHeaderSelection(t, selection.r1, selection.c1, selection.r2, selection.c2) : t))
  }, [selection, setTable])

  // Подгоняет размер текста под ячейку на ширине iPhone SE — см. tableAutoFitText.js
  const autoFitText = useCallback(() => {
    setTable(t => autoFitTableText(t))
  }, [setTable])

  return {
    table, selection, canMerge, canSplit, isHeaderSelected, canUndo, undo,
    addRow, addColumn, removeRow, removeColumn, removeSelectedRows, removeSelectedColumns,
    setCellValue, setCellFontSize, setCellOptions, bumpFontSize, setColumnWidth, setRowHeight, loadTable,
    startSelect, extendSelect, endSelect, clearSelection, mergeSelected, splitSelected, toggleHeaderSelected, autoFitText,
  }
}
