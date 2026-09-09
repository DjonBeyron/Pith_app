// Мини pub/sub, чтобы открыть дебаг-панель кнопкой из шапки урока
// (PlayerTopBar.jsx), не давая DebugToolbar.jsx самому знать о плеере —
// тулбар остаётся общим для всех экранов (лента/канвас/админка/плеер).
const listeners = new Set()

export function onDebugToolbarOpen(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function openDebugToolbar() {
  listeners.forEach(fn => fn())
}
