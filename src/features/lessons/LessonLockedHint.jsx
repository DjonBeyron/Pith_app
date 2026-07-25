import { Lock, X } from 'lucide-react'

// Короткий попап при тапе на закрытый урок (не Финал) в схеме модуля:
// объясняет, что сначала нужна диагностика (первый шаг схемы).
export default function LessonLockedHint({ onClose }) {
  return (
    <div className="lessonLockedOverlay" onClick={onClose}>
      <div className="lessonLockedCard" onClick={e => e.stopPropagation()}>
        <button className="lessonLockedClose" onClick={onClose}><X size={16} /></button>
        <div className="lessonLockedIcon"><Lock size={22} /></div>
        <h3 className="lessonLockedTitle">Урок пока закрыт</h3>
        <p className="lessonLockedText">
          Сначала пройди быструю диагностику в начале схемы — она найдёт твои
          слабые места и откроет остальные уроки.
        </p>
        <button className="lessonLockedOkBtn" onClick={onClose}>Понятно</button>
      </div>
    </div>
  )
}
