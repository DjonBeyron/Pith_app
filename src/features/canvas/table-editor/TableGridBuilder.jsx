import { useEffect, useRef, useState } from 'react'
import { ROW_UNIT_PX } from '../../../shared/ui/TableGrid.jsx'
import { FONT_MIN, FONT_MAX } from './tableAutoFitText.js'
import TableResizeHandles from './TableResizeHandles.jsx'

const DEFAULT_FONT_SIZE = 13 // .tableGridCell { font-size: 13px } — table-grid.css

// Левая панель конструктора: тулбар (+строка/+колонка) + переключатель режима
// выделения для объединения ячеек + редактируемая сетка.
// Два режима: «редактирование» (дефолт, клики = ввод текста) и «выделение»
// (все клики идут в drag-выделение → можно объединять/разбивать/менять размер текста).
export default function TableGridBuilder({ grid }) {
  const { table, selection, canMerge, isHeaderSelected, addRow, addColumn, removeRow, removeColumn,
    setCellValue, setCellFontSize, setColumnWidth, setRowHeight, startSelect, extendSelect, endSelect,
    clearSelection, mergeSelected, splitCell, toggleHeaderSelected, autoFitText } = grid

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
  // Для ручного размера текста — любая одна выделенная ячейка (без ограничения на объединённость)
  const singleCell = cellsInSelection.length === 1 ? cellsInSelection[0] : null

  function bumpFontSize(delta) {
    if (!singleCell) return
    const next = Math.max(FONT_MIN, Math.min(FONT_MAX, (singleCell.fontSize ?? DEFAULT_FONT_SIZE) + delta))
    setCellFontSize(singleCell.id, next)
  }

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
          title="Переключить режим: выделение ячеек — объединить/разбить/сделать заголовком"
        >
          {selectMode ? '✓ Режим редактирования' : 'Редактировать'}
        </button>

        {selectMode && (
          <>
            <button onClick={handleMerge} disabled={!canMerge}>Объединить</button>
            <button onClick={handleSplit} disabled={!singleSelectedCell}>Разбить</button>
            <button
              onClick={toggleHeaderSelected}
              disabled={!selection}
              title="Заголовок: текст жирнее, фон ячейки чуть темнее — навсегда, не по времени"
            >{isHeaderSelected ? '✓ Заголовок' : 'Заголовок'}</button>
            <button onClick={clearSelection} disabled={!selection}>Сбросить</button>

            {singleCell && (
              <div className="tableBuilderFontSize" title="Размер текста этой ячейки">
                <button onClick={() => bumpFontSize(-1)} disabled={(singleCell.fontSize ?? DEFAULT_FONT_SIZE) <= FONT_MIN}>A−</button>
                <span>{singleCell.fontSize ?? DEFAULT_FONT_SIZE}px</span>
                <button onClick={() => bumpFontSize(1)} disabled={(singleCell.fontSize ?? DEFAULT_FONT_SIZE) >= FONT_MAX}>A+</button>
              </div>
            )}
          </>
        )}

        <div className="tableBuilderToolbarDivider" />

        <button
          onClick={autoFitText}
          title="Подобрать размер текста под каждую ячейку так, чтобы он помещался даже на маленьком iPhone SE"
        >🔤 Авто-размер текста</button>
      </div>

      {selectMode && (
        <div className="tableBuilderSelectHint">
          Зажмите кнопку мыши и протащите по ячейкам, которые нужно объединить/разбить/сделать заголовком
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
              className={`tableBuilderCell${cell.isHeader ? ' tableBuilderCellHeader' : ''}${inSelection(cell) ? ' tableBuilderCellSelected' : ''}`}
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
                style={{
                  pointerEvents: selectMode ? 'none' : 'auto', cursor: selectMode ? 'crosshair' : 'text',
                  fontSize: cell.fontSize ? `${cell.fontSize}px` : undefined,
                }}
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
