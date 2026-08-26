import { useEffect, useRef, useState } from 'react'
import { ROW_UNIT_PX } from '../../../shared/ui/TableGrid.jsx'
import { FONT_MIN, FONT_MAX, DEFAULT_FONT_SIZE } from './tableAutoFitText.js'
import TableResizeHandles from './TableResizeHandles.jsx'
import CellOptionsPopover from './CellOptionsPopover.jsx'
import TableBuilderCell from './TableBuilderCell.jsx'
import TableBuilderToolbar from './TableBuilderToolbar.jsx'
import { useNoTextSelection } from './useNoTextSelection.js'

// Левая панель конструктора: тулбар (+строка/+колонка) + переключатель режима
// выделения для объединения ячеек + редактируемая сетка.
// Два режима: «редактирование» (дефолт, клики = ввод текста) и «выделение»
// (все клики идут в drag-выделение → можно объединять/разбивать/менять размер текста).
export default function TableGridBuilder({ grid }) {
  const { table, selection, canMerge, canSplit, isHeaderSelected, canUndo, undo,
    addRow, addColumn, removeRow, removeColumn, removeSelectedRows, removeSelectedColumns,
    setCellValue, setCellOptions, bumpFontSize, setColumnWidth, setRowHeight, startSelect, extendSelect, endSelect,
    clearSelection, mergeSelected, splitSelected, toggleHeaderSelected, autoFitText } = grid

  const draggingRef = useRef(false)
  const gridRef = useRef(null)
  const wrapRef = useRef(null)
  // Протяжка по ячейкам — это их выделение, а не выделение текста в них
  useNoTextSelection(wrapRef)
  const [selectMode, setSelectMode] = useState(false)
  // Ячейка, которой сейчас задают особые значения (выпадающее меню в уроке)
  const [optsCellId, setOptsCellId] = useState(null)
  const optsCell = optsCellId ? table.cells.find(c => c.id === optsCellId) : null

  useEffect(() => {
    function onUp() { draggingRef.current = false; endSelect() }
    window.addEventListener('mouseup', onUp)
    return () => window.removeEventListener('mouseup', onUp)
  }, [endSelect])

  // Ctrl+Z — та же отмена, что и кнопка ↶. В полях ввода не перехватываем:
  // там Ctrl+Z должен отменять набор текста, как везде
  useEffect(() => {
    function onKey(e) {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return
      const tag = e.target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return
      e.preventDefault()
      undo()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo])

  const cellsInSelection = (selectMode && selection)
    ? table.cells.filter(c =>
        c.row <= selection.r2 && c.row + c.rowspan - 1 >= selection.r1 &&
        c.col <= selection.c2 && c.col + c.colspan - 1 >= selection.c1)
    : []

  // Размер текста меняется у ВСЕХ выделенных ячеек разом. В тулбаре показываем
  // общее значение, а если у ячеек оно разное — «≠» (жать A−/A+ всё равно можно)
  const sizes = cellsInSelection.map(c => c.fontSize ?? DEFAULT_FONT_SIZE)
  const sameSize = sizes.length > 0 && sizes.every(v => v === sizes[0])
  const fontControl = cellsInSelection.length ? {
    label: sameSize ? `${sizes[0]}` : '≠',
    count: cellsInSelection.length,
    canDown: sizes.some(v => v > FONT_MIN),
    canUp:   sizes.some(v => v < FONT_MAX),
  } : null

  function handleBumpFontSize(delta) {
    if (!cellsInSelection.length) return
    bumpFontSize(cellsInSelection.map(c => c.id), delta)
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

  // Из режима выделения после объединения/разбиения НЕ выходим: обратную
  // операцию часто делают следом («не туда объединил»), и каждый раз включать
  // режим заново было лишним шагом

  return (
    <div className="tableBuilderWrap" ref={wrapRef}>
      <TableBuilderToolbar
        table={table}
        selectMode={selectMode}
        onToggleSelectMode={toggleSelectMode}
        canMerge={canMerge}
        canSplit={canSplit}
        hasSelection={!!selection}
        isHeaderSelected={isHeaderSelected}
        fontControl={fontControl}
        onAddRow={addRow}
        onRemoveRow={selectMode && selection ? removeSelectedRows : removeRow}
        onAddColumn={addColumn}
        onRemoveColumn={selectMode && selection ? removeSelectedColumns : removeColumn}
        onMerge={mergeSelected}
        onSplit={splitSelected}
        onToggleHeader={toggleHeaderSelected}
        onClearSelection={clearSelection}
        onBumpFontSize={handleBumpFontSize}
        onAutoFit={autoFitText}
        canUndo={canUndo}
        onUndo={undo}
      />

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
            <TableBuilderCell
              key={cell.id}
              cell={cell}
              selectMode={selectMode}
              selected={inSelection(cell)}
              onValueChange={value => setCellValue(cell.id, value)}
              onOpenOptions={() => setOptsCellId(cell.id)}
              onMouseDown={e => {
                if (!selectMode) return
                // Без preventDefault браузер вместе с выделением ячеек тянет
                // и выделение текста — сначала в этой ячейке, потом в соседних
                e.preventDefault()
                draggingRef.current = true
                startSelect(cell.row, cell.col, cell.row + cell.rowspan - 1, cell.col + cell.colspan - 1)
              }}
              onMouseEnter={() => {
                if (draggingRef.current && selectMode)
                  extendSelect(cell.row, cell.col, cell.row + cell.rowspan - 1, cell.col + cell.colspan - 1)
              }}
            />
          ))}
        </div>
        <TableResizeHandles table={table} gridRef={gridRef} setColumnWidth={setColumnWidth} setRowHeight={setRowHeight} />
        {optsCell && (
          <CellOptionsPopover
            cell={optsCell}
            onSave={options => setCellOptions(optsCell.id, options)}
            onClose={() => setOptsCellId(null)}
          />
        )}
      </div>
    </div>
  )
}
