import { useState } from 'react'
import { useAdmin } from '../../app/AdminContext.jsx'
import { resetLessonsDone } from '../../shared/lib/adminTestCompletion.js'

// Вкладка «Пройденные»: модули целиком (как раньше) или отдельные уроки —
// оба «пройдены навсегда», просто разный масштаб просмотра истории
// (архитектура библиотеки в прямом и косвенном стиле). Вынесено из
// ProfileV2.jsx — тот упирался в мягкий потолок размера.
//
// onReload — перечитать doneMods/doneLessons после теста «сбросить пройден»
// (useProfileV2Data.load не реактивен на completedLessons.js, дёргаем сами)
export default function ProfileDoneTab({ doneMods, doneLessons, onOpenModule, onOpenLesson, onReload }) {
  const [view, setView] = useState('modules') // modules | lessons
  const { isAdmin } = useAdmin()

  function resetModule(e, m) {
    e.stopPropagation()
    if (!window.confirm(`Тест: сбросить «пройден» у всего модуля «${m.title}»?`)) return
    resetLessonsDone(m.lessonIds)
    onReload()
  }
  function resetLesson(e, l) {
    e.stopPropagation()
    if (!window.confirm(`Тест: сбросить «пройден» у урока «${l.title}»?`)) return
    resetLessonsDone([l.id])
    onReload()
  }

  return (
    <>
      <div className="pvSubTabs">
        <button className={view === 'modules' ? 'pvSubTab pvSubTabActive' : 'pvSubTab'} onClick={() => setView('modules')}>Модули</button>
        <button className={view === 'lessons' ? 'pvSubTab pvSubTabActive' : 'pvSubTab'} onClick={() => setView('lessons')}>Уроки</button>
      </div>
      {view === 'modules' ? (
        doneMods.length === 0
          ? <div className="pvEmpty">Пройди модуль до конца — он появится здесь</div>
          : doneMods.map(m => (
            <div key={m.id} className="pvRowShell">
              <button className="pvWord pvModRow" onClick={() => onOpenModule(m)}>
                <span className="pvWordText">{m.title}</span>
                <span className="pvWordFrom">пройден</span>
              </button>
              {isAdmin && (
                <button className="pvRowAdminReset" title="Тест: сбросить «пройден» (без начисления/списания XP)"
                  onClick={e => resetModule(e, m)}>⟲</button>
              )}
            </div>
          ))
      ) : (
        doneLessons.length === 0
          ? <div className="pvEmpty">Пройди урок до конца — он появится здесь</div>
          : doneLessons.map(l => (
            <div key={l.id} className="pvRowShell">
              {/* Тап — пересдать урок напрямую (не через модуль, даже если он у него есть) */}
              <button className="pvWord pvModRow" onClick={() => onOpenLesson(l.id)}>
                <span className="pvWordText">{l.title}</span>
                <span className="pvWordFrom">{l.moduleTitle ?? 'отдельный урок'}</span>
              </button>
              {isAdmin && (
                <button className="pvRowAdminReset" title="Тест: сбросить «пройден» (без начисления/списания XP)"
                  onClick={e => resetLesson(e, l)}>⟲</button>
              )}
            </div>
          ))
      )}
    </>
  )
}
