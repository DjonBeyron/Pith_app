// Ключ localStorage-черновика канваса (CanvasBoard.jsx) — вынесен в отдельный
// файл, а не экспортирован прямо из CanvasBoard.jsx, чтобы не ломать Fast
// Refresh (react-refresh/only-export-components: файл компонента должен
// экспортировать только компонент). CanvasPage.jsx чистит этот ключ сразу
// после успешного сохранения — иначе редактор навсегда показывал бы черновик
// вместо настоящих данных сервера, см. handleSave в CanvasPage.jsx
export const canvasLsKey = id => `lesson_canvas_${id}`

// Позиция обзора холста (offset/scale) — отдельно от черновика нод выше:
// должна помнить, где мы были, независимо от несохранённых правок, и НЕ
// стирается после успешного сохранения (CanvasPage.handleSave чистит
// только canvasLsKey — см. там же)
export const canvasViewKey = id => `lesson_canvas_view_${id}`

// Есть ли локальный черновик правок этого урока — то же самое, что «есть
// несохранённое»: черновик пишется на любую правку нод и стирается после
// успешного сохранения на сервер
export function hasCanvasDraft(lessonId) {
  if (!lessonId) return false
  try { return localStorage.getItem(canvasLsKey(lessonId)) != null } catch { return false }
}
