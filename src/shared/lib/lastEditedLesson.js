// Последний урок, который админ открывал в канвасе. Живёт в localStorage,
// поэтому переживает перезагрузку страницы: при следующем запуске приложения
// всплывашка предлагает вернуться к нему (ResumeEditingToast.jsx).
const KEY = 'pithy_last_edited_lesson'

export function setLastEditedLesson(lesson) {
  if (!lesson?.id) return
  try {
    localStorage.setItem(KEY, JSON.stringify({
      id: lesson.id,
      title: (lesson.title ?? '').trim(),
      at: Date.now(),
    }))
  } catch { /* приватный режим/переполнение — не повод падать */ }
}

export function getLastEditedLesson() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const v = JSON.parse(raw)
    return v?.id ? v : null
  } catch {
    return null
  }
}

export function clearLastEditedLesson() {
  try { localStorage.removeItem(KEY) } catch { /* см. выше */ }
}
