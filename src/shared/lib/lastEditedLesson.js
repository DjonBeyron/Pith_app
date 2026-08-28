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
      // Модуль урока — чтобы «назад» из канваса возвращало в схему модуля, а
      // не на главный экран (ShellV2). Может отсутствовать, если урок открыли
      // не из схемы модуля
      module: lesson.module?.id ? lesson.module : null,
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

// Дописать модуль к уже сохранённой записи (её нашли позже, по lesson_ids):
// сам урок и время правки при этом не трогаем
export function updateLastEditedModule(lessonId, module) {
  const cur = getLastEditedLesson()
  if (!cur || cur.id !== lessonId || !module?.id) return
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...cur, module }))
  } catch { /* см. выше */ }
}

export function clearLastEditedLesson() {
  try { localStorage.removeItem(KEY) } catch { /* см. выше */ }
}
