import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useTableGrid } from './useTableGrid.js'
import TableGridBuilder from './TableGridBuilder.jsx'
import TablePhonePreview from './TablePhonePreview.jsx'
import TableTemplatesBar from './TableTemplatesBar.jsx'
import TableTimelineEditor from './TableTimelineEditor.jsx'

// Полноэкранный редактор ноды «Таблица»: конструктор сетки (левая/правая панели)
// + редактор таймлайна (кнопка «Таймлайн» → другой вид внутри того же окна).
// Правки локальны до нажатия «Сохранить»; onSave получает полный объект tData.
export default function TableEditorModal({
  initialTable, initialFileId, initialWaveformData, initialDuration, initialTimeline,
  lessonFiles, onPickFile, onSave, onClose,
}) {
  const grid = useTableGrid(initialTable)
  const [showTimeline, setShowTimeline]     = useState(false)
  const [fileId,       setFileId]           = useState(initialFileId ?? null)
  const [waveformData, setWaveformData]     = useState(initialWaveformData ?? null)
  const [duration,     setDuration]         = useState(initialDuration ?? null)
  const [timeline,     setTimeline]         = useState(initialTimeline ?? null)

  function applyTemplate(t) {
    if (!window.confirm('Заменить текущую сетку шаблоном? Несохранённые правки будут потеряны.')) return
    grid.loadTable(t)
  }

  function handleTimelineSave(data) {
    setFileId(data.file_id)
    setWaveformData(data.waveformData)
    setDuration(data.duration)
    setTimeline(data.timeline)
    setShowTimeline(false)
  }

  return createPortal(
    <div className="tableEditorOverlay" onClick={onClose} onMouseDown={e => e.stopPropagation()}>
      <div className="tableEditorModal" onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}>
        {showTimeline ? (
          <TableTimelineEditor
            table={grid.table}
            fileId={fileId}
            waveformData={waveformData}
            duration={duration}
            timeline={timeline}
            lessonFiles={lessonFiles}
            onPickFile={onPickFile}
            onSave={handleTimelineSave}
            onBack={() => setShowTimeline(false)}
          />
        ) : (
          <>
            <div className="tableEditorHeader">
              <span className="tableEditorTitle">Конструктор таблицы</span>
              <div className="tableEditorHeaderActions">
                <button className="tableEditorBtnGhost" onClick={() => setShowTimeline(true)}>
                  {fileId ? '♪ Таймлайн' : '♪ Монтаж'}
                </button>
                <button className="tableEditorBtnGhost" onClick={onClose}>Отмена</button>
                <button className="tableEditorBtnPrimary" onClick={() => onSave({ table: grid.table, file_id: fileId, waveformData, duration, timeline })}>
                  Сохранить
                </button>
              </div>
            </div>
            <TableTemplatesBar table={grid.table} onApply={applyTemplate} />
            <div className="tableEditorBody">
              <TableGridBuilder grid={grid} />
              <TablePhonePreview table={grid.table} />
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
