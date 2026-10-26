import { createPortal } from 'react-dom'
import WordLaneTimelineEditor from './WordLaneTimelineEditor.jsx'

// Окно таймлайна игры «Повтори за диктором» — тот же оверлей, что у конструктора таблицы (table-editor-modal.css), внутри сразу таймлайн.
// «Назад» в шапке таймлайна = сохранить: onSave получает поля ноды (file_id, waveformData, duration, timelineLen, fills). Клик по фону — закрыть без сохранения.
export default function WordLaneEditorModal({ tData, lessonFiles, onPickFile, onSave, onClose }) {
  return createPortal(
    <div className="tableEditorOverlay" onClick={onClose} onMouseDown={e => e.stopPropagation()}>
      <div className="tableEditorModal" onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}>
        <WordLaneTimelineEditor
          word={tData.word ?? ''}
          fileId={tData.file_id ?? null}
          waveformData={tData.waveformData ?? null}
          duration={tData.duration ?? null}
          timelineLen={tData.timelineLen ?? null}
          fills={tData.fills ?? null}
          wordTimings={tData.wordTimings ?? null}
          lessonFiles={lessonFiles}
          onPickFile={onPickFile}
          onBack={data => { onSave(data); onClose() }}
        />
      </div>
    </div>,
    document.body,
  )
}
