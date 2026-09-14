import { createPortal } from 'react-dom'
import SpeechLaneTimelineEditor from './SpeechLaneTimelineEditor.jsx'

// Полноэкранное окно тренажёра из ноды «Переверни телефон» — тот же оверлей,
// что у конструктора таблицы (table-editor-modal.css), но внутри сразу
// таймлайн: сетки у тренажёра нет. «Назад» в шапке таймлайна = сохранить:
// onSave получает поля ноды (file_id, waveformData, duration, timelineLen,
// timeline, audioClips, wordTimings). Клик по фону — закрыть без сохранения.
export default function SpeechLaneEditorModal({ tData, lessonFiles, onPickFile, onSave, onClose }) {
  return createPortal(
    <div className="tableEditorOverlay" onClick={onClose} onMouseDown={e => e.stopPropagation()}>
      <div className="tableEditorModal slModal" onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}>
        <SpeechLaneTimelineEditor
          fileId={tData.file_id ?? null}
          waveformData={tData.waveformData ?? null}
          duration={tData.duration ?? null}
          timelineLen={tData.timelineLen ?? null}
          timeline={tData.timeline ?? null}
          audioClips={tData.audioClips ?? null}
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
