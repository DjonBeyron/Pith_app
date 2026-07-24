// Чистый рендер сетки таблицы — общий для превью в конструкторе (canvas) и
// плеера урока. Ничего не знает о режиме (диктор/клик): только вёрстка сетки
// с учётом rowspan/colspan + необязательная подсветка/клик по ячейке.
//
// Высота строк задаётся в процентах (heightPct, сумма 100) — чтобы это имело
// смысл, контейнеру нужна явная общая высота, иначе % считаются от auto (0).
// Берём rowCount * ROW_UNIT_PX как разумный дефолт высоты одной «единицы» строки.
export const ROW_UNIT_PX = 44

// revealedIds: если передан — ячейки, которых нет в наборе, показывают текст с
// opacity:0 (сама сетка/фон ячейки остаются на месте, скрывается только текст).
// Не передан — обратная совместимость: текст виден всегда (как раньше).
export default function TableGrid({ columns, rows, cells, rowCount, highlightedIds, selectedIds, dimmedIds, revealedIds, onCellClick }) {
  if (!columns?.length || !cells?.length) return null

  const gridTemplateColumns = columns.map(c => `${c.widthPct}%`).join(' ')
  const gridTemplateRows    = rows?.length ? rows.map(r => `${r.heightPct}%`).join(' ') : `repeat(${rowCount}, auto)`
  const height = rows?.length ? rowCount * ROW_UNIT_PX : undefined

  return (
    <div className="tableGrid" style={{ gridTemplateColumns, gridTemplateRows, height }}>
      {cells.map(cell => {
        const classes = [
          'tableGridCell',
          cell.isHeader ? 'tableGridCellHeader' : '',
          highlightedIds?.has(cell.id) ? 'tableGridCellHighlighted' : '',
          selectedIds?.has(cell.id) ? 'tableGridCellSelected' : '',
          dimmedIds?.has(cell.id) ? 'tableGridCellDimmed' : '',
          onCellClick ? 'tableGridCellClickable' : '',
        ].filter(Boolean).join(' ')
        const revealed = !revealedIds || revealedIds.has(cell.id)
        return (
          <div
            key={cell.id}
            className={classes}
            style={{
              gridColumn: `${cell.col + 1} / span ${cell.colspan}`,
              gridRow: `${cell.row + 1} / span ${cell.rowspan}`,
            }}
            onClick={onCellClick ? () => onCellClick(cell) : undefined}
          >
            <span
              className={`tableGridCellText${revealed ? '' : ' tableGridCellTextHidden'}`}
              style={cell.fontSize ? { fontSize: `${cell.fontSize}px` } : undefined}
            >{cell.value}</span>
          </div>
        )
      })}
    </div>
  )
}
