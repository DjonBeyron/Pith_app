const KEY = 'pithy_completed_v1'

export function getCompletedLessons() {
  try { return new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]')) }
  catch { return new Set() }
}

export function markLessonCompleted(lessonId) {
  const set = getCompletedLessons()
  set.add(lessonId)
  localStorage.setItem(KEY, JSON.stringify([...set]))
}

// Снимает отметки «пройдено» с указанных уроков (админский сброс для разработки).
export function unmarkLessons(lessonIds) {
  const set = getCompletedLessons()
  lessonIds.forEach(id => set.delete(id))
  localStorage.setItem(KEY, JSON.stringify([...set]))
}
