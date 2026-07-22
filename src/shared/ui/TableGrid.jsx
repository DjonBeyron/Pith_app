// Чистый рендер сетки таблицы — общий для превью в конструкторе (canvas) и
// плеера урока. Ничего не знает о режиме (диктор/клик): только вёрстка сетки
// с учётом rowspan/colspan + необязательная подсветка/клик по ячейке.
//
// Высота строк задаётся в процентах (heightPct, сумма 100) — чтобы это имело
// смысл, контейнеру нужна явная общая высота, иначе % считаются от auto (0).
// Берём rowCount * ROW_UNIT_PX как разумный дефолт высоты одной «единицы» строки.
export const ROW_UNIT_PX = 44

export default function TableGrid({ columns, rows, cells, rowCount, highlightedIds, selectedIds, onCellClick }) {
  if (!columns?.length || !cells?.length) return null

  const gridTemplateColumns = columns.map(c => `${c.widthPct}%`).join(' ')
  const gridTemplateRows    = rows?.length ? rows.map(r => `${r.heightPct}%`).join(' ') : `repeat(${rowCount}, auto)`
  const height = rows?.length ? rowCount * ROW_UNIT_PX : undefined

  return (
    <div className="tableGrid" style={{ gridTemplateColumns, gridTemplateRows, height }}>
      {cells.map(cell => {
        const classes = [
          'tableGridCell',
          highlightedIds?.has(cell.id) ? 'tableGridCellHighlighted' : '',
          selectedIds?.has(cell.id) ? 'tableGridCellSelected' : '',
          onCellClick ? 'tableGridCellClickable' : '',
        ].filter(Boolean).join(' ')
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
            {cell.value}
          </div>
        )
      })}
    </div>
  )
}
