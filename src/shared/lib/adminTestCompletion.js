import { markLessonCompleted } from './completedLessons.js'
import { clearLessonProgress } from './lessonProgressApi.js'

// Админ-инструмент для тестов: имитирует «урок пройден» БЕЗ реального
// начисления XP на сервере (в отличие от настоящего прохождения) — правит
// только локальный Set completedLessons.js, который весь фронтенд и так
// считает источником правды о «пройдено/не пройдено» в интерфейсе (сервер
// отдельно знает про начисленный XP через lesson_results/completeLesson —
// эта функция его не трогает). Чистит чекпойнт, если он был, — иначе
// «пройден» и «на паузе» смешались бы в «Мои уроки».
export function simulateLessonsDone(lessonIds) {
  lessonIds.forEach(id => {
    markLessonCompleted(id)
    clearLessonProgress(id)
  })
}
