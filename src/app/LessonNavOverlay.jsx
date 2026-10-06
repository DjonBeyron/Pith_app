import { useState } from 'react'
import { useLessonNav } from './LessonNavContext.jsx'
import StandaloneLessonRunner from '../features/lessons/StandaloneLessonRunner.jsx'
import CurriculumView from '../features/lessons/CurriculumView.jsx'

// Полноэкранный слой поверх текущей вкладки — открывается переходом по ноде
// lesson_ref (пауза текущего урока) или закладкой отдельного урока в «Мои
// уроки». Сознательно не размонтирует то, что было открыто до него —
// оверлей просто перекрывает (см. план фичи): проще, чем городить paused-
// проп в LessonPlayer ради живого состояния под оверлеем.
// key по id урока/модуля: смена урока в слое (ещё один lesson_ref, возврат по
// стеку) даёт свежий экземпляр, а не прежний плеер с чужим состоянием.
export default function LessonNavOverlay() {
  const { overlay, handleExit } = useLessonNav()
  // Пока показана только карточка «Начать урок», слой прозрачный: под ней
  // должен просвечивать экран, с которого урок открыли («Мои уроки»), —
  // затемняет его сама карточка. Сплошной фон слоя давал вместо этого чёрный
  // прямоугольник. Как только урок пошёл, фон возвращается: под плеером
  // ничего просвечивать не должно
  const [started, setStarted] = useState(false)
  // Смена урока/модуля в слое — снова карточка запуска, снова прозрачный фон
  // (подстройка состояния при смене входа — в рендере, как советует React)
  const overlayKey = overlay ? (overlay.lessonId ?? overlay.moduleId ?? null) : null
  const [prevKey, setPrevKey] = useState(overlayKey)
  if (overlayKey !== prevKey) { setPrevKey(overlayKey); setStarted(false) }
  if (!overlay) return null

  return (
    <div className={`lessonNavOverlay${overlay.kind === 'lesson' && !started ? ' lessonNavOverlay--launch' : ''}`}>
      {overlay.kind === 'lesson' ? (
        <StandaloneLessonRunner key={overlay.lessonId} lessonId={overlay.lessonId} lessonTitle={overlay.lessonTitle} onExit={handleExit} onStarted={() => setStarted(true)} />
      ) : (
        <CurriculumView
          key={overlay.moduleId}
          curriculumId={overlay.moduleId}
          curriculumTitle={overlay.moduleTitle}
          onBack={handleExit}
          onOpenCanvas={() => {}}
          onOpenProduction={() => {}}
        />
      )}
    </div>
  )
}
