import { useEffect } from 'react'
import { startIdlePrewarm } from '../shared/lib/idlePrewarm.js'
import { prefetchLessonPlayer } from '../features/player/lessonPlayerPrefetch.js'
import { loadReviewScreen } from '../features/review/reviewLaunch.js'

// Какие чанки греем после ленты (порядок = вероятность понадобиться):
// плеер урока (открывается из ленты чаще всего), экран повторения (вкладка
// «Моя память»), для админа — вкладка «Админ» и редактор канваса. Остальные
// вкладки (Память, Рейтинг, Профиль) живут в основном бандле и смонтированы с
// самого старта, им нечего догружать. Механика — shared/lib/idlePrewarm.js
export function useIdlePrewarm(isRealAdmin) {
  useEffect(() => {
    const tasks = [
      prefetchLessonPlayer,
      loadReviewScreen,
      ...(isRealAdmin ? [
        () => import('../features/admin/AdminV2.jsx'),
        () => import('../features/canvas/CanvasPage.jsx'),
      ] : []),
    ]
    return startIdlePrewarm(tasks)
  }, [isRealAdmin])
}
