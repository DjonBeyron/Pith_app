import { useState, useCallback } from 'react'
import * as G from './tableGridUtils.js'

// Состояние конструктора сетки: сама таблица + drag-выделение диапазона ячеек
// для объединения. Ничего не отправляет наружу автоматически — коммит наружу
// делает вызывающий (TableEditorModal) по кнопке «Сохранить».
export function useTableGrid(initialTable) {
  const [table, setTable] = useState(() => G.normalizeTable(initialTable) ?? G.createInitialTable())
  const [selection, setSelection] = useState(null) // {r1,c1,r2,c2} | null
  const [, setDragAnchor] = useState(null)

  const addRow    = useCallback(() => setTable(t => G.addRow(t)), [])
  const addColumn = useCallback(() => setTable(t => G.addColumn(t)), [])
  const removeRow    = useCallback(() => setTable(t => G.removeLastRow(t)), [])
  const removeColumn = useCallback(() => setTable(t => G.removeLastColumn(t)), [])
  const setCellValue  = useCallback((id, value) => setTable(t => G.setCellValue(t, id, value)), [])
  const setColumnWidth = useCallback((idx, pct) => setTable(t => G.setColumnWidth(t, idx, pct)), [])
  const setRowHeight   = useCallback((idx, pct) => setTable(t => G.setRowHeight(t, idx, pct)), [])
  const splitCell = useCallback(id => { setTable(t => G.splitCell(t, id)); setSelection(null) }, [])
  const loadTable = useCallback(next => { setTable(G.normalizeTable(next)); setSelection(null) }, [])

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
  const isHeaderSelected = !!selection &&
    G.isHeaderSelection(table.cells, table.rowCount, table.colCount, selection.r1, selection.c1, selection.r2, selection.c2)

  const mergeSelected = useCallback(() => {
    setTable(t => (selection ? G.mergeSelection(t, selection.r1, selection.c1, selection.r2, selection.c2) : t))
    setSelection(null)
  }, [selection])

  // Ставит/снимает isHeader сразу у всех ячеек выделения (см. tableGridUtils.js:toggleHeaderSelection)
  const toggleHeaderSelected = useCallback(() => {
    setTable(t => (selection ? G.toggleHeaderSelection(t, selection.r1, selection.c1, selection.r2, selection.c2) : t))
  }, [selection])

  return {
    table, selection, canMerge, isHeaderSelected,
    addRow, addColumn, removeRow, removeColumn,
    setCellValue, setColumnWidth, setRowHeight, splitCell, loadTable,
    startSelect, extendSelect, endSelect, clearSelection, mergeSelected, toggleHeaderSelected,
  }
}
