import { useState } from 'react'
import { Lock, LockOpen, TriangleAlert, X } from 'lucide-react'

// Тап по закрытому уроку в схеме модуля. Два шага в одной карточке:
//   1. почему закрыт и чем полезна диагностика;
//   2. предупреждение, если человек всё-таки хочет открыть уроки без неё.
// Второй шаг отдельным экраном, а не мелким текстом под кнопкой: решение
// разом снимает замок со ВСЕХ уроков модуля, и прочитать это нужно до, а не
// после. Необратимым оно при этом не является — про это там же и сказано.
export default function LessonLockedHint({ onClose, onUnlock }) {
  const [warning, setWarning] = useState(false)

  if (warning) {
    return (
      <div className="lessonLockedOverlay" onClick={onClose}>
        <div className="lessonLockedCard" onClick={e => e.stopPropagation()}>
          <button className="lessonLockedClose" onClick={onClose}><X size={16} /></button>
          <div className="lessonLockedIcon lessonLockedIcon--warn"><TriangleAlert size={22} /></div>
          <h3 className="lessonLockedTitle">Открыть без диагностики?</h3>
          <p className="lessonLockedText">
            Откроются <b>все уроки модуля</b> сразу. Но мы не узнаем твои слабые
            места: у уроков не будет подсказки, какой из них тебе важнее, и
            учиться придётся вслепую.
          </p>
          <p className="lessonLockedText lessonLockedText--calm">
            Диагностику можно пройти и позже — она останется в начале схемы.
          </p>
          <button className="lessonLockedOkBtn lessonLockedOkBtn--warn" onClick={onUnlock}>
            Всё равно разблокировать
          </button>
          <button className="lessonLockedGhostBtn" onClick={() => setWarning(false)}>
            Назад
          </button>
        </div>
      </div>
    )
  }

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
        <button className="lessonLockedGhostBtn" onClick={() => setWarning(true)}>
          <LockOpen size={14} /> Разблокировать без диагностики
        </button>
      </div>
    </div>
  )
}
