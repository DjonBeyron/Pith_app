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
