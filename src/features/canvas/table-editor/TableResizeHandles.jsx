import { useEffect, useState } from 'react'

// Границы между дорожками (кроме последней) как накопленный % — без строки idx
// и последней дорожки, тянуть которую уже нечего.
function cumulativeBoundaries(list, sizeKey) {
  return list.slice(0, -1).reduce((acc, item) => {
    const prevPct = acc.length ? acc[acc.length - 1].pct : 0
    return [...acc, { idx: acc.length, pct: prevPct + item[sizeKey] }]
  }, [])
}

// Тонкие невидимые полосы поверх границ колонок/строк — отдельно от самих
// ячеек, чтобы наведение на край не попадало в textarea ячейки и не начинало
// ввод текста. Тянем мышью → пересчитываем процент в setColumnWidth/setRowHeight.
export default function TableResizeHandles({ table, gridRef, setColumnWidth, setRowHeight }) {
  const [drag, setDrag] = useState(null) // {axis, idx, startPos, startPct, containerPx} | null

  useEffect(() => {
    if (!drag) return
    function onMove(e) {
      const pos = drag.axis === 'col' ? e.clientX : e.clientY
      const deltaPct = ((pos - drag.startPos) / drag.containerPx) * 100
      const newPct = drag.startPct + deltaPct
      if (drag.axis === 'col') setColumnWidth(drag.idx, newPct)
      else setRowHeight(drag.idx, newPct)
    }
    function onUp() { setDrag(null) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [drag, setColumnWidth, setRowHeight])

  function startColDrag(e, idx) {
    e.preventDefault()
    const rect = gridRef.current.getBoundingClientRect()
    setDrag({ axis: 'col', idx, startPos: e.clientX, startPct: table.columns[idx].widthPct, containerPx: rect.width })
  }
  function startRowDrag(e, idx) {
    e.preventDefault()
    const rect = gridRef.current.getBoundingClientRect()
    setDrag({ axis: 'row', idx, startPos: e.clientY, startPct: table.rows[idx].heightPct, containerPx: rect.height })
  }

  const colBoundaries = cumulativeBoundaries(table.columns, 'widthPct')
  const rowBoundaries = cumulativeBoundaries(table.rows, 'heightPct')

  return (
    <div className="tableResizeHandles">
      {colBoundaries.map(b => (
        <div
          key={`c${b.idx}`}
          className="tableResizeHandleCol"
          style={{ left: `${b.pct}%` }}
          onMouseDown={e => startColDrag(e, b.idx)}
        />
      ))}
      {rowBoundaries.map(b => (
        <div
          key={`r${b.idx}`}
          className="tableResizeHandleRow"
          style={{ top: `${b.pct}%` }}
          onMouseDown={e => startRowDrag(e, b.idx)}
        />
      ))}
    </div>
  )
}
