import { useState } from 'react'
import TableEditorModal from './table-editor/TableEditorModal.jsx'

// Кнопка «Создать / редактировать таблицу» в ноде канваса.
// tData — typeData.table (вся таблица + аудио + таймлайн).
// onDataChange — patch → updateTypeData(patch).
export default function NodeTablePicker({ tData, onDataChange, lessonFiles, onPickFile }) {
  const [open, setOpen] = useState(false)
  const tableData = tData.table ?? null

  return (
    <div className="nodeTablePickerWrap" onClick={e => e.stopPropagation()}>
      <div className="nodeTablePickerRow">
        <button className="nodeTablePickerBtn" onClick={() => setOpen(true)}>
          {tableData ? `Редактировать таблицу (${tableData.rowCount}×${tableData.colCount})` : '+ Создать таблицу'}
        </button>
        {tData.file_id && <span className="nodeTableAudioBadge">♪</span>}
      </div>
      {open && (
        <TableEditorModal
          initialTable={tableData}
          initialFileId={tData.file_id ?? null}
          initialWaveformData={tData.waveformData ?? null}
          initialDuration={tData.duration ?? null}
          initialTimeline={tData.timeline ?? null}
          lessonFiles={lessonFiles}
          onPickFile={onPickFile}
          onSave={data => { onDataChange(data); setOpen(false) }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}
