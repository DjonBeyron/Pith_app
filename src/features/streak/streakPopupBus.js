// Сигнал «пройден урок» — LessonPlayer живёт в другом дереве компонентов,
// чем окно наград (показывается поверх любой вкладки из ShellV2), поэтому
// используем простую шину вместо прокидывания пропсов через всё приложение
// (тот же паттерн, что raceBus.js у супергонки).
const subs = new Set()

export function signalLessonCompleted() {
  subs.forEach(fn => fn())
}

export function subscribeLessonCompleted(fn) {
  subs.add(fn)
  return () => subs.delete(fn)
}
