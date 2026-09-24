import { useState } from 'react'
import { Lock, LockOpen, TriangleAlert, X } from 'lucide-react'

// Тап по закрытому уроку в схеме модуля. Два шага в одной карточке:
//   1. два равноправных пути — диагностика (советуем, главная кнопка сразу
//      её запускает) или открыть все уроки и выбирать самому. Без «сначала
//      пройди»: человек решает сам;
//   2. что именно изменится, если открыть уроки без диагностики.
// Второй шаг отдельным экраном, а не мелким текстом под кнопкой: решение
// разом снимает замок со ВСЕХ уроков модуля, и прочитать это нужно до, а не
// после. Необратимым оно при этом не является — про это там же и сказано.
//
// Оба шага всегда в разметке и лежат друг на друге (одна ячейка сетки):
// высота карточки — по большему из них, при переключении не скачет.
// Невидимый шаг — inert: его кнопки не ловят ни тап, ни фокус.
export default function LessonLockedHint({ onClose, onUnlock, onDiagnostics }) {
  const [warning, setWarning] = useState(false)

  return (
    <div className="lessonLockedOverlay" onClick={onClose}>
      <div className="lessonLockedCard" onClick={e => e.stopPropagation()}>
        <button className="lessonLockedClose" onClick={onClose}><X size={16} /></button>
        <div className="lessonLockedSteps">
          <div className={warning ? 'lessonLockedStep lessonLockedStep--off' : 'lessonLockedStep'} inert={warning}>
            <div className="lessonLockedIcon"><Lock size={22} /></div>
            <h3 className="lessonLockedTitle">Как открыть уроки</h3>
            <p className="lessonLockedText">
              Можно пройти короткую диагностику — она найдёт твои слабые места
              и подскажет, какие уроки тебе важнее. А можно открыть все уроки
              сразу и выбирать самому.
            </p>
            <div className="lessonLockedActions">
              <button className="lessonLockedOkBtn" onClick={onDiagnostics}>Пройти диагностику</button>
              <button className="lessonLockedGhostBtn" onClick={() => setWarning(true)}>
                <LockOpen size={14} /> Открыть все уроки сразу
              </button>
            </div>
          </div>

          <div className={warning ? 'lessonLockedStep' : 'lessonLockedStep lessonLockedStep--off'} inert={!warning}>
            <div className="lessonLockedIcon lessonLockedIcon--warn"><TriangleAlert size={22} /></div>
            <h3 className="lessonLockedTitle">Открыть все уроки?</h3>
            <p className="lessonLockedText">
              Откроются <b>все уроки модуля</b>. Только без подсказок, какой из
              них тебе важнее, — их даёт диагностика.
            </p>
            <p className="lessonLockedText lessonLockedText--calm">
              Её можно пройти в любой момент — она останется в начале схемы.
            </p>
            <div className="lessonLockedActions">
              <button className="lessonLockedOkBtn lessonLockedOkBtn--warn" onClick={onUnlock}>
                Открыть уроки
              </button>
              <button className="lessonLockedGhostBtn" onClick={() => setWarning(false)}>
                Назад
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
