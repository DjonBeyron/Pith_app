// Сигнал «данные гонки изменились» (админ создал/изменил/удалил гонку в
// AdminRaceTab). Баннер супергонки в Рейтинге живёт в другом дереве
// компонентов и сам не узнаёт об изменении в базе — без этого сигнала UI
// обновлялся только после полной перезагрузки приложения.
const subs = new Set()

export function notifyRaceChanged() {
  subs.forEach(fn => fn())
}

export function subscribeRaceChanged(fn) {
  subs.add(fn)
  return () => subs.delete(fn)
}
