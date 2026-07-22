import { useEffect, useRef, useState } from 'react'
import { ROW_UNIT_PX } from '../../../shared/ui/TableGrid.jsx'
import TableResizeHandles from './TableResizeHandles.jsx'

// Левая панель конструктора: тулбар (+строка/+колонка) + переключатель режима
// выделения для объединения ячеек + редактируемая сетка.
// Два режима: «редактирование» (дефолт, клики = ввод текста) и «выделение»
// (все клики идут в drag-выделение → можно объединять/разбивать).
export default function TableGridBuilder({ grid }) {
  const { table, selection, canMerge, addRow, addColumn, removeRow, removeColumn,
    setCellValue, setColumnWidth, setRowHeight, startSelect, extendSelect, endSelect,
    clearSelection, mergeSelected, splitCell } = grid

  const draggingRef = useRef(false)
  const gridRef = useRef(null)
  const [selectMode, setSelectMode] = useState(false)

  useEffect(() => {
    function onUp() { draggingRef.current = false; endSelect() }
    window.addEventListener('mouseup', onUp)
    return () => window.removeEventListener('mouseup', onUp)
  }, [endSelect])

  // Разбить можно только когда в выделении ровно одна ячейка — и она объединённая.
  // Нельзя проверять r1===r2 && c1===c2: клик на объединённую 2×2 даёт r2>r1.
  const cellsInSelection = (selectMode && selection)
    ? table.cells.filter(c =>
        c.row <= selection.r2 && c.row + c.rowspan - 1 >= selection.r1 &&
        c.col <= selection.c2 && c.col + c.colspan - 1 >= selection.c1)
    : []
  const singleSelectedCell = cellsInSelection.length === 1 && (cellsInSelection[0].rowspan > 1 || cellsInSelection[0].colspan > 1)
    ? cellsInSelection[0]
    : null

  // Подсветка только в режиме выделения
  function inSelection(cell) {
    if (!selectMode || !selection) return false
    return cell.row <= selection.r2 && cell.row + cell.rowspan - 1 >= selection.r1 &&
      cell.col <= selection.c2 && cell.col + cell.colspan - 1 >= selection.c1
  }

  function toggleSelectMode() {
    clearSelection()
    setSelectMode(m => !m)
  }

  function handleMerge() {
    mergeSelected()
    setSelectMode(false)
  }

  function handleSplit() {
    if (singleSelectedCell) splitCell(singleSelectedCell.id)
    setSelectMode(false)
  }

  return (
    <div className="tableBuilderWrap">
      <div className="tableBuilderToolbar">
        <button onClick={addRow}>+ Строка</button>
        <button onClick={removeRow} disabled={table.rowCount <= 1}>− Строка</button>
        <button onClick={addColumn}>+ Колонка</button>
        <button onClick={removeColumn} disabled={table.colCount <= 1}>− Колонка</button>

        <div className="tableBuilderToolbarDivider" />

        <button
          className={`tableBuilderBtnSelect${selectMode ? ' tableBuilderBtnSelectActive' : ''}`}
          onClick={toggleSelectMode}
          title="Переключить режим: выделение ячеек для объединения / ввод текста"
        >
          {selectMode ? '✓ Режим выделения' : 'Объединить ячейки…'}
        </button>

        {selectMode && (
          <>
            <button onClick={handleMerge} disabled={!canMerge}>Объединить</button>
            <button onClick={handleSplit} disabled={!singleSelectedCell}>Разбить</button>
            <button onClick={clearSelection} disabled={!selection}>Сбросить</button>
          </>
        )}
      </div>

      {selectMode && (
        <div className="tableBuilderSelectHint">
          Зажмите кнопку мыши и протащите по ячейкам, которые нужно объединить → нажмите «Объединить»
        </div>
      )}

      <div className="tableBuilderGridWrap" ref={gridRef}>
        <div
          className={`tableBuilderGrid${selectMode ? ' tableBuilderGridSelectMode' : ''}`}
          style={{
            gridTemplateColumns: table.columns.map(c => `${c.widthPct}%`).join(' '),
            gridTemplateRows: table.rows.map(r => `${r.heightPct}%`).join(' '),
            height: table.rowCount * ROW_UNIT_PX,
          }}
        >
          {table.cells.map(cell => (
            <div
              key={cell.id}
              className={`tableBuilderCell${inSelection(cell) ? ' tableBuilderCellSelected' : ''}`}
              style={{
                gridColumn: `${cell.col + 1} / span ${cell.colspan}`,
                gridRow: `${cell.row + 1} / span ${cell.rowspan}`,
              }}
              onMouseDown={() => {
                if (!selectMode) return
                draggingRef.current = true
                startSelect(cell.row, cell.col, cell.row + cell.rowspan - 1, cell.col + cell.colspan - 1)
              }}
              onMouseEnter={() => {
                if (draggingRef.current && selectMode)
                  extendSelect(cell.row, cell.col, cell.row + cell.rowspan - 1, cell.col + cell.colspan - 1)
              }}
            >
              <textarea
                className="tableBuilderCellInput"
                value={cell.value}
                onChange={e => setCellValue(cell.id, e.target.value)}
                onMouseDown={e => { if (!selectMode) e.stopPropagation() }}
                style={{ pointerEvents: selectMode ? 'none' : 'auto', cursor: selectMode ? 'crosshair' : 'text' }}
                placeholder="…"
              />
            </div>
          ))}
        </div>
        <TableResizeHandles table={table} gridRef={gridRef} setColumnWidth={setColumnWidth} setRowHeight={setRowHeight} />
      </div>
    </div>
  )
}
