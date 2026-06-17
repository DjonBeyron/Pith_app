import CanvasBoard from './CanvasBoard.jsx'

// Full-screen lesson editor. Opens on top of the tab layout (no router needed —
// App.jsx swaps the whole render tree when canvasLessonId is set).
// lessonId: used in Stage 4 (save/load). Kept in props so App.jsx doesn't change.
// eslint-disable-next-line no-unused-vars
export default function CanvasPage({ lessonId, onBack }) {
  return (
    <div className="canvasPage">
      <div className="canvasPageHeader">
        {/* Stage 4: lesson settings (title, file picker per node) */}
        <button className="canvasSettingsBtn" title="Настройки урока (скоро)">⚙</button>
        <span className="canvasPageSpacer" />
        <button className="canvasPageBack" onClick={onBack}>← Назад</button>
        <button className="canvasPageSave" disabled title="Сохранение — Этап 4">
          Сохранить
        </button>
      </div>

      <CanvasBoard />
    </div>
  )
}
