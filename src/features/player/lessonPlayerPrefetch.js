// Загрузка чанка плеера урока (~370 КБ): плеер нужен только когда урок открыт,
// в стартовый бандл (ленту рекомендаций) он не входит. Чанк греется заранее:
// в простое после первой отрисовки ленты (ShellV2 → idlePrewarm.js) и при
// открытии карточки запуска урока (минимум 1.2 с каркаса — чанк успевает
// доехать до того, как плеер понадобится).
import { lazyRetry } from '../../shared/lib/lazyRetry.js'

// Для React.lazy (LessonPlayerLazy.jsx): с перезагрузкой страницы при чанке-
// сироте после деплоя — как у остальных ленивых экранов
export const loadLessonPlayer = () => lazyRetry(() => import('./LessonPlayer.jsx'), 'player')

let warmed = false
// Тихая предзагрузка: БЕЗ lazyRetry — упавшая фоновая догрузка не должна
// перезагружать страницу посреди ленты (настоящий import при открытии урока
// сам повторит и перезагрузит при нужде). Повторные вызовы ничего не делают
export function prefetchLessonPlayer() {
  if (warmed) return
  warmed = true
  import('./LessonPlayer.jsx').catch(() => { warmed = false })
}
