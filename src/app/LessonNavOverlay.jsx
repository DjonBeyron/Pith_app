import { useLessonNav } from './LessonNavContext.jsx'
import StandaloneLessonRunner from '../features/lessons/StandaloneLessonRunner.jsx'
import CurriculumView from '../features/lessons/CurriculumView.jsx'

// Полноэкранный слой поверх текущей вкладки — открывается переходом по ноде
// lesson_ref (пауза текущего урока) или закладкой отдельного урока в «Мои
// уроки». Сознательно не размонтирует то, что было открыто до него —
// оверлей просто перекрывает (см. план фичи): проще, чем городить paused-
// проп в LessonPlayer ради живого состояния под оверлеем.
export default function LessonNavOverlay() {
  const { overlay, handleExit } = useLessonNav()
  if (!overlay) return null

  return (
    <div className="lessonNavOverlay">
      {overlay.kind === 'lesson' ? (
        <StandaloneLessonRunner lessonId={overlay.lessonId} onExit={handleExit} />
      ) : (
        <CurriculumView
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
