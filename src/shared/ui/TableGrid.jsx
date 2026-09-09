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
// flashDurations — Map(cellId → секунды): сколько мигает подсветка ячейки.
// Берётся из длины её слоя на таймлайне, поэтому длинный клип мигает дольше.
// pickedValues — Map(cellId → выбранное значение): гасит текст ячейки opacity,
// а не фон (фон трогать нельзя — на нём и держится сдвиг таблицы в ручном
// режиме, см. table-manual.css). Для ячейки со списком вариантов (cell.options)
// гасится ТОЛЬКО сама выбранная подстрока значения, а не весь текст ячейки —
// остальные варианты в той же ячейке остаются читаемыми.
function renderCellValue(value, picked, hasOptions) {
  if (picked == null) return value
  if (hasOptions) {
    const idx = value.indexOf(picked)
    if (idx >= 0) {
      return <>
        {value.slice(0, idx)}
        <span className="tableGridCellTextDimmed">{picked}</span>
        {value.slice(idx + picked.length)}
      </>
    }
  }
  return <span className="tableGridCellTextDimmed">{value}</span>
}

export default function TableGrid({ columns, rows, cells, rowCount, highlightedIds, pickedValues, dimmedIds, revealedIds, flashDurations, onCellClick }) {
  if (!columns?.length || !cells?.length) return null

  // Доли, а не проценты. С процентами каждая колонка считается независимо, и
  // после округления их сумма выходит чуть больше ширины сетки: последняя
  // ячейка вылезает за край на доли пикселя, а overflow-x: hidden (и у сетки,
  // и у .tdStage) этот хвост срезает. Отрезалось от правой РАМКИ — она теряла
  // часть своей единственной пиксельной ширины и выглядела полупрозрачной.
  // В чате сцены нет, резать некому — потому там та же рамка была полной.
  //
  // fr раздаёт именно свободное место, поэтому сумма треков точно равна
  // контейнеру. minmax(0, ...) обязателен: у голого fr нижняя граница — размер
  // содержимого, и длинное слово в ячейке раздуло бы колонку шире её доли.
  const gridTemplateColumns = columns.map(c => `minmax(0, ${c.widthPct}fr)`).join(' ')
  const gridTemplateRows    = rows?.length ? rows.map(r => `${r.heightPct}%`).join(' ') : `repeat(${rowCount}, auto)`
  const height = rows?.length ? rowCount * ROW_UNIT_PX : undefined

  return (
    <div className="tableGrid" style={{ gridTemplateColumns, gridTemplateRows, height }}>
      {cells.map(cell => {
        const classes = [
          'tableGridCell',
          cell.isHeader ? 'tableGridCellHeader' : '',
          // Особая ячейка: по тапу в уроке из неё выпадает меню вариантов
          cell.options?.length ? 'tableGridCellOptions' : '',
          highlightedIds?.has(cell.id) ? 'tableGridCellHighlighted' : '',
          // Отработанные ячейки гаснут до 40% — но ТОЛЬКО обычные. Заголовок
          // не участник разбора, а подпись к столбцу: погасив его после того,
          // как по нему проехала зелёная подсветка, мы навсегда делали шапку
          // серой, хотя до подсветки она была белой
          dimmedIds?.has(cell.id) && !cell.isHeader ? 'tableGridCellDimmed' : '',
          onCellClick ? 'tableGridCellClickable' : '',
        ].filter(Boolean).join(' ')
        // Заголовок — как и с dimmedIds выше: подпись столбца не участвует в
        // разборе, гейтить её видимость таймлайном ячеек не за чем. Раньше
        // это не было учтено здесь (в отличие от dimmedIds), и текст шапки
        // мог гаснуть в 0, если у неё на таймлайне оказывался clip[1]
        // проявления, не покрывающий весь плейбек
        const revealed = cell.isHeader || !revealedIds || revealedIds.has(cell.id)
        return (
          <div
            key={cell.id}
            className={classes}
            style={{
              gridColumn: `${cell.col + 1} / span ${cell.colspan}`,
              gridRow: `${cell.row + 1} / span ${cell.rowspan}`,
              ...(flashDurations?.get(cell.id) ? { '--td-flash': `${flashDurations.get(cell.id)}s` } : {}),
            }}
            onClick={onCellClick ? e => onCellClick(cell, e) : undefined}
          >
            <span
              className={`tableGridCellText${revealed ? '' : ' tableGridCellTextHidden'}`}
              style={cell.fontSize ? { fontSize: `${cell.fontSize}px` } : undefined}
            >{renderCellValue(cell.value, pickedValues?.get(cell.id), !!cell.options?.length)}</span>
          </div>
        )
      })}
    </div>
  )
}
