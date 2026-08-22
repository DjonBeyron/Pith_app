import TableGrid from '../../../shared/ui/TableGrid.jsx'
import { computeRevealedCellIds, computeHighlightedCellIds } from '../../../shared/lib/tableDictatorTiming.js'
import { fmtAudioTime } from '../../../shared/lib/audioUtils.js'

// Окно предпросмотра над дорожками — как в монтажной программе: показывает
// таблицу ровно такой, какой она будет в момент, где стоит плейхед. Считается
// теми же функциями, что и в плеере (tableDictatorTiming.js), поэтому монтаж
// не расходится с уроком.
export default function TableTimelinePreview({ table, layers, currentTime, duration }) {
  if (!table?.cells?.length) return null

  const revealed    = computeRevealedCellIds(layers, currentTime)
  const highlighted = computeHighlightedCellIds(layers, currentTime)

  return (
    <div className="tlPreview">
      <div className="tlPreviewHead">
        <span className="tlPreviewTitle">Предпросмотр</span>
        <span className="tlPreviewTime">{fmtAudioTime(currentTime)} / {fmtAudioTime(duration)}</span>
      </div>
      <div className="tlPreviewCard">
        <TableGrid
          columns={table.columns}
          rows={table.rows}
          cells={table.cells}
          rowCount={table.rowCount}
          revealedIds={revealed}
          highlightedIds={highlighted}
        />
      </div>
    </div>
  )
}
