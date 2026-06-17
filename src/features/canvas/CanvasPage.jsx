import { useState } from 'react'
import CanvasBoard from './CanvasBoard.jsx'
import LessonFilesPanel from './LessonFilesPanel.jsx'
import { useLessonFiles } from './useLessonFiles.js'

// Full-screen lesson editor. Opens on top of the tab layout (no router needed —
// App.jsx swaps the whole render tree when canvasLessonId is set).
export default function CanvasPage({ lessonId, onBack }) {
  const [showPanel, setShowPanel] = useState(false)
  const { files, syncing, hasUnsynced, pickFile, removeFile, syncToServer } =
    useLessonFiles(lessonId)

  return (
    <div className="canvasPage">
      <div className="canvasPageHeader">
        <div className="canvasSettingsBtnWrap">
          <button className="canvasSettingsBtn" onClick={() => setShowPanel(s => !s)}>⚙</button>
          {hasUnsynced && <span className="canvasSettingsBadge" />}
        </div>
        <span className="canvasPageSpacer" />
        <button className="canvasPageBack" onClick={onBack}>← Назад</button>
        <button className="canvasPageSave" disabled title="Сохранение — Этап 4">
          Сохранить
        </button>
      </div>

      {showPanel && (
        <LessonFilesPanel
          files={files}
          syncing={syncing}
          onSync={syncToServer}
          onRemove={removeFile}
          onClose={() => setShowPanel(false)}
        />
      )}

      <CanvasBoard lessonId={lessonId} lessonFiles={files} onPickLessonFile={pickFile} />
    </div>
  )
}
